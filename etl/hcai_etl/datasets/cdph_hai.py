"""CDPH Healthcare-Associated Infections in California Hospitals.

Sources (CHHS Open Data Portal, one CKAN package per infection type):
  CLABSI, C. difficile (CDI), MRSA bloodstream infections, VRE bloodstream infections.

Each package holds one CSV per calendar year (2020 in two halves). What the files
look like, and how we handle it:

  * Facility IDs are CDPH ELMS IDs (930000004), not HCAI facility numbers
    (106190555). `crosswalk.FacilityCrosswalk` maps them; campuses reported
    separately (Hoag Irvine) roll up to the licensed hospital, as utilization does.
  * Rehabilitation units share their hospital's facility ID but report as a
    separate row; NHSN keeps them apart, so only the hospital row is used.
  * Columns drift between years (Facility_Type vs Hospital_Type, SIR and CI
    columns missing from the January–June 2020 files, CR-only line endings,
    cp1252 characters). Columns are read by name and missing ones tolerated.
  * VRE has no SIR (no national risk adjustment): rate only, as CDPH publishes it.
  * "Months" = months of complete data. Zero months means not reported.

Metrics per infection type and year: the SIR (observed ÷ predicted) with its 95%
CI and CDPH's better/same/worse call, and the raw rate. When a hospital-year
combines several rows (campuses, or the two halves of 2020) we recompute the SIR
from summed observed and predicted infections, with an exact Poisson CI.
"""

from __future__ import annotations

import io
import re

import pandas as pd
from scipy.stats import chi2

from ..core import Dataset, Resource, ckan_package, clean_value, utc_now_iso, write_json
from ..crosswalk import FacilityCrosswalk
from ..dictionary import cdph_hai as dictionary

DEFAULT_FIRST_YEAR = 2019

PACKAGES = {
    "clabsi": "test-cdph-central-line-associated-bloodstream-infections-clabsi-in-california-hospitals",
    "cdi": "clostridioides-difficile-infections-cdi-in-california-hospitals",
    "mrsa": "methicillin-resistant-staphylococcus-aureus-mrsa-bloodstream-infections-bsi-in-california-hospitals",
    "vre": "vancomycin-resistant-enterococci-vre-bloodstream-infections-in-california-hospitals",
}

# Rows that aren't a hospital's own acute-care reporting.
EXCLUDED_TYPES = {"Rehabilitation Unit"}

# CDPH calculates an SIR when at least this many infections were predicted
# (NHSN's own cutoff is 1; CDPH flags 0.2–1 as less precise).
MIN_PREDICTED = 0.2
PRECISE_PREDICTED = 1.0


def _read_csv(path) -> pd.DataFrame:
    raw = path.read_bytes()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp1252")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    df = pd.read_csv(io.StringIO(text), dtype=str)
    df.columns = [c.strip() for c in df.columns]
    return df.rename(columns={"Hospital_Type": "Facility_Type", "Central_line_Days": "Central_Line_Days"})


def _float(value) -> float | None:
    try:
        v = float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None
    return None if pd.isna(v) else v


def poisson_sir_ci(observed: float, predicted: float) -> tuple[float, float]:
    """Exact Poisson 95% CI for observed/predicted (the method CDPH documents)."""
    lower = chi2.ppf(0.025, 2 * observed) / 2 if observed > 0 else 0.0
    upper = chi2.ppf(0.975, 2 * observed + 2) / 2
    return lower / predicted, upper / predicted


class CdphHai(Dataset):
    id = "cdph-hai"
    title = "CDPH Healthcare-Associated Infections in California Hospitals"
    source_page = "https://www.cdph.ca.gov/Programs/CHCQ/HAI/Pages/HAIreport.aspx"

    _year = re.compile(r"(20\d\d)")

    def resources(self) -> list[Resource]:
        out: list[Resource] = []
        self.package_meta = {}
        for kind, package in PACKAGES.items():
            pkg = ckan_package(package)
            self.package_meta[kind] = {"title": pkg.get("title"), "metadata_modified": pkg.get("metadata_modified")}
            for res in pkg["resources"]:
                name = res.get("name", "")
                if res.get("format", "").upper() != "CSV":
                    continue
                # Hospital-wide files only (older years also had LTAC/rehab/unit-level files).
                if re.search(r"REHAB|LTAC|Long-Term|Patient Care Areas|Rehabilitation", name, re.I):
                    continue
                match = self._year.search(name)
                if not match:
                    continue
                year = int(match.group(1))
                if (self.years and year not in self.years) or (not self.years and year < DEFAULT_FIRST_YEAR):
                    continue
                half = "h1" if re.search(r"January (through|to) June", name, re.I) else "h2" if re.search(r"July (through|to) December", name, re.I) else None
                out.append(Resource(name=name.strip(), url=res["url"], format="CSV", tags={"kind": kind, "year": year, "half": half}))
        return out

    def load(self, files):
        self.crosswalk = FacilityCrosswalk.load(self.refresh)
        frames = []
        for res, path in files:
            df = _read_csv(path)
            df = df[df["Facility_ID"].notna() & df["Facility_ID"].str.strip().ne("")]
            if "Facility_Type" in df:
                df = df[~df["Facility_Type"].isin(EXCLUDED_TYPES)]
            info = dictionary.INFECTIONS[res.tags["kind"]]
            exposure = df[info["exposure_column"]] if info["exposure_column"] in df else df.get("Patient_Days")
            frame = pd.DataFrame(
                {
                    "kind": res.tags["kind"],
                    "year": res.tags["year"],
                    "half": res.tags["half"],
                    "facid": df["Facility_ID"].str.strip().str.zfill(9),
                    "name": df["Facility_Name"],
                    "hospital_type": df.get("Facility_Type"),
                    "observed": df["Infections_Reported"].map(_float),
                    "predicted": df["Infections_Predicted"].map(_float) if "Infections_Predicted" in df else None,
                    "exposure": exposure.map(_float) if exposure is not None else None,
                    "sir": df["SIR"].map(_float) if "SIR" in df else None,
                    "sir_lo": df["SIR_CI_95_Lower_Limit"].map(_float) if "SIR_CI_95_Lower_Limit" in df else None,
                    "sir_hi": df["SIR_CI_95_Upper_Limit"].map(_float) if "SIR_CI_95_Upper_Limit" in df else None,
                    "rate_lo": df["Rate_CI_95_Lower_Limit"].map(_float) if "Rate_CI_95_Lower_Limit" in df else None,
                    "rate_hi": df["Rate_CI_95_Upper_Limit"].map(_float) if "Rate_CI_95_Upper_Limit" in df else None,
                    "comparison": df["Comparison"] if "Comparison" in df else None,
                    # The Jan–Jun 2020 files have no Months column; a row with counts is a report.
                    "months": df["Months"].map(_float) if "Months" in df else 6.0,
                    "notes": df["Notes"] if "Notes" in df else None,
                }
            )
            frame["hcai"] = frame["facid"].map(self.crosswalk.from_facid)
            frames.append(frame)
            print(f"  {res.tags['kind']} {res.tags['year']}{res.tags['half'] or ''}: {len(frame)} rows")
        self.sources = [{"kind": r.tags["kind"], "year": r.tags["year"], "name": r.name, "url": r.url} for r, _ in files]
        return pd.concat(frames, ignore_index=True)

    def build(self, rows: pd.DataFrame) -> None:
        reported = rows[rows["observed"].notna() & (rows["months"].fillna(0) > 0)]
        unmatched = reported[reported["hcai"].isna()].drop_duplicates("facid")
        matched = reported[reported["hcai"].notna()]

        metrics: dict[str, dict[str, dict]] = {}
        for (hcai, year), group in matched.groupby(["hcai", "year"], sort=True):
            row: dict = {"annualized": False, "status": None, "detail": {}}
            for kind, g in group.groupby("kind"):
                self._infection(row, kind, g)
            metrics.setdefault(hcai, {})[str(year)] = row

        write_json(self.out_dir / "metrics.json", metrics)
        write_json(self.out_dir / "dictionary.json", dictionary.export(), compact=False)
        years = sorted({int(y) for fac in metrics.values() for y in fac})
        write_json(
            self.out_dir / "manifest.json",
            {
                "id": self.id,
                "title": self.title,
                "sourcePage": self.source_page,
                "package": self.package_meta,
                "years": years,
                "sources": self.sources,
                "crosswalk": self.crosswalk.sources,
                "generatedAt": utc_now_iso(),
                "coverage": {
                    "reportingFacilities": int(reported["facid"].nunique()),
                    "matchedHospitals": len(metrics),
                    "unmatched": [
                        {"facilityId": r.facid, "name": clean_value(r.name)} for r in unmatched.itertuples()
                    ],
                },
                "notes": [
                    "Calendar years. CDPH facility IDs are mapped to HCAI facility numbers with CDPH's licensed facility listing and ELMS–OSHPD crosswalk; campuses reported separately are combined into the licensed hospital.",
                    "Rehabilitation units, which report separately under the hospital's ID, are excluded.",
                    "2020 was published in two halves (January–June without SIRs); the halves are combined and the SIR recomputed.",
                    "VRE has no SIR because no national risk adjustment exists; its rate is per 10,000 patient days.",
                ],
            },
            compact=False,
        )

    def _infection(self, row: dict, kind: str, g: pd.DataFrame) -> None:
        info = dictionary.INFECTIONS[kind]
        observed = g["observed"].sum()
        exposure = g["exposure"].sum(min_count=1)
        months = g["months"].sum()
        combined = len(g) > 1
        notes: list[str] = []
        if combined and g["half"].notna().any():
            notes.append("January–June and July–December 2020 combined.")
        if combined and g["facid"].nunique() > 1:
            names = ", ".join(sorted(set(g["name"].dropna())))
            notes.append(f"Combines campuses reported separately: {names}.")
        if not combined and g["half"].iloc[0] == "h2":
            notes.append("July–December 2020 only: no January–June 2020 report (CMS excused that period's reporting during COVID-19).")
        elif not combined and g["half"].iloc[0] == "h1":
            notes.append("January–June 2020 only.")
        elif months < 12 and not combined:
            notes.append(f"Reported {int(months)} of 12 months.")
        if g["notes"].fillna("").str.contains("Incomplete Reporter").any():
            notes.append("CDPH flags this hospital as an incomplete reporter: it reported fewer months than it was open.")

        rate_id = f"{kind}Rate"
        if exposure and exposure > 0:
            row[rate_id] = round(observed / exposure * info["per"], 3)
            detail = {"note": " ".join(notes) or None}
            if kind == "vre" and not combined and g["comparison"].notna().any():
                # VRE: CDPH compares with the mean rate for the same hospital type and size.
                detail["compared"] = str(g["comparison"].iloc[0]).lower()
                lo, hi = g["rate_lo"].iloc[0], g["rate_hi"].iloc[0]
                if lo is not None and hi is not None and not pd.isna(lo):
                    detail["ci"] = [lo, hi]
            row["detail"][rate_id] = {k: v for k, v in detail.items() if v is not None}
        else:
            row[rate_id] = None

        if not info["has_sir"]:
            return
        sir_id = f"{kind}Sir"
        predicted = g["predicted"].sum(min_count=1)
        detail: dict = {}
        if predicted is None or pd.isna(predicted) or predicted < MIN_PREDICTED:
            row[sir_id] = None
            detail["note"] = "Too few infections predicted to calculate an SIR (fewer than 0.2)."
        elif not combined and g["sir"].notna().iloc[0]:
            # CDPH's own published SIR, CI, and comparison.
            r = g.iloc[0]
            row[sir_id] = r["sir"]
            detail["ci"] = [r["sir_lo"], r["sir_hi"]]
            if isinstance(r["comparison"], str) and r["comparison"].strip():
                detail["compared"] = r["comparison"].strip().lower()
        else:
            lo, hi = poisson_sir_ci(observed, predicted)
            row[sir_id] = round(observed / predicted, 2)
            detail["ci"] = [round(lo, 2), round(hi, 2)]
            detail["compared"] = "better" if hi < 1 else "worse" if lo > 1 else "same"
        if row[sir_id] is not None and predicted < PRECISE_PREDICTED:
            notes.append("Fewer than 1 infection predicted, so this SIR is imprecise.")
        detail["observed"] = int(observed)
        detail["predicted"] = None if pd.isna(predicted) else round(float(predicted), 2)
        if notes:
            detail["note"] = " ".join(notes) if "note" not in detail else f"{detail['note']} {' '.join(notes)}"
        row["detail"][sir_id] = detail
