"""CMS Medicare Inpatient Hospitals by Provider and Service: Medicare cases per MS-DRG.

Source: https://data.cms.gov/provider-summary-by-type-of-service/medicare-inpatient-hospitals/medicare-inpatient-hospitals-by-provider-and-service
One row per IPPS hospital (CMS CCN) and MS-DRG for a calendar year of discharges.

Used by Propose as a baseline: "this hospital had N Medicare cases in these DRGs". Not a
hospital metric and not a count of all patients:

  * Original Medicare (fee-for-service Part A) only: Medicare Advantage, Medi-Cal, and
    commercial patients aren't in it.
  * IPPS hospitals only; critical access, children's, and psychiatric hospitals aren't paid
    under IPPS and don't appear.
  * CMS leaves out any hospital-DRG row with fewer than 11 discharges, so a missing DRG means
    "0 to 10 cases", not zero.

CCNs are mapped to HCAI facility numbers the same way as Care Compare (crosswalk.match_ccns).
The CMS payment columns are left out on purpose: Propose's payment estimate comes from the
IPPS relative weights (cms-ipps), not from past claims.
"""

from __future__ import annotations

import re

import pandas as pd
import requests

from ..core import USER_AGENT, Dataset, Resource, utc_now_iso, write_json
from ..crosswalk import FacilityCrosswalk, match_ccns

CATALOG = "https://data.cms.gov/data.json"
TITLE = "Medicare Inpatient Hospitals - by Provider and Service"
STATE = "CA"


class CmsInpatient(Dataset):
    id = "cms-inpatient"
    title = "CMS Medicare Inpatient Hospitals by Provider and Service (cases per MS-DRG)"
    source_page = "https://data.cms.gov/provider-summary-by-type-of-service/medicare-inpatient-hospitals/medicare-inpatient-hospitals-by-provider-and-service"

    def resources(self) -> list[Resource]:
        resp = requests.get(CATALOG, headers={"User-Agent": USER_AGENT}, timeout=120)
        resp.raise_for_status()
        dataset = next((d for d in resp.json()["dataset"] if d["title"] == TITLE), None)
        if dataset is None:
            raise RuntimeError(f"{TITLE!r} not found in the data.cms.gov catalog")
        by_year: dict[int, Resource] = {}
        for dist in dataset.get("distribution", []):
            url = dist.get("downloadURL") or ""
            match = re.search(r":\s*(\d{4})-\d{2}-\d{2}$", dist.get("title", ""))
            if dist.get("mediaType") != "text/csv" or not match:
                continue
            # The title's date is the data year's start or end, depending on the release.
            year = int(match.group(1))
            by_year[year] = Resource(name=dist["title"], url=url, format="CSV", tags={"year": year})
        years = self.years or [max(by_year)]
        missing = [y for y in years if y not in by_year]
        if missing:
            raise RuntimeError(f"No CSV for data year(s) {missing}; available: {sorted(by_year)}")
        return [by_year[y] for y in years]

    def load(self, files):
        self.crosswalk = FacilityCrosswalk.load(self.refresh)
        frames = []
        for res, path in files:
            df = pd.read_csv(path, dtype=str, encoding="latin1")
            df.columns = [c.strip() for c in df.columns]
            expected = {"Rndrng_Prvdr_CCN", "Rndrng_Prvdr_Org_Name", "Rndrng_Prvdr_State_Abrvtn", "Rndrng_Prvdr_Zip5", "DRG_Cd", "Tot_Dschrgs"}
            missing = expected - set(df.columns)
            if missing:
                raise RuntimeError(f"{res.name}: missing columns {sorted(missing)}; the layout changed.")
            df = df[df["Rndrng_Prvdr_State_Abrvtn"] == STATE].copy()
            df["year"] = res.tags["year"]
            frames.append(df)
            print(f"  {res.tags['year']}: {len(df):,} California hospital-DRG rows")
        self.sources = [{"year": r.tags["year"], "name": r.name, "url": r.url} for r, _ in files]
        return pd.concat(frames, ignore_index=True)

    def build(self, df: pd.DataFrame) -> None:
        df["ccn"] = df["Rndrng_Prvdr_CCN"].str.strip().str.zfill(6)
        df["drg"] = df["DRG_Cd"].str.strip().str.zfill(3)
        df["cases"] = pd.to_numeric(df["Tot_Dschrgs"], errors="coerce")
        latest = df.sort_values("year").drop_duplicates("ccn", keep="last")
        names = dict(zip(latest["ccn"], latest["Rndrng_Prvdr_Org_Name"].str.strip()))
        zips = dict(zip(latest["ccn"], latest["Rndrng_Prvdr_Zip5"].str.strip().str.zfill(5)))
        ccn_to_hcai, shared, by_name = match_ccns(self.crosswalk, df["ccn"].unique(), names, zips)

        matched = df[df["ccn"].isin(ccn_to_hcai)].copy()
        matched["hcai"] = matched["ccn"].map(ccn_to_hcai)
        # Two CCNs can land on one hospital (an old and a new number in the same year): add them up.
        totals = matched.groupby(["hcai", "year", "drg"])["cases"].sum()
        cases: dict[str, dict[str, dict[str, int]]] = {}
        for (hcai, year, drg), n in totals.items():
            cases.setdefault(hcai, {}).setdefault(str(year), {})[drg] = int(n)

        unmatched = sorted(set(names) - set(ccn_to_hcai))
        write_json(self.out_dir / "cases.json", cases)
        write_json(
            self.out_dir / "manifest.json",
            {
                "id": self.id,
                "title": self.title,
                "sourcePage": self.source_page,
                "years": sorted({int(y) for fac in cases.values() for y in fac}),
                "sources": self.sources,
                "crosswalk": self.crosswalk.sources,
                "generatedAt": utc_now_iso(),
                "sharedReporting": shared,
                "coverage": {
                    "cmsHospitals": len(names),
                    "matchedHospitals": len(cases),
                    "matchedByNameAndZip": by_name,
                    "unmatched": [{"ccn": c, "name": names[c]} for c in unmatched],
                },
                "notes": [
                    "Discharges of Original Medicare (fee-for-service Part A) patients only; Medicare Advantage and other payers aren't included.",
                    "IPPS hospitals only. CMS omits any hospital-DRG pair with fewer than 11 discharges, so a missing DRG means 0 to 10 cases.",
                    "Data year is the calendar year of discharge.",
                ],
            },
            compact=False,
        )
