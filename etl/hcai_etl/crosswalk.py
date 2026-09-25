"""Map non-HCAI facility identifiers onto HCAI facility numbers.

Sources outside HCAI key hospitals differently:
  * CDPH (infection data) uses its ELMS facility ID, e.g. 930000004,
  * CMS (Care Compare) uses the Medicare CCN, e.g. 050625,
while the app joins everything on HCAI's 9-digit facility number (106190555).

CDPH publishes the join: its Licensed and Certified Healthcare Facility Listing
carries ELMS FACID, CCN, license number and HCAI_ID side by side, and the
ELMS–OSHPD crosswalk adds facilities that have since closed. A facility whose own
HCAI ID isn't one the app knows is usually a campus reported under a parent's
license (Hoag Irvine, CPMC Davies); like the utilization pipeline, we roll it up
to the parent — first CDPH's parent facility, then the one hospital on the same
license that the app has.
"""

from __future__ import annotations

import difflib
import json
from dataclasses import dataclass, field

import pandas as pd

from .core import PROCESSED_DIR, RAW_DIR, Resource, ckan_package, download

LOCATIONS_PACKAGE = "healthcare-facility-locations"
LOCATIONS_RESOURCE = "Licensed and Certified Healthcare Facility Locations"
CROSSWALK_PACKAGE = "licensed-facility-crosswalk"
CROSSWALK_RESOURCE = "ELMS-OSHPD - Licensed and Certified Healthcare Facility Crosswalk"


def app_facility_ids() -> set[str]:
    """HCAI facility numbers the app knows (from the already-built HCAI datasets)."""
    ids: set[str] = set()
    for dataset in ("hafd-selected", "hau"):
        path = PROCESSED_DIR / dataset / "facilities.json"
        if path.exists():
            ids |= {f["id"] for f in json.loads(path.read_text(encoding="utf-8"))}
    if not ids:
        raise RuntimeError("Build the HCAI datasets (hafd-selected, hau) before sources that map onto them.")
    return ids


def _resource(package: str, name: str) -> Resource:
    pkg = ckan_package(package)
    for res in pkg["resources"]:
        if res.get("name", "").strip() == name:
            return Resource(name=name, url=res["url"], format=res.get("format", ""))
    raise RuntimeError(f"Resource {name!r} not found in CKAN package {package}")


def _pad(value, width: int) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    value = value.strip()
    return value.zfill(width) if value.isdigit() else value


@dataclass
class FacilityCrosswalk:
    """ELMS FACID / CCN -> HCAI facility number the app knows."""

    rows: pd.DataFrame
    app_ids: set[str]
    sources: list[dict] = field(default_factory=list)

    @classmethod
    def load(cls, refresh: bool = False) -> "FacilityCrosswalk":
        raw = RAW_DIR / "crosswalk"
        loc_res = _resource(LOCATIONS_PACKAGE, LOCATIONS_RESOURCE)
        cw_res = _resource(CROSSWALK_PACKAGE, CROSSWALK_RESOURCE)
        loc = pd.read_csv(download(loc_res, raw, refresh), dtype=str)
        cw = pd.read_excel(download(cw_res, raw, refresh), dtype=str)
        cols = ["FACID", "LICENSE_NUMBER", "HCAI_ID", "CCN", "FACNAME", "PARENT_FACID"]
        loc = loc[cols]
        cw = cw.rename(columns={"ELMS_FACID": "FACID", "ELMS_PARENT_FACID": "PARENT_FACID"})[cols]
        # The current listing wins; the older crosswalk fills in closed facilities.
        rows = pd.concat([loc, cw], ignore_index=True)
        rows["FACID"] = rows["FACID"].map(lambda v: _pad(v, 9))
        rows["PARENT_FACID"] = rows["PARENT_FACID"].map(lambda v: _pad(v, 9))
        rows["HCAI_ID"] = rows["HCAI_ID"].map(lambda v: _pad(v, 9))
        rows["CCN"] = rows["CCN"].map(lambda v: _pad(v, 6))
        rows = rows.dropna(subset=["FACID"]).drop_duplicates("FACID")
        sources = [{"name": r.name, "url": r.url} for r in (loc_res, cw_res)]
        return cls(rows=rows.reset_index(drop=True), app_ids=app_facility_ids(), sources=sources)

    def __post_init__(self) -> None:
        self._by_facid = {r.FACID: r for r in self.rows.itertuples()}
        self._by_license: dict[str, set[str]] = {}
        for r in self.rows.itertuples():
            if isinstance(r.LICENSE_NUMBER, str) and r.HCAI_ID in self.app_ids:
                self._by_license.setdefault(r.LICENSE_NUMBER, set()).add(r.HCAI_ID)

    def from_facid(self, facid) -> str | None:
        """HCAI facility number for a CDPH ELMS facility ID, rolled up to its parent when needed."""
        row = self._by_facid.get(_pad(str(facid), 9) if facid is not None else None)
        if row is None:
            return None
        if row.HCAI_ID in self.app_ids:
            return row.HCAI_ID
        parent = self._by_facid.get(row.PARENT_FACID)
        if parent is not None and parent.HCAI_ID in self.app_ids:
            return parent.HCAI_ID
        siblings = self._by_license.get(row.LICENSE_NUMBER, set())
        return next(iter(siblings)) if len(siblings) == 1 else None

    def cdph_names(self, hcai_id: str) -> list[str]:
        """CDPH's licensed names for an HCAI facility (often newer than HCAI's report names)."""
        return [r.FACNAME for r in self.rows.itertuples() if r.HCAI_ID == hcai_id and isinstance(r.FACNAME, str)]

    def ccn_groups(self) -> dict[str, list[str]]:
        """CCN -> every app hospital certified under it.

        Usually one. Some systems certify several separately licensed hospitals
        under one Medicare number (UCI Health; Alameda Health System), and CMS then
        reports one combined score for all of them.
        """
        out: dict[str, set[str]] = {}
        for r in self.rows.itertuples():
            if isinstance(r.CCN, str):
                hcai = self.from_facid(r.FACID)
                if hcai:
                    out.setdefault(r.CCN, set()).add(hcai)
        return {ccn: sorted(ids) for ccn, ids in out.items()}


def app_facilities() -> dict[str, dict]:
    """HCAI facility number -> {name, zip} for every hospital the app knows."""
    out: dict[str, dict] = {}
    for dataset in ("hafd-selected", "hau"):
        path = PROCESSED_DIR / dataset / "facilities.json"
        for f in json.loads(path.read_text(encoding="utf-8")):
            entry = out.setdefault(f["id"], {"name": f["name"], "zip": None})
            entry["zip"] = entry["zip"] or (str(f.get("zip"))[:5] if f.get("zip") else None)
            if dataset == "hau":
                entry["name"] = f["name"]
    return out


def match_ccns(
    crosswalk: FacilityCrosswalk, ccns, cms_names: dict[str, str], cms_zips: dict[str, str]
) -> tuple[dict[str, str], dict[str, dict], list[dict]]:
    """Map CMS CCNs onto app hospitals.

    Returns (ccn -> HCAI id, hospitals reported under another's CCN, CCNs matched on ZIP + name).
    Where one CCN covers several licensed hospitals, CMS's figures go to the one whose name
    matches CMS's best; the others are "reported with" it.
    """
    groups = crosswalk.ccn_groups()
    facilities = app_facilities()
    similarity = lambda a, b: difflib.SequenceMatcher(None, a.lower(), b.lower()).ratio()  # noqa: E731

    def name_score(cms_name: str, hcai_id: str) -> float:
        candidates = [facilities.get(hcai_id, {}).get("name", "")] + crosswalk.cdph_names(hcai_id)
        return max(similarity(cms_name, n) for n in candidates if n)

    ccn_to_hcai: dict[str, str] = {}
    shared: dict[str, dict] = {}
    for ccn in ccns:
        ids = groups.get(ccn)
        if not ids:
            continue
        main = ids[0] if len(ids) == 1 else max(ids, key=lambda i: name_score(str(cms_names.get(ccn, "")), i))
        ccn_to_hcai[ccn] = main
        for other in ids:
            if other != main:
                shared[other] = {"ccn": ccn, "reportedWith": main, "reportedWithName": facilities[main]["name"]}

    # Fallback for CCNs missing from CDPH's current listing (retired after an
    # ownership change): same ZIP code and a close name.
    taken = set(ccn_to_hcai.values()) | set(shared)
    by_name: list[dict] = []
    for ccn in ccns:
        if ccn in ccn_to_hcai or ccn not in cms_zips:
            continue
        cms_name = str(cms_names.get(ccn, ""))
        best, score = None, 0.0
        for hcai_id, f in facilities.items():
            if f.get("zip") != cms_zips[ccn]:
                continue
            s = name_score(cms_name, hcai_id)
            if s > score:
                best, score = hcai_id, s
        if best and score >= 0.6:
            ccn_to_hcai[ccn] = best
            by_name.append({"ccn": ccn, "cmsName": cms_name, "hcaiId": best, "name": facilities[best]["name"], "score": round(score, 2), "alsoHasCcn": best in taken})
    # A hospital that still reports under a CCN of its own isn't "reported with" anyone.
    shared = {k: v for k, v in shared.items() if k not in set(ccn_to_hcai.values())}
    return ccn_to_hcai, shared, by_name
