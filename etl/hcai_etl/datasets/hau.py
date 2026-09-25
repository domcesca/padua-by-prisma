"""Hospital Annual Utilization Report & Pivot Tables.

Source: https://data.chhs.ca.gov/dataset/hospital-annual-utilization-report

Each "YYYY Hospital Annual Utilization" workbook has one row per facility per
*calendar* year on the "Page 1-6" sheet. The header row holds column names and
the next four rows hold a description and the report Page/Column/Line of each
field; data starts after them.

Two things differ from the financial data and are handled here:

  * Campuses. Utilization is reported per campus: a "Consolidated Facility"
    (e.g. UCSF Mission Bay) files its own report under its parent's license,
    while the financial report covers the whole license. We roll every campus
    into the parent facility on the same LICENSE_NO so one hospital means the
    same thing in both datasets. Campus names are kept in facilities.json.
  * Multiple reports. A facility that changed licensee mid-year files two
    reports. Flows are summed, point-in-time counts come from the latest report,
    and flows are annualized when the operating period is more than 3% short of
    a full year (openings and closures).

Rates (occupancy, ALOS, minutes per surgery) are recomputed from the combined
totals rather than averaged.
"""

from __future__ import annotations

import re

import pandas as pd

from ..core import Dataset, Resource, ckan_package, clean_value, normalize_column, utc_now_iso, write_json
from ..dictionary import hau as dictionary
from ..facility import display_name, ownership_group, title_case

DEFAULT_FIRST_YEAR = 2019
SHEET = "Page 1-6"
# Rows under the header: file description, Page, Column, Line.
HEADER_META_ROWS = [1, 2, 3, 4]

COLUMN_ALIASES = {
    "CENS_TRACT": "CENSUS_KEY",
    **{f"OSHPD_PROJ_NO_0{i}": f"HCAI_PROJ_NO_0{i}" for i in range(1, 6)},
}

# Descriptive columns: taken from the parent facility's latest report.
ATTRIBUTE_FIELDS = [
    "FAC_NO", "FAC_NAME", "FAC_STR_ADDR", "FAC_CITY", "FAC_ZIP", "FAC_PHONE", "FAC_ADMIN_NAME",
    "FAC_OPERATED_THIS_YR", "FAC_OP_PER_BEGIN_DT", "FAC_OP_PER_END_DT", "FAC_PAR_CORP_NAME",
    "FAC_PAR_CORP_BUS_ADDR", "FAC_PAR_CORP_CITY", "FAC_PAR_CORP_STATE", "FAC_PAR_CORP_ZIP",
    "REPT_PREP_NAME", "SUBMITTED_DT", "REV_REPT_PREP_NAME", "REVISED_DT", "CORRECTED_DT",
    "LICENSE_NO", "LICENSE_EFF_DATE", "LICENSE_EXP_DATE", "LICENSE_STATUS", "FACILITY_LEVEL",
    "TRAUMA_CTR", "TEACH_HOSP", "TEACH_RURAL", "LONGITUDE", "LATITUDE", "ASSEMBLY_DIST",
    "SENATE_DIST", "CONGRESS_DIST", "CENSUS_KEY", "MED_SVC_STUDY_AREA", "LA_COUNTY_SVC_PLAN_AREA",
    "HEALTH_SVC_AREA", "COUNTY", "LIC_CAT", "LICEE_TOC", "PRIN_SERVICE_TYPE",
    "EMSA_TRAUMA_DESIGNATION", "EMSA_TRAUMA_DESIGNATION_PEDIATRIC", "LIC_ED_LEV_BEGIN", "LIC_ED_LEV_END",
    "EMER_DEPT_AMBULANCE_DIVERSION_HOURS",  # Yes/No despite the name
]

# Point-in-time counts (Dec 31 snapshots, rooms, staff): latest report per
# facility, then summed across campuses.
STOCK_PATTERNS = [
    r"_LIC_BEDS$", r"^NEWBORN_NURSERY_BASSINETS$", r"^GEN_ACUTE_CARE_SN_SWING_BEDS$",
    r"^ACUTE_PSYCHIATRIC_PATS_", r"^INPATIENT_PALLIATIVE_CARE_PROG_", r"^EMER_MED_TREAT_STATIONS_ON_1231$",
    r"OPER_RM", r"^CARDIAC_CATHETERIZATION_LAB_RM$", r"^ALTERNATE_SETTING_LDRP?$",
]

# Rates recomputed from combined totals: field -> (numerator, denominator fields).
CRITICAL_CARE = ["IC", "CORONARY_CARE", "ACUTE_RESPIRATORY_CARE", "BURN", "IC_NEWBORN"]
ALOS_INPUTS: dict[str, tuple[str, list[str]]] = {
    f"{p}_ALOS_CY": (f"{p}_CEN_DAYS", [f"{p}_DISCHARGES"] + ([f"{p}_INTRA_TRANSFERS"] if p in CRITICAL_CARE else []))
    for p in [
        "MED_SURG", "PERINATAL", "PEDIATRIC", *CRITICAL_CARE, "REHAB_CTR", "GAC_SUBTOT",
        "ACUTE_PSYCHIATRIC", "SN", "INTERMEDIATE_CARE", "INTERMEDIATE_CARE_DEV_DIS", "TOT", "GAC_CDRS",
    ]
}
ALOS_INPUTS["CHEM_DEPEND_RECOV_ALOS_CY"] = ("CHEM_DEPEND_RECOV_CEN_DAYS", ["CHEM_DEPEND_RECOVERY_DISCHARGES"])
ALOS_INPUTS["ACUTE_PSYCH_CDRS_ALOS_CY"] = ("ACUTE_PSYCH_CEN_DAYS", ["ACUTE_PSYCH_DISCHARGES"])
ALOS_INPUTS["SN_ALOS_CY"] = ("SN_CEN_DAYS", ["SN_DISCHARGES"])
RATE_INPUTS = {
    **ALOS_INPUTS,
    "INPATIENT_AVG_PER_SURGERY": ("INPATIENT_SURG_OPER_RM_MINS", ["INPATIENT_SURG_OPER"]),
    "OUTPATIENT_AVG_PER_SURGERY": ("OUTPATIENT_SURG_OPER_RM_MINS", ["OUTPATIENT_SURG_OPER"]),
}

# Dropped: prior-year ALOS (the app shows history directly) and per-item
# capital slots (summed into *_TOT below; slot numbers don't line up across campuses).
DROP_PATTERNS = [r"_ALOS_PY$", r"^EQUIP_VAL_\d+$", r"^PROJ_EXPENDITURES_\d+$"]
SUMMED_SLOTS = {"EQUIP_VAL_TOT": r"^EQUIP_VAL_\d+$", "PROJ_EXPENDITURES_TOT": r"^PROJ_EXPENDITURES_\d+$"}

ANNUALIZE_TOLERANCE = 0.03


def _matches(col: str, patterns: list[str]) -> bool:
    return any(re.search(p, col) for p in patterns)


class HospitalUtilization(Dataset):
    id = "hau"
    title = "Hospital Annual Utilization Report"
    ckan_package = "hospital-annual-utilization-report"
    source_page = "https://data.chhs.ca.gov/dataset/hospital-annual-utilization-report"

    # "2024 Hospital Annual Utilization (October 2025)", "2025 Hospital Annual Utilization (Preliminary)"
    _pattern = re.compile(r"^\s*(\d{4})\s+Hospital Annual Utilization\b(?!.*Pivot)", re.I)

    # ------------------------------------------------------------------ #
    # 1. Select source files
    # ------------------------------------------------------------------ #

    def resources(self) -> list[Resource]:
        pkg = ckan_package(self.ckan_package)
        by_year: dict[int, Resource] = {}
        for res in pkg["resources"]:
            name = res.get("name", "")
            match = self._pattern.match(name)
            if not match or res.get("format", "").upper() not in {"XLSX", "XLS"}:
                continue
            year = int(match.group(1))
            preliminary = "prelim" in name.lower()
            if self.years:
                if year not in self.years:
                    continue
            # By default: final files from DEFAULT_FIRST_YEAR on. Preliminary
            # files only when asked for by year (--years 2025).
            elif year < DEFAULT_FIRST_YEAR or preliminary:
                continue
            by_year[year] = Resource(
                name=name.strip(), url=res["url"], format=res["format"],
                tags={"year": year, "preliminary": preliminary},
            )
        self.package_meta = {"title": pkg.get("title"), "metadata_modified": pkg.get("metadata_modified")}
        return [by_year[y] for y in sorted(by_year)]

    # ------------------------------------------------------------------ #
    # 2. Load
    # ------------------------------------------------------------------ #

    def load(self, files):
        frames = []
        for res, path in files:
            df = pd.read_excel(path, sheet_name=SHEET, header=0, skiprows=HEADER_META_ROWS)
            df = df.loc[:, [c for c in df.columns if not str(c).startswith("Unnamed") and str(c) != "Description"]]
            df.columns = [normalize_column(c, COLUMN_ALIASES) for c in df.columns]
            df = df.dropna(subset=["FAC_NO"])
            df["FAC_NO"] = pd.to_numeric(df["FAC_NO"], errors="coerce")
            df = df.dropna(subset=["FAC_NO"])
            df["FAC_NO"] = df["FAC_NO"].astype("int64").astype(str)
            df["LICENSE_NO"] = pd.to_numeric(df["LICENSE_NO"], errors="coerce").astype("Int64").astype(str)
            df["YEAR"] = res.tags["year"]
            frames.append(df)
            print(f"  {res.tags['year']}: {len(df)} reports, {df['FAC_NO'].nunique()} facilities")
        self.sources = [
            {"year": r.tags["year"], "name": r.name, "url": r.url, "preliminary": r.tags["preliminary"]}
            for r, _ in files
        ]
        reports = pd.concat(frames, ignore_index=True)
        for col in ("FAC_OP_PER_BEGIN_DT", "FAC_OP_PER_END_DT"):
            reports[col] = pd.to_datetime(reports[col], errors="coerce")
        # Per-item capital slots -> one total each.
        for total, pattern in SUMMED_SLOTS.items():
            cols = [c for c in reports.columns if re.search(pattern, c)]
            reports[total] = reports[cols].apply(pd.to_numeric, errors="coerce").sum(axis=1, min_count=1)
        return reports

    # ------------------------------------------------------------------ #
    # 3. Roll campuses up to the license, collapse, write
    # ------------------------------------------------------------------ #

    def build(self, reports: pd.DataFrame) -> None:
        reports["ENTITY"] = self._entities(reports)

        numeric_fields = [
            c for c in reports.columns
            if c not in ATTRIBUTE_FIELDS and c not in {"YEAR", "ENTITY"}
            and not _matches(c, DROP_PATTERNS)
            and pd.api.types.is_numeric_dtype(reports[c])
        ]
        unknown = sorted(set(numeric_fields) - set(dictionary.FIELDS))
        if unknown:
            print(f"  WARNING: fields missing from dictionary: {unknown}")

        rows = [
            self._collapse(entity, year, group, numeric_fields)
            for (entity, year), group in reports.groupby(["ENTITY", "YEAR"], sort=True)
        ]
        fy = pd.DataFrame(rows)
        rolled = int((fy["CAMPUS_COUNT"] > 1).sum())
        print(f"  {len(fy)} facility-years ({rolled} combine more than one campus, {int(fy['ANNUALIZED'].sum())} annualized)")

        self._write_fields(fy, numeric_fields)
        self._write_metrics_and_facilities(fy)
        write_json(
            self.out_dir / "dictionary.json",
            dictionary.export(field_order=ATTRIBUTE_FIELDS + numeric_fields),
            compact=False,
        )
        write_json(
            self.out_dir / "manifest.json",
            {
                "id": self.id,
                "title": self.title,
                "sourcePage": self.source_page,
                "package": self.package_meta,
                "years": sorted(int(y) for y in fy["YEAR"].unique()),
                "sources": self.sources,
                "generatedAt": utc_now_iso(),
                "notes": [
                    "Years are calendar years (January–December).",
                    "Campuses reporting under another facility's license (HCAI 'Consolidated Facility' or 'Distinct Part') are combined into the parent facility on that license, matching how financial data is reported.",
                    "Facilities with more than one report in a year (change of licensee) are combined; counts are annualized when the operating period is more than 3% short of a full year.",
                    "Occupancy, average length of stay, and minutes per surgery are recomputed from the combined totals.",
                ],
            },
            compact=False,
        )

    def _entities(self, reports: pd.DataFrame) -> pd.Series:
        """Map each report to the parent facility on its license, per year."""
        entity = reports["FAC_NO"].copy()
        for year, group in reports.groupby("YEAR"):
            parents = group[group["FACILITY_LEVEL"] == "Parent Facility"]
            # A license very occasionally lists two parents; the one with more
            # beds is the main hospital.
            parents = parents.assign(_beds=pd.to_numeric(parents["TOT_LIC_BEDS"], errors="coerce").fillna(0))
            parent_by_license = (
                parents.sort_values("_beds", ascending=False).drop_duplicates("LICENSE_NO").set_index("LICENSE_NO")["FAC_NO"]
            )
            campuses = group[group["FACILITY_LEVEL"] != "Parent Facility"]
            mapped = campuses["LICENSE_NO"].map(parent_by_license)
            entity.loc[mapped.dropna().index] = mapped.dropna()
        return entity

    def _collapse(self, entity: str, year: int, group: pd.DataFrame, numeric_fields: list[str]) -> dict:
        year = int(year)
        days_in_year = 366 if pd.Timestamp(year=year, month=12, day=31).dayofyear == 366 else 365
        year_start, year_end = pd.Timestamp(year=year, month=1, day=1), pd.Timestamp(year=year, month=12, day=31)

        # Reports from the parent facility itself describe the hospital.
        own = group[group["FAC_NO"] == entity]
        own = (own if len(own) else group).sort_values("FAC_OP_PER_END_DT", na_position="first")
        latest = own.iloc[-1]

        # Operating period covered by the parent's report(s).
        begin = own["FAC_OP_PER_BEGIN_DT"].fillna(year_start).clip(lower=year_start)
        end = own["FAC_OP_PER_END_DT"].fillna(year_end).clip(upper=year_end)
        days_covered = int(min(days_in_year, ((end - begin).dt.days + 1).clip(lower=0).sum()))
        factor = days_in_year / days_covered if days_covered else 1.0
        annualized = abs(factor - 1) > ANNUALIZE_TOLERANCE

        row: dict = {c: latest.get(c) for c in ATTRIBUTE_FIELDS if c in group.columns}
        campus_names = list(dict.fromkeys(
            str(n).strip() for n in group.loc[group["FAC_NO"] != entity, "FAC_NAME"].dropna()
        ))
        row.update(
            FAC_NO=entity,
            YEAR=year,
            REPORTS=len(group),
            CAMPUS_COUNT=group["FAC_NO"].nunique(),
            CAMPUSES=campus_names,
            DAYS_COVERED=days_covered,
            ANNUALIZED=annualized,
            NAMES=list(dict.fromkeys(own["FAC_NAME"].dropna().astype(str).str.strip())),
        )

        # 1) one row per campus (latest report for stocks, sum for flows),
        # 2) sum across campuses.
        per_campus = []
        for _, campus in group.sort_values("FAC_OP_PER_END_DT", na_position="first").groupby("FAC_NO"):
            last = campus.iloc[-1]
            values = {}
            for field in numeric_fields:
                if field in RATE_INPUTS:
                    continue
                if _matches(field, STOCK_PATTERNS):
                    values[field] = pd.to_numeric(last[field], errors="coerce")
                else:
                    values[field] = pd.to_numeric(campus[field], errors="coerce").sum(min_count=1)
            per_campus.append(values)
        combined = pd.DataFrame(per_campus).sum(axis=0, min_count=1)

        for field in numeric_fields:
            if field in RATE_INPUTS:
                continue
            value = combined.get(field)
            if annualized and pd.notna(value) and not _matches(field, STOCK_PATTERNS):
                value = value * factor
            row[field] = value
        for field, (num, dens) in RATE_INPUTS.items():
            if field not in numeric_fields:
                continue
            n = row.get(num)
            d = sum(v for v in (row.get(x) for x in dens) if pd.notna(v))
            row[field] = n / d if (pd.notna(n) and d) else None
        return row

    # -- raw field values (Translate tab) -------------------------------- #

    def _write_fields(self, fy: pd.DataFrame, numeric_fields: list[str]) -> None:
        values: dict[str, dict[str, list]] = {}
        meta: dict[str, dict[str, dict]] = {}
        for rec in fy.to_dict("records"):
            fac, year = rec["FAC_NO"], str(rec["YEAR"])
            values.setdefault(fac, {})[year] = [clean_value(rec.get(f)) for f in numeric_fields]
            meta.setdefault(fac, {})[year] = {
                "days": rec["DAYS_COVERED"],
                "reports": rec["REPORTS"],
                "annualized": bool(rec["ANNUALIZED"]),
                "status": None,
                "begin": clean_value(rec.get("FAC_OP_PER_BEGIN_DT")),
                "end": clean_value(rec.get("FAC_OP_PER_END_DT")),
                "campuses": [display_name(c) for c in rec["CAMPUSES"]],
            }
        write_json(self.out_dir / "fields.json", {"fields": numeric_fields, "meta": meta, "values": values})

    # -- metrics + facility directory ------------------------------------ #

    def _write_metrics_and_facilities(self, fy: pd.DataFrame) -> None:
        metrics: dict[str, dict[str, dict]] = {}
        for rec in fy.to_dict("records"):
            metrics.setdefault(rec["FAC_NO"], {})[str(rec["YEAR"])] = derive_metrics(rec)

        facilities = []
        for fac, group in fy.groupby("FAC_NO"):
            group = group.sort_values("YEAR")
            latest = group.iloc[-1]
            name = str(latest["FAC_NAME"]).strip()
            names = list(dict.fromkeys(n for ns in group["NAMES"] for n in ns))
            lat, lng = clean_value(latest.get("LATITUDE")), clean_value(latest.get("LONGITUDE"))
            facilities.append(
                {
                    "id": fac,
                    "name": display_name(name),
                    "hcaiName": name,
                    "formerNames": [display_name(n) for n in names if n != name],
                    "county": clean_value(latest.get("COUNTY")),
                    "city": title_case(clean_value(latest.get("FAC_CITY"))),
                    "zip": clean_value(str(latest.get("FAC_ZIP") or "")[:5]),
                    "latitude": lat if isinstance(lat, (int, float)) else None,
                    "longitude": lng if isinstance(lng, (int, float)) else None,
                    "parentOrganization": clean_value(latest.get("FAC_PAR_CORP_NAME")),
                    "ownership": ownership_group(latest.get("LICEE_TOC")),
                    "licenseCategory": clean_value(latest.get("LIC_CAT")),
                    "principalService": clean_value(latest.get("PRIN_SERVICE_TYPE")),
                    "teaching": str(latest.get("TEACH_HOSP")).strip().lower() == "yes",
                    "rural": str(latest.get("TEACH_RURAL")).strip().lower() == "yes",
                    "traumaLevel": _trauma_level(latest.get("EMSA_TRAUMA_DESIGNATION")),
                    "edLevel": clean_value(latest.get("LIC_ED_LEV_END")) or clean_value(latest.get("LIC_ED_LEV_BEGIN")),
                    "licensedBeds": clean_value(latest.get("TOT_LIC_BEDS")),
                    "campuses": [display_name(c) for c in latest["CAMPUSES"]],
                    "years": [int(y) for y in group["YEAR"]],
                }
            )
        facilities.sort(key=lambda f: f["name"])
        write_json(self.out_dir / "facilities.json", facilities)
        write_json(self.out_dir / "metrics.json", metrics)


def _trauma_level(value) -> int | None:
    match = re.search(r"Level\s+(IV|I{1,3})\b", str(value or ""))
    return {"I": 1, "II": 2, "III": 3, "IV": 4}[match.group(1)] if match else None


# --------------------------------------------------------------------------- #
# Derived metrics — definitions mirror dictionary.METRICS
# --------------------------------------------------------------------------- #


def _num(rec: dict, key: str) -> float | None:
    v = rec.get(key)
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return None if pd.isna(v) else v


def _ratio(n: float | None, d: float | None, digits: int = 4) -> float | None:
    return round(n / d, digits) if (n is not None and d) else None


def _count(value: float | None) -> int | None:
    return round(value) if value is not None else None


def derive_metrics(rec: dict) -> dict:
    ed = _num(rec, "ER_TRAFFIC_TOT")
    ed = ed if ed else None  # 0 visits = no ED
    released = _num(rec, "EMER_DEPT_VISITS_NOT_RESULT_ADMISSIONS_TOT")
    high_acuity = sum(v for v in (_num(rec, "EMS_VISITS_SEVERE_TOT"), _num(rec, "EMS_VISITS_CRITICAL_TOT")) if v)
    stations = _num(rec, "EMER_MED_TREAT_STATIONS_ON_1231")
    occupancy = _ratio(_num(rec, "TOT_CEN_DAYS"), _num(rec, "TOT_LIC_BED_DAYS"))
    diverted = str(rec.get("EMER_DEPT_AMBULANCE_DIVERSION_HOURS") or "").strip().lower()
    diversion = _num(rec, "EMER_DEPT_HR_DIVERSION_TOT")
    if diversion is None and ed and diverted == "no":
        diversion = 0.0

    return {
        "licensedBeds": _count(_num(rec, "TOT_LIC_BEDS")),
        "occupancy": round(occupancy * 100, 1) if occupancy is not None else None,
        "inpatientDays": _count(_num(rec, "TOT_CEN_DAYS")),
        "discharges": _count(_num(rec, "TOT_DISCHARGES")),
        "alos": _ratio(_num(rec, "GAC_SUBTOT_CEN_DAYS"), _num(rec, "GAC_SUBTOT_DISCHARGES"), 2),
        "edVisits": _count(ed),
        "edAdmitRate": _ratio(_num(rec, "ADMITTED_FROM_EMER_DEPT_TOT"), ed),
        "edHighAcuityShare": _ratio(high_acuity, released) if released else None,
        "edLwbsRate": _ratio(_num(rec, "EMER_REGISTRATIONS_PATS_LEAVE_WO_BEING_SEEN"), ed),
        "edVisitsPerStation": _count(ed / stations) if (ed and stations) else None,
        "diversionHours": _count(diversion) if ed else None,
        "ipSurgeries": _count(_num(rec, "INPATIENT_SURG_OPER")),
        "opSurgeries": _count(_num(rec, "OUTPATIENT_SURG_OPER")),
        "cathProcedures": _count(_num(rec, "CATHETERIZATION_PROC_TOT")),
        "days": int(rec["DAYS_COVERED"]),
        "annualized": bool(rec["ANNUALIZED"]),
        "status": None,
    }
