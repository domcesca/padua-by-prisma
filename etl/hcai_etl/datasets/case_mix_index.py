"""HCAI Case Mix Index (CMI) by hospital.

Source: https://data.chhs.ca.gov/dataset/case-mix-index ("Case Mix Index-1996-2025"
workbook): one row per facility, one column per year (FY2008 on, CY1996–CY2007).

CMI is the average Medicare MS-DRG weight of a hospital's inpatient discharges
(sum of weights ÷ discharges), from HCAI's Patient Discharge Data. From 2008 it's
calculated on the federal fiscal year (October 1 – September 30); "FY2024" ends
September 2024 and is filed under 2024.

  * IDs. `oshpd_id` drops the "106" prefix and leading zero (10735 is 106010735).
  * Campuses. HCAI calculates CMI per facility, so a campus that files its own
    utilization report (UCSF Mission Bay, CPMC Davies, ...) has its own CMI. The
    app rolls campuses up to the parent on the license, so the license's CMI is
    the discharge-weighted average of its campuses' CMIs (exact if the weights
    are the discharges CMI was computed from). Weights come from each campus's
    Annual Utilization Report discharges for the calendar year the fiscal year
    ends in (the newest utilization year for fiscal years past it), and the same
    year's campus-to-license mapping.
"""

from __future__ import annotations

import re

import pandas as pd

from ..core import Dataset, Resource, ckan_package, download, utc_now_iso, write_json
from ..dictionary import case_mix_index as dictionary
from ..facility import display_name
from .hau import HospitalUtilization

PACKAGE = "case-mix-index"
DEFAULT_FIRST_YEAR = 2019


def hcai_id(oshpd_id) -> str:
    return f"106{int(oshpd_id):06d}"


class CaseMixIndex(Dataset):
    id = "case-mix-index"
    title = "HCAI Case Mix Index"
    ckan_package = PACKAGE
    source_page = f"https://data.chhs.ca.gov/dataset/{PACKAGE}"

    def resources(self) -> list[Resource]:
        pkg = ckan_package(PACKAGE)
        self.package_meta = {"title": pkg.get("title"), "metadata_modified": pkg.get("metadata_modified")}
        for res in pkg["resources"]:
            if res.get("format", "").upper() == "XLSX" and res.get("name", "").lower().startswith("case mix index"):
                return [Resource(name=res["name"].strip(), url=res["url"], format="XLSX")]
        raise RuntimeError(f"No Case Mix Index workbook in {PACKAGE}")

    def load(self, files):
        (res, path), = files
        wide = pd.read_excel(path)
        missing = {"oshpd_id", "Hospital"} - set(wide.columns)
        year_cols = {c: int(m.group(1)) for c in wide.columns if (m := re.fullmatch(r"FY(\d{4})", str(c).strip()))}
        if missing or not year_cols:
            raise RuntimeError(f"Case Mix Index workbook layout changed (missing {sorted(missing) or 'FYyyyy columns'}).")
        self.sources = [{"name": res.name, "url": res.url}]
        first = min(self.years) if self.years else DEFAULT_FIRST_YEAR
        long = (
            wide.assign(id=wide["oshpd_id"].map(hcai_id), name=wide["Hospital"].astype(str).str.strip())
            .melt(id_vars=["id", "name"], value_vars=list(year_cols), var_name="col", value_name="cmi")
            .dropna(subset=["cmi"])
        )
        long["year"] = long["col"].map(year_cols)
        return long[long["year"] >= first][["id", "name", "year", "cmi"]]

    # -- campus weights from the utilization report ------------------------------ #

    def _campus_weights(self) -> pd.DataFrame:
        """FAC_NO, ENTITY (parent on the license), YEAR, discharges — one row per campus-year."""
        hau = HospitalUtilization(refresh=False)
        files = [(r, download(r, hau.raw_dir)) for r in hau.resources()]
        reports = hau.load(files)
        reports["ENTITY"] = hau._entities(reports)
        reports["discharges"] = pd.to_numeric(reports["TOT_DISCHARGES"], errors="coerce")
        return (
            reports.groupby(["FAC_NO", "ENTITY", "YEAR"], as_index=False)["discharges"].sum(min_count=1)
            .rename(columns={"FAC_NO": "id", "ENTITY": "entity", "YEAR": "hauYear"})
        )

    def build(self, cmi: pd.DataFrame) -> None:
        weights = self._campus_weights()
        hau_years = sorted(weights["hauYear"].unique())
        cmi["hauYear"] = cmi["year"].clip(upper=hau_years[-1])
        df = cmi.merge(weights, on=["id", "hauYear"], how="left")
        df["entity"] = df["entity"].fillna(df["id"])
        names = dict(zip(cmi["id"], cmi["name"]))

        metrics: dict[str, dict[str, dict]] = {}
        combined = 0
        for (entity, year), g in df.groupby(["entity", "year"]):
            weighted = g[g["discharges"] > 0]
            if len(g) > 1 and len(weighted) == len(g):
                value = float((weighted["cmi"] * weighted["discharges"]).sum() / weighted["discharges"].sum())
                note = "Combines the CMI of the campuses on this license, weighted by each campus's discharges: " + ", ".join(
                    display_name(names[i]) for i in g["id"] if i != entity
                ) + "."
                combined += 1
            else:
                # One facility, or a campus without discharges to weight by: the parent's own figure.
                own = g[g["id"] == entity]
                if own.empty:
                    continue
                value = float(own["cmi"].iloc[0])
                note = None
                if len(g) > 1:
                    note = "This hospital's own CMI; its other campuses' CMIs couldn't be weighted in (no discharges reported)."
            row: dict = {"caseMixIndex": round(value, 4), "annualized": False, "status": None}
            if note:
                row["detail"] = {"caseMixIndex": {"note": note}}
            metrics.setdefault(entity, {})[str(int(year))] = row

        years = sorted({int(y) for y in cmi["year"].unique()})
        print(f"  {len(metrics)} hospitals, fiscal years {years[0]}–{years[-1]}; {combined} hospital-years combine campuses")
        write_json(self.out_dir / "metrics.json", metrics)
        write_json(self.out_dir / "dictionary.json", dictionary.export(), compact=False)
        write_json(
            self.out_dir / "manifest.json",
            {
                "id": self.id,
                "title": self.title,
                "sourcePage": self.source_page,
                "package": self.package_meta,
                "years": years,
                "sources": self.sources,
                "generatedAt": utc_now_iso(),
                "notes": [
                    "Federal fiscal years (October–September), filed under the year they end.",
                    "CMI = sum of Medicare MS-DRG weights ÷ discharges, from HCAI's Patient Discharge Data.",
                    "Campuses on one license are combined, weighted by their utilization-report discharges.",
                ],
            },
            compact=False,
        )

