"""HCAI Licensed Healthcare Facility Listing: each hospital's state license status, to flag closed hospitals.

Source: the CHHS Open Data package "Licensed Healthcare Facility Listing" (published by HCAI from CDPH Licensing and
Certification data): the current listing plus the half-year snapshots (June 30 and December 31) back to 2016. It's keyed
by OSHPD ID, which is HCAI's facility number, so it joins the app's hospitals directly (no crosswalk).

What the listing can and can't say:
  * FACILITY_STATUS_DESC is Open, Suspense (license suspended: the facility isn't operating), or rarely Closed, with
    FACILITY_STATUS_DATE its effective date. There's no closure-date field: a closed facility usually goes to Suspense
    and then drops out of later listings (Adventist Health Feather River: Open through June 2019 even after the 2018
    Camp Fire, Suspense from 2019-09-30, gone from December 2020).
  * Dropping out is not proof of closure on its own: a hospital that moves to a new license or facility number (a new
    building, a merger into another hospital's license) disappears the same way while still "Open" (California Pacific
    Medical Center's California campus, Modoc Medical Center).
So a closure is recorded only with Suspense (or Closed) evidence: the current status, or the last status before the
hospital dropped out. Hospitals that dropped out while Open are recorded as unlisted, with no closure claim; the app
shows them only the outdated-data flag if their reports are old.

Run after the HCAI datasets (it keeps only hospitals the app knows).
"""

from __future__ import annotations

import csv
import re
from datetime import date, datetime

from ..core import Dataset, Resource, ckan_package, utc_now_iso, write_json
from ..crosswalk import app_facilities

PACKAGE = "licensed-healthcare-facility-listing"
MONTHS = {m: i for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"], 1)}
NOT_OPERATING = {"Suspense", "Closed"}


def _listing_date(res: dict) -> date | None:
    """The date a listing is as of: "..., June 30, 2026" in the name, or the current file's yyyymmdd."""
    m = re.search(r"(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),\s*(\d{4})", res.get("name", ""), re.I)
    if m:
        return date(int(m.group(3)), MONTHS[m.group(1).lower()], int(m.group(2)))
    m = re.search(r"(\d{4})(\d{2})(\d{2})\.csv$", res.get("url", ""))
    return date(int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else None


def _iso(raw: str | None) -> str | None:
    """Status dates come as 2019-09-30, 09/30/2019, or 9/30/2019."""
    raw = (raw or "").strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(raw[:10], fmt).date().isoformat()
        except ValueError:
            continue
    return None


class HcaiFacilityStatus(Dataset):
    id = "hcai-facility-status"
    title = "HCAI Licensed Healthcare Facility Listing: hospital license status"
    source_page = f"https://data.chhs.ca.gov/dataset/{PACKAGE}"

    def resources(self) -> list[Resource]:
        out = []
        for res in ckan_package(PACKAGE)["resources"]:
            if (res.get("format") or "").upper() != "CSV" or "dictionary" in res.get("name", "").lower():
                continue
            d = _listing_date(res)
            if d is None:
                raise RuntimeError(f"Can't tell the date of listing {res.get('name')!r} ({res.get('url')})")
            out.append(Resource(res["name"], res["url"], "CSV", tags={"date": d.isoformat(), "current": res["name"].lower().startswith("current")}))
        if not any(r.tags["current"] for r in out):
            raise RuntimeError("No current listing in the package; its layout changed.")
        return sorted(out, key=lambda r: r.tags["date"])

    def load(self, files):
        self.sources = [{"name": res.name, "url": res.url} for res, _ in files]
        listings = []
        for res, path in files:
            with open(path, encoding="latin1", newline="") as f:
                rows = list(csv.DictReader(f))
            need = {"OSHPD_ID", "FACILITY_STATUS_DESC", "FACILITY_STATUS_DATE"}
            if not rows or need - set(rows[0]):
                raise RuntimeError(f"{res.name}: missing columns {need - set(rows[0] if rows else [])}")
            by_id = {r["OSHPD_ID"].strip().zfill(9): r for r in rows if r["OSHPD_ID"].strip()}
            listings.append((res.tags["date"], res.tags["current"], by_id))
        return listings

    def build(self, listings) -> None:
        listings.sort(key=lambda x: x[0])
        current_date, _, current = next(x for x in reversed(listings) if x[1])
        snapshots = [x for x in listings if not x[1]]
        # The current file can be newer than the last snapshot; either way, "last seen" runs through every listing.
        timeline = sorted(snapshots + [(current_date, True, current)], key=lambda x: x[0])
        facilities = app_facilities()

        hospitals: dict[str, dict] = {}
        for hcai, f in facilities.items():
            row = current.get(hcai)
            if row is not None:
                status = row["FACILITY_STATUS_DESC"].strip()
                if status == "Open":
                    continue
                entry = {"listed": True, "status": status, "statusDate": _iso(row["FACILITY_STATUS_DATE"])}
                if status in NOT_OPERATING:
                    entry["closure"] = {"asOf": entry["statusDate"], "basis": "status", "status": status}
                hospitals[hcai] = entry
                continue
            seen = [(d, rows[hcai]) for d, _, rows in timeline if hcai in rows]
            if not seen:
                # Never on the listing (e.g. Kaiser's regional reporting entities, which aren't licensed facilities).
                hospitals[hcai] = {"listed": False, "everListed": False}
                continue
            last_date, last = seen[-1]
            after = [d for d, _, _ in timeline if d > last_date]
            status = last["FACILITY_STATUS_DESC"].strip()
            entry = {
                "listed": False,
                "everListed": True,
                "lastListed": last_date,
                "firstUnlisted": after[0] if after else None,
                "lastStatus": status,
                "lastStatusDate": _iso(last["FACILITY_STATUS_DATE"]),
            }
            if status in NOT_OPERATING:
                entry["closure"] = {"asOf": entry["lastStatusDate"], "basis": "status-then-unlisted", "status": status, "unlistedBy": entry["firstUnlisted"]}
            hospitals[hcai] = entry

        closed = {k: v for k, v in hospitals.items() if v.get("closure")}
        test = hospitals.get("106040875")
        print(f"  listing of {current_date}; {len(snapshots)} snapshots from {snapshots[0][0]}")
        print(f"  {len(closed)} app hospitals with closure evidence; {sum(1 for v in hospitals.values() if not v['listed'] and not v.get('closure'))} unlisted without it")
        print(f"  Adventist Health Feather River (106040875): {test}")
        write_json(self.out_dir / "status.json", hospitals)
        write_json(
            self.out_dir / "manifest.json",
            {
                "id": self.id,
                "title": self.title,
                "sourcePage": self.source_page,
                "listingDate": current_date,
                "snapshots": [d for d, _, _ in snapshots],
                "hospitals": len(facilities),
                "closureEvidence": len(closed),
                "sources": self.sources,
                "generatedAt": utc_now_iso(),
                "notes": [
                    "Only hospitals that aren't Open on the current listing are in status.json.",
                    "closure: the license is in Suspense (or Closed) now, or was when the hospital dropped off the listing; asOf is that status's effective date. Hospitals that dropped off while Open have no closure: the listing can't tell a closure from a new license number.",
                ],
            },
            compact=False,
        )
