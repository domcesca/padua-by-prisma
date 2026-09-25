"""Hospital Annual Financial Data — Selected Data & Pivot Tables.

Source: https://data.chhs.ca.gov/dataset/hospital-annual-financial-data-selected-data-pivot-tables

Each "CY YYYY" workbook holds one row per *report* whose period ENDED in that
calendar year. Most hospitals file one 12-month report per year, but a facility
can file several (fiscal-year change, change of ownership, opening/closure).
We collapse those into one facility-year:

  * flow items (revenue, expense, volumes, hours, FTEs) are summed and then
    annualized when the reports don't cover ~one year,
  * stock items (balance sheet, bed counts) come from the latest report,
  * rates (occupancy, ALOS) are re-weighted,
  * descriptive attributes come from the latest report.
"""

from __future__ import annotations

import re

import pandas as pd

from ..core import Dataset, Resource, ckan_package, clean_value, normalize_column, utc_now_iso, write_json
from ..facility import display_name, ownership_group, title_case
from ..dictionary import hafd_selected as dictionary

DEFAULT_FIRST_YEAR = 2019

# Irregular headers seen across extracts -> canonical name.
COLUMN_ALIASES = {
    "NAT_0BIRTHS": "NAT_BIRTHS",
    "NAT_ BIRTHS": "NAT_BIRTHS",
    "ACCTS_0REC": "ACCTS_REC",
    "ACCTS_ REC": "ACCTS_REC",
    "MCAR_PRO#": "MCAR_PRO_NO",
    "MCAL_PRO#": "MCAL_PRO_NO",
    "REG_MCAL#": "REG_MCAL_NO",
}

# Descriptive / identifier columns (not aggregated numerically).
ATTRIBUTE_FIELDS = [
    "FAC_NO", "FAC_NAME", "BEG_DATE", "END_DATE", "DAY_PER", "DATA_IND", "AUDIT_IND",
    "COUNTY", "HSA", "HFPA", "TYPE_CNTRL", "TYPE_CARE", "TYPE_HOSP", "TEACH_RURL",
    "PHONE", "ADDRESS", "CITY", "ZIP_CODE", "CEO", "CEO_TITLE", "WEB_SITE", "OWNER",
    "RPT_PREP", "ORG_NAME", "ER_DESIG", "MCAR_PRO_NO", "MCAL_PRO_NO", "REG_MCAL_NO",
]

# Point-in-time values: take the latest report rather than summing.
STOCK_FIELDS = {
    # balance sheet
    "CUR_ASST", "ASST_LIMTD", "NET_PPE", "CONST_PROG", "INV_OTH", "INTAN_ASST", "TOT_ASST",
    "CUR_LIAB", "DEF_CRED", "NET_LTDEBT", "EQUITY", "LIAB_EQ", "CASH", "ACCTS_REC",
    "ALLOW_UNCOLL", "BLDGS", "EQUIPMENT", "TOT_PPE", "ACC_DEPRE", "MORT_PAY", "CAP_LEASE",
    "BOND_PAY", "TOT_LTDEBT", "CUR_MAT", "INTER_REC", "INTER_PAY",
    # capacity & staff counts
    "BED_LIC", "BED_AVL", "BED_STF", "BED_ACUTE", "BED_PSYCH", "BED_CHEM", "BED_REHAB",
    "BED_LTC", "BED_RESDNT", "BAS_NURSRY", "OP_ROOM", "MED_STAFF", "STDNT_FTE",
}

# Rates recomputed as weighted averages: field -> weight field.
RATE_FIELDS = {
    "OCC_LIC": "DAY_PER",
    "OCC_AVL": "DAY_PER",
    "ALOS_ALL": "DIS_TOT",
    "ALOS_EXLTC": "DIS_TOT",
}

# Annualize flows when reports cover a period more than this far from a year.
ANNUALIZE_TOLERANCE = 0.03

# Payer groupings used for payer mix (suffixes shared by DAY_/GR_IP_/GR_OP_ ...).
PAYER_GROUPS = {
    "medicare": ["MCAR_TR", "MCAR_MC"],
    "medical": ["MCAL_TR", "MCAL_MC"],
    "commercial": ["THRD_TR", "THRD_MC"],
    "indigent": ["CNTY", "OTH_IND"],
    "other": ["OTH"],
}

class HafdSelected(Dataset):
    id = "hafd-selected"
    title = "Hospital Annual Financial Data – Selected Data & Pivot Tables"
    ckan_package = "hospital-annual-financial-data-selected-data-pivot-tables"
    source_page = (
        "https://data.chhs.ca.gov/dataset/hospital-annual-financial-data-selected-data-pivot-tables"
    )

    # Matches e.g. "2024 CY Hospital Annual Selected File (April 2026 Extract)"
    _cy_pattern = re.compile(r"^\s*(\d{4})\s+CY\s+Hospital Annual Selected File", re.I)

    # ------------------------------------------------------------------ #
    # 1. Select source files
    # ------------------------------------------------------------------ #

    def resources(self) -> list[Resource]:
        pkg = ckan_package(self.ckan_package)
        by_year: dict[int, Resource] = {}
        for res in pkg["resources"]:
            match = self._cy_pattern.match(res.get("name", ""))
            if not match or res.get("format", "").upper() not in {"XLSX", "XLS"}:
                continue
            year = int(match.group(1))
            if self.years and year not in self.years:
                continue
            if not self.years and year < DEFAULT_FIRST_YEAR:
                continue
            by_year[year] = Resource(
                name=res["name"].strip(), url=res["url"], format=res["format"], tags={"year": year}
            )
        self.package_meta = {"title": pkg.get("title"), "metadata_modified": pkg.get("metadata_modified")}
        return [by_year[y] for y in sorted(by_year)]

    # ------------------------------------------------------------------ #
    # 2. Load + normalize into one long frame of reports
    # ------------------------------------------------------------------ #

    def load(self, files):
        frames = []
        for res, path in files:
            df = pd.read_excel(path)
            df.columns = [normalize_column(c, COLUMN_ALIASES) for c in df.columns]
            df = df.dropna(subset=["FAC_NO"])
            df["FAC_NO"] = df["FAC_NO"].astype("int64").astype(str)
            df["YEAR"] = res.tags["year"]
            frames.append(df)
            print(f"  {res.tags['year']}: {len(df)} reports, {df['FAC_NO'].nunique()} facilities")
        self.sources = [
            {"year": r.tags["year"], "name": r.name, "url": r.url} for r, _ in files
        ]
        reports = pd.concat(frames, ignore_index=True)
        for col in ("BEG_DATE", "END_DATE"):
            reports[col] = pd.to_datetime(reports[col], errors="coerce")
        return reports

    # ------------------------------------------------------------------ #
    # 3. Collapse to facility-years and write outputs
    # ------------------------------------------------------------------ #

    def build(self, reports: pd.DataFrame) -> None:
        numeric_fields = [
            c for c in reports.columns
            if c not in ATTRIBUTE_FIELDS and c != "YEAR" and pd.api.types.is_numeric_dtype(reports[c])
        ]
        unknown = sorted(set(numeric_fields) - set(dictionary.FIELDS))
        if unknown:
            print(f"  WARNING: fields missing from dictionary: {unknown}")

        facility_years = []
        for (fac, year), group in reports.groupby(["FAC_NO", "YEAR"], sort=True):
            facility_years.append(self._collapse(fac, year, group, numeric_fields))

        fy = pd.DataFrame(facility_years)
        self._write_fields(fy, numeric_fields)
        self._write_metrics_and_facilities(fy)
        self._write_dictionary(numeric_fields)
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
                    "Years are report years: each year contains reports whose period ENDED in that calendar year.",
                    "Hospitals that filed multiple reports in a year are combined; flows are annualized when coverage differs from a full year by more than 3%.",
                    "Balance-sheet items and bed counts come from the latest report in the year.",
                ],
            },
            compact=False,
        )

    def _collapse(self, fac: str, year: int, group: pd.DataFrame, numeric_fields: list[str]) -> dict:
        group = group.sort_values("END_DATE")
        latest = group.iloc[-1]
        days_covered = int(group["DAY_PER"].sum())
        days_in_year = 366 if pd.Timestamp(year=int(year), month=12, day=31).dayofyear == 366 else 365
        factor = days_in_year / days_covered if days_covered else 1.0
        annualized = abs(factor - 1) > ANNUALIZE_TOLERANCE

        row: dict = {c: latest.get(c) for c in ATTRIBUTE_FIELDS if c in group.columns}
        row.update(
            FAC_NO=fac,
            YEAR=int(year),
            REPORTS=len(group),
            DAYS_COVERED=days_covered,
            ANNUALIZED=annualized,
            BEG_DATE=group["BEG_DATE"].min(),
            END_DATE=group["END_DATE"].max(),
            NAMES=list(dict.fromkeys(group["FAC_NAME"].dropna().astype(str).str.strip())),
        )
        for field in numeric_fields:
            series = pd.to_numeric(group[field], errors="coerce")
            if field in STOCK_FIELDS:
                row[field] = pd.to_numeric(latest[field], errors="coerce")
            elif field in RATE_FIELDS:
                weights = pd.to_numeric(group[RATE_FIELDS[field]], errors="coerce").fillna(0)
                valid = series.notna() & (weights > 0)
                row[field] = (
                    (series[valid] * weights[valid]).sum() / weights[valid].sum() if valid.any() else None
                )
            else:
                total = series.sum(min_count=1)
                row[field] = total * factor if (annualized and pd.notna(total)) else total
        # Unannualized cash operating expense per day, for days cash on hand.
        opex = pd.to_numeric(group["TOT_OP_EXP"], errors="coerce").sum()
        depre = pd.to_numeric(group["EXP_DEPRE"], errors="coerce").fillna(0).sum()
        row["_CASH_OPEX_PER_DAY"] = (opex - depre) / days_covered if days_covered else None
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
                "status": clean_value(rec.get("DATA_IND")),
                "begin": clean_value(rec["BEG_DATE"]),
                "end": clean_value(rec["END_DATE"]),
            }
        write_json(self.out_dir / "fields.json", {"fields": numeric_fields, "meta": meta, "values": values})

    # -- benchmark metrics + facility directory -------------------------- #

    def _write_metrics_and_facilities(self, fy: pd.DataFrame) -> None:
        metrics: dict[str, dict[str, dict]] = {}
        for rec in fy.to_dict("records"):
            metrics.setdefault(rec["FAC_NO"], {})[str(rec["YEAR"])] = derive_metrics(rec)

        facilities = []
        for fac, group in fy.groupby("FAC_NO"):
            group = group.sort_values("YEAR")
            latest = group.iloc[-1]
            names = list(dict.fromkeys(n for names in group["NAMES"] for n in names))
            name = str(latest["FAC_NAME"]).strip()
            teach_rural = str(latest.get("TEACH_RURL") or "").strip().lower()
            trauma = clean_value(latest.get("ER_DESIG"))
            facilities.append(
                {
                    "id": fac,
                    "name": display_name(name),
                    "hcaiName": name,
                    "formerNames": [display_name(n) for n in names if n != name],
                    "county": clean_value(latest.get("COUNTY")),
                    "city": title_case(clean_value(latest.get("CITY"))),
                    "owner": clean_value(latest.get("OWNER")),
                    "ownership": ownership_group(latest.get("TYPE_CNTRL")),
                    "typeOfCare": clean_value(latest.get("TYPE_CARE")),
                    "hospitalType": clean_value(latest.get("TYPE_HOSP")),
                    "teaching": teach_rural == "teaching",
                    "rural": teach_rural == "rural",
                    "traumaLevel": trauma if trauma else None,
                    "licensedBeds": clean_value(latest.get("BED_LIC")),
                    "fiscalYearEnd": clean_value(latest["END_DATE"]),
                    "years": [int(y) for y in group["YEAR"]],
                }
            )
        facilities.sort(key=lambda f: f["name"])
        write_json(self.out_dir / "facilities.json", facilities)
        write_json(self.out_dir / "metrics.json", metrics)

    def _write_dictionary(self, numeric_fields: list[str]) -> None:
        write_json(
            self.out_dir / "dictionary.json",
            dictionary.export(field_order=ATTRIBUTE_FIELDS + numeric_fields),
            compact=False,
        )


# --------------------------------------------------------------------------- #
# Derived benchmark metrics — definitions mirror dictionary.METRICS
# --------------------------------------------------------------------------- #


def _num(rec: dict, key: str) -> float | None:
    v = rec.get(key)
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return None if pd.isna(v) else v


def _share(parts: dict[str, float]) -> dict[str, float] | None:
    total = sum(v for v in parts.values() if v and v > 0)
    if not total:
        return None
    return {k: round(max(v or 0, 0) / total, 4) for k, v in parts.items()}


def derive_metrics(rec: dict) -> dict:
    op_rev = (_num(rec, "NET_PT_REV") or 0) + (_num(rec, "OTH_OP_REV") or 0)
    net_ops = _num(rec, "NET_FRM_OP")
    operating_margin = net_ops / op_rev if (net_ops is not None and op_rev > 0) else None

    cash = _num(rec, "CASH")
    per_day = rec.get("_CASH_OPEX_PER_DAY")
    days_cash = cash / per_day if (cash is not None and per_day and per_day > 0) else None

    occupancy = _num(rec, "OCC_LIC")

    # Adjusted discharges scale inpatient discharges up by the outpatient share
    # of gross charges, so per-unit cost compares hospitals with different
    # inpatient/outpatient mixes.
    discharges = _num(rec, "DIS_TOT")
    gross_total, gross_ip = _num(rec, "GR_PT_REV"), _num(rec, "GR_IP_TOT")
    adj_discharges = (
        discharges * gross_total / gross_ip
        if discharges and gross_total and gross_ip and gross_ip > 0
        else None
    )
    opex = _num(rec, "TOT_OP_EXP")

    def mix(prefixes: list[str]) -> dict | None:
        parts = {}
        for group, suffixes in PAYER_GROUPS.items():
            parts[group] = sum(
                (_num(rec, f"{p}{s}") or 0) for p in prefixes for s in suffixes
            )
        return _share(parts)

    out = {
        "operatingMargin": round(operating_margin, 4) if operating_margin is not None else None,
        "daysCashOnHand": round(days_cash, 1) if days_cash is not None else None,
        "occupancy": round(occupancy, 1) if occupancy is not None else None,
        "edVisits": clean_value(_num(rec, "VIS_ER")),
        "netPatientRevenue": clean_value(_num(rec, "NET_PT_REV")),
        "totalOperatingExpense": clean_value(_num(rec, "TOT_OP_EXP")),
        "discharges": clean_value(_num(rec, "DIS_TOT")),
        "licensedBeds": clean_value(_num(rec, "BED_LIC")),
        "alos": clean_value(_num(rec, "ALOS_EXLTC")),
        "outpatientVisits": clean_value(_num(rec, "VIS_TOT")),
        "expensePerAdjDischarge": round(opex / adj_discharges) if (opex and adj_discharges) else None,
        "revenuePerAdjDischarge": round(op_rev / adj_discharges) if (op_rev and adj_discharges) else None,
        "payerMixRevenue": mix(["GR_IP_", "GR_OP_"]),
        "payerMixDays": mix(["DAY_"]),
        "days": int(rec["DAYS_COVERED"]),
        "annualized": bool(rec["ANNUALIZED"]),
        "status": clean_value(rec.get("DATA_IND")),
    }
    for key in ("edVisits", "netPatientRevenue", "totalOperatingExpense", "discharges", "outpatientVisits"):
        if isinstance(out[key], float):
            out[key] = round(out[key])
    out.update(derive_medicare_metrics(rec))
    return out


def derive_medicare_metrics(rec: dict) -> dict:
    """Medicare lens (traditional + Medicare Advantage) — mirrors dictionary.MEDICARE_METRICS.

    Takes a facility-year of already-collapsed field values, so it can also be
    re-run from fields.json without the source workbooks.
    """

    def total(prefix: str) -> float | None:
        parts = [_num(rec, f"{prefix}MCAR_{s}") for s in ("TR", "MC")]
        return None if all(v is None for v in parts) else sum(v or 0 for v in parts)

    net_rev, discharges, days, visits = total("NETRV_"), total("DIS_"), total("DAY_"), total("VIS_")
    gross_ip, gross_op = total("GR_IP_"), total("GR_OP_")
    gross = (gross_ip or 0) + (gross_op or 0)
    gross_all, opex = _num(rec, "GR_PT_REV"), _num(rec, "TOT_OP_EXP")
    # Medicare cost by the AHA payment-to-cost method: Medicare's gross charges times
    # the hospital's cost-to-charge ratio, operating expense (which excludes bad
    # debt) over gross patient revenue plus other operating revenue.
    charges_all = (gross_all or 0) + (_num(rec, "OTH_OP_REV") or 0)
    cost = opex * gross / charges_all if (opex and opex > 0 and gross > 0 and charges_all > 0) else None
    adj_discharges = discharges * gross / gross_ip if (discharges and gross_ip and gross_ip > 0) else None
    ma = _num(rec, "DIS_MCAR_MC")

    def whole(v):
        return round(v) if v is not None else None

    return {
        "medicareMargin": round((net_rev - cost) / net_rev, 4) if (cost is not None and net_rev and net_rev > 0) else None,
        "medicareRevenuePerAdjDischarge": whole(net_rev / adj_discharges) if (net_rev and adj_discharges) else None,
        "medicareCostPerAdjDischarge": whole(cost / adj_discharges) if (cost and adj_discharges) else None,
        "medicareNetRevenue": whole(net_rev),
        "medicareAdvantageShare": round((ma or 0) / discharges, 4) if discharges and discharges > 0 else None,
        "medicareDischarges": whole(discharges),
        "medicareInpatientDays": whole(days),
        "medicareAlos": round(days / discharges, 2) if (days and discharges and discharges > 0) else None,
        "medicareOutpatientVisits": whole(visits),
    }
