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

drgs.json: each DRG in the data with its MDC (body system), for Benchmark's specialty view. A calendar year's cases
were grouped under two MS-DRG versions (the fiscal year starts October 1), and CMS retires and renumbers DRGs, so the
current Table 5 doesn't know every code in older data (the 2024 cases include spinal fusion DRGs 453-460, retired in
FY 2025). So this reads Table 5 of every fiscal year from the first data year to the newest final rule, takes each
code's MDC (checked to agree across versions), and records the last year's weight for codes since retired.
"""

from __future__ import annotations

import re

import pandas as pd
import requests

from ..core import USER_AGENT, Dataset, Resource, utc_now_iso, write_json
from ..crosswalk import FacilityCrosswalk, match_ccns
from .cms_ipps import _xlsx, final_rule_years, parse_table5, table5_url

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
        # Table 5 for every fiscal year from the first data year's (it starts the October before) to the newest rule.
        tables = [
            Resource(name=f"FY {fy} IPPS final rule Table 5", url=table5_url(fy), format="ZIP", tags={"table5": fy})
            for fy in range(min(years), max(final_rule_years()) + 1)
        ]
        return [by_year[y] for y in years] + tables

    def load(self, files):
        self.crosswalk = FacilityCrosswalk.load(self.refresh)
        frames = []
        self.table5_sources = [{"fiscalYear": res.tags["table5"], "url": res.url} for res, _ in files if "table5" in res.tags]
        self.table5 = {res.tags["table5"]: {d["code"]: d for d in parse_table5(_xlsx(path))} for res, path in files if "table5" in res.tags}
        files = [(res, path) for res, path in files if "table5" not in res.tags]
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
        drgs = self._drgs(sorted(matched["drg"].unique()), sorted(matched["year"].unique()))
        write_json(self.out_dir / "cases.json", cases)
        write_json(self.out_dir / "drgs.json", drgs)
        write_json(
            self.out_dir / "manifest.json",
            {
                "id": self.id,
                "title": self.title,
                "sourcePage": self.source_page,
                "years": sorted({int(y) for fac in cases.values() for y in fac}),
                "sources": self.sources,
                "crosswalk": self.crosswalk.sources,
                "table5": self.table5_sources,
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
                    "drgs.json: each DRG's MDC from IPPS Table 5 (the same in every fiscal year read), and for DRGs CMS has since retired, the weight in the last Table 5 that listed them.",
                ],
            },
            compact=False,
        )

    def _drgs(self, codes: list[str], years: list[int]) -> dict[str, dict]:
        """Each DRG in the data: its MDC and title, and its last weight when the newest Table 5 no longer has it."""
        newest = max(self.table5)
        out: dict[str, dict] = {}
        missing, conflicts = [], []
        for code in codes:
            seen = {fy: t[code] for fy, t in sorted(self.table5.items()) if code in t}
            # Only the versions a data year's discharges were grouped under must have it (Oct of Y-1 to Sep of Y+1).
            if not any(y <= fy <= y + 1 for fy in seen for y in years):
                missing.append(code)
                continue
            mdcs = {d["mdc"] for d in seen.values()}
            if len(mdcs) > 1:
                conflicts.append(f"{code}: {mdcs}")
            last_fy = max(seen)
            entry = {"mdc": seen[last_fy]["mdc"], "title": seen[last_fy]["title"]}
            if last_fy < newest:
                entry |= {"retiredAfter": last_fy, "lastWeight": seen[last_fy]["weight"]}
            out[code] = entry
        if missing:
            raise RuntimeError(f"DRGs in the data but in no Table 5 in effect for those years: {missing}")
        if conflicts:
            raise RuntimeError(f"DRGs whose MDC changed between Table 5 versions (can't assign one body system): {conflicts}")
        retired = {c: d for c, d in out.items() if "retiredAfter" in d}
        print(f"  {len(out)} DRGs; MDC agrees across FY {min(self.table5)}-{newest}; {len(retired)} retired since: {sorted(retired)}")
        return out
