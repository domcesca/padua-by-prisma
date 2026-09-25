"""CMS Medicare penalty programs: Hospital Readmissions Reduction Program (HRRP) and the
Hospital-Acquired Condition (HAC) Reduction Program, per California hospital.

Propose's avoided-penalty module re-runs CMS's published formulas with the hospital's own
published components, changed by the reduction the user enters. Sources:

  * HRRP, per condition: data.cms.gov Provider Data Catalog "Hospital Readmissions Reduction
    Program" (9n3s-kdb3) for the predicted and expected readmission rates, and the IPPS final
    rule's "HRRP Supplemental Data File" for the same fiscal year: ERRs, peer group medians,
    DRG payment ratios, the neutrality modifier, and the payment reduction. The payment
    reduction formula is checked against CMS's published reduction for every hospital.
  * HAC: Provider Data Catalog "Hospital-Acquired Condition (HAC) Reduction Program"
    (yq43-i98g): measure results, Winsorized z-scores, Total HAC Score, and whether the 1%
    reduction applied. CMS doesn't publish the national mean, standard deviation, and
    Winsorization bounds of each measure, so they're recovered from the national file (the
    z-score is a straight line in the result) and checked to reproduce every hospital's
    z-scores and Total HAC Score. The worst-quartile cutoff is the highest Total HAC Score that
    wasn't penalized.
  * Medicare payments (the base the penalties apply to): the newest IPPS final rule Impact
    File (transfer-adjusted cases, case mix index, wage index, IME, DSH, and outlier factors)
    with Table 1A/1B's standardized amounts. These are estimates, not the hospital's claims.

The hospital-level HRRP and HAC files trail the fiscal year: CMS posts a year's HRRP
supplemental file with the final rule or shortly after, and the HAC file in the January of
the fiscal year. The newest year with each program's full set is used. (The Impact File's
"proxy" readmission factor isn't used: it's the prior year's factor carried forward.)
"""

from __future__ import annotations

import re
import zipfile

import numpy as np
import openpyxl
import pandas as pd
import requests

from ..core import USER_AGENT, Dataset, Resource, utc_now_iso, write_json
from ..crosswalk import FacilityCrosswalk, match_ccns
from .cms_ipps import CMS, IPPS_PAGE, _get, _xlsx, parse_table1

PDC_ITEMS = "https://data.cms.gov/provider-data/api/1/metastore/schemas/dataset/items"
HRRP_ID = "9n3s-kdb3"
HAC_ID = "yq43-i98g"
GENERAL_ID = "xubh-q36u"
STATE = "CA"

# Supplemental-file label -> (app key, Provider Data Catalog measure).
CONDITIONS = {
    "AMI": ("ami", "READM-30-AMI-HRRP"),
    "COPD": ("copd", "READM-30-COPD-HRRP"),
    "HF": ("hf", "READM-30-HF-HRRP"),
    "pneumonia": ("pn", "READM-30-PN-HRRP"),
    "CABG": ("cabg", "READM-30-CABG-HRRP"),
    "THA/TKA": ("hipKnee", "READM-30-HIP-KNEE-HRRP"),
}
# A condition counts toward the penalty only with at least this many eligible discharges.
HRRP_MIN_DISCHARGES = 25
HRRP_CAP = 0.03

# HAC file column prefix -> (app key, result column suffix).
HAC_MEASURES = {
    "PSI 90": ("psi90", "Composite Value"),
    "CLABSI": ("clabsi", "SIR"),
    "CAUTI": ("cauti", "SIR"),
    "SSI": ("ssi", "SIR"),
    "CDI": ("cdi", "SIR"),
    "MRSA": ("mrsa", "SIR"),
}


def _pdc_csv(dataset_id: str) -> tuple[str, str]:
    """(title, download URL) of a Provider Data Catalog dataset's current CSV."""
    resp = requests.get(f"{PDC_ITEMS}/{dataset_id}", headers={"User-Agent": USER_AGENT}, timeout=60)
    resp.raise_for_status()
    item = resp.json()
    urls = [d["downloadURL"] for d in item.get("distribution", []) if d.get("downloadURL", "").lower().endswith(".csv")]
    if len(urls) != 1:
        raise RuntimeError(f"{dataset_id}: expected one CSV, found {urls}")
    return item["title"], urls[0]


def _fy_of(url: str) -> int:
    match = re.search(r"FY_?(\d{4})", url, re.I)
    if not match:
        raise RuntimeError(f"No fiscal year in {url}")
    return int(match.group(1))


def _rule_links(fy: int) -> list[tuple[str, str]]:
    """(link text, /files/... path) for every file on a fiscal year's final rule page."""
    page = _get(f"{IPPS_PAGE}/fy-{fy}-ipps-final-rule-home-page")
    out = []
    for m in re.finditer(r'<a[^>]+href="(/files/[^"]+)"[^>]*>(.*?)</a>', page, flags=re.S):
        out.append((re.sub(r"<[^>]+>|\s+", " ", m.group(2)).strip(), m.group(1)))
    return out


def _num(v) -> float | None:
    try:
        x = float(str(v).replace(",", "").strip())
    except (TypeError, ValueError):
        return None
    return None if np.isnan(x) else x


def _round(v: float | None, digits: int) -> float | None:
    return None if v is None else round(v, digits)


class CmsPenalties(Dataset):
    id = "cms-penalties"
    title = "CMS penalty programs: Hospital Readmissions Reduction Program and HAC Reduction Program"
    source_page = "https://data.cms.gov/provider-data/topics/hospitals"

    def resources(self) -> list[Resource]:
        hrrp_title, hrrp_url = _pdc_csv(HRRP_ID)
        hac_title, hac_url = _pdc_csv(HAC_ID)
        general_title, general_url = _pdc_csv(GENERAL_ID)
        self.hrrp_fy, self.hac_fy = _fy_of(hrrp_url), _fy_of(hac_url)

        # The HRRP supplemental file for the same fiscal year as the Provider Data Catalog file.
        supplemental = [
            (text, href)
            for text, href in _rule_links(self.hrrp_fy)
            if re.search(r"readmissions reduction program supplemental", text, re.I) and href.endswith(".zip")
        ]
        if len(supplemental) != 1:
            raise RuntimeError(f"FY {self.hrrp_fy}: expected one HRRP supplemental file on its final rule page, found {supplemental}")

        # Payments: the newest final rule's Impact File and Tables 1A-1E.
        years = sorted({int(y) for y in re.findall(r"/fy-(\d{4})-ipps-final-rule-home-page", _get(IPPS_PAGE))})
        self.payment_fy = self.years[-1] if self.years else years[-1]
        links = _rule_links(self.payment_fy)
        impact = [href for text, href in links if re.search(r"impact file", text, re.I) and href.endswith(".zip")]
        table1 = [href for _, href in links if re.search(rf"fy-?{self.payment_fy}-ipps-fr-table-1a-1e\.zip$", href)]
        if len(impact) != 1 or len(table1) != 1:
            raise RuntimeError(f"FY {self.payment_fy}: expected one Impact File and one Table 1A-1E, found {impact} {table1}")

        return [
            Resource(hrrp_title, hrrp_url, "CSV", tags={"key": "hrrp"}),
            Resource(supplemental[0][0], CMS + supplemental[0][1], "ZIP", tags={"key": "supplemental"}),
            Resource(hac_title, hac_url, "CSV", tags={"key": "hac"}),
            Resource(general_title, general_url, "CSV", tags={"key": "general"}),
            Resource(f"FY {self.payment_fy} final rule Impact File", CMS + impact[0], "ZIP", tags={"key": "impact"}),
            Resource(f"FY {self.payment_fy} final rule Tables 1A-1E", CMS + table1[0], "ZIP", tags={"key": "table1"}),
        ]

    # ------------------------------------------------------------------ #

    def load(self, files):
        self.crosswalk = FacilityCrosswalk.load(self.refresh)
        paths = {res.tags["key"]: path for res, path in files}
        self.sources = [{"name": res.name, "url": res.url} for res, _ in files]
        read = lambda p: pd.read_csv(p, dtype=str, encoding="latin1")  # noqa: E731
        return {
            "hrrp": read(paths["hrrp"]),
            "supplemental": self._supplemental(paths["supplemental"]),
            "hac": read(paths["hac"]),
            "general": read(paths["general"]),
            "impact": self._impact(paths["impact"]),
            "rates": parse_table1(_xlsx(paths["table1"])),
        }

    def _supplemental(self, path) -> pd.DataFrame:
        with zipfile.ZipFile(path) as z:
            names = [n for n in z.namelist() if n.lower().endswith(".xlsx")]
            if len(names) != 1:
                raise RuntimeError(f"{path.name}: expected one .xlsx, found {names}")
            with z.open(names[0]) as f:
                sheets = pd.read_excel(f, sheet_name=None, header=None, dtype=str)
        sheet = next((s for s in sheets if re.fullmatch(rf"FR FY {self.hrrp_fy}", s.strip())), None)
        if sheet is None:
            raise RuntimeError(f"HRRP supplemental file: no 'FR FY {self.hrrp_fy}' sheet in {list(sheets)}")
        raw = sheets[sheet]
        header_at = next(i for i in range(10) if str(raw.iloc[i, 0]).strip() == "Hospital CCN")
        df = raw.iloc[header_at + 1 :].copy()
        df.columns = [re.sub(r"\s+", " ", str(c)).strip() for c in raw.iloc[header_at]]
        need = ["Hospital CCN", "Payment adjustment factor", "Payment reduction percentage", "Peer group assignment", "Neutrality modifier"]
        need += [f"{col} {c}" for c in CONDITIONS for col in ("Number of eligible discharges for", "ERR for", "Peer group median ERR for", "DRG payment ratio for")]
        missing = [c for c in need if c not in df.columns]
        if missing:
            raise RuntimeError(f"HRRP supplemental file: missing columns {missing}")
        return df

    def _impact(self, path) -> pd.DataFrame:
        with zipfile.ZipFile(path) as z:
            names = [n for n in z.namelist() if n.lower().endswith(".xlsx")]
            if len(names) != 1:
                raise RuntimeError(f"{path.name}: expected one .xlsx, found {names}")
            with z.open(names[0]) as f:
                wb = openpyxl.load_workbook(f, read_only=True, data_only=True)
                sheet = next(ws for ws in wb.worksheets if "variable" not in ws.title.lower())
                rows = [tuple(r) for r in sheet.iter_rows(values_only=True)]
        header_at = next(i for i, r in enumerate(rows[:10]) if str(r[0]).strip() == "Provider Number")
        df = pd.DataFrame(rows[header_at + 1 :], columns=[str(c).strip() for c in rows[header_at]])
        # Case counts and CMI are labeled with the grouper version (CASETA44 = Grouper V44); use the newest.
        versions = sorted(int(m.group(1)) for c in df.columns if (m := re.fullmatch(r"CASETA(\d+)", c)))
        if not versions:
            raise RuntimeError("Impact File: no CASETA<grouper> column")
        v = versions[-1]
        rename = {f"CASETA{v}": "cases", f"CMIV{v}": "cmi", f"FY {self.payment_fy} Wage Index": "wageIndex"}
        need = list(rename) + ["Provider Number", "Name", "TCHOP", "DSHOPP", "OUTFACT_F"]
        missing = [c for c in need if c not in df.columns]
        if missing:
            raise RuntimeError(f"Impact File: missing columns {missing}")
        return df.rename(columns=rename)

    # ------------------------------------------------------------------ #

    def build(self, data: dict) -> None:
        general = data["general"]
        general = general[general["State"] == STATE]
        names = dict(zip(general["Facility ID"].str.zfill(6), general["Facility Name"].str.strip()))
        zips = dict(zip(general["Facility ID"].str.zfill(6), general["ZIP Code"].str.strip().str[:5].str.zfill(5)))

        hrrp = self._build_hrrp(data["hrrp"], data["supplemental"])
        hac, hac_national = self._build_hac(data["hac"])
        payments = self._build_payments(data["impact"], data["rates"])

        ccns = sorted(set(hrrp) | set(hac) | set(payments))
        for ccn in ccns:
            names.setdefault(ccn, (hrrp.get(ccn) or hac.get(ccn) or {}).get("name") or payments.get(ccn, {}).get("name", ""))
        ccn_to_hcai, shared, by_name = match_ccns(self.crosswalk, ccns, names, zips)

        hospitals: dict[str, dict] = {}
        for ccn in ccns:
            hcai = ccn_to_hcai.get(ccn)
            if not hcai:
                continue
            if hcai in hospitals:
                # Two CCNs on one hospital: keep the one with HRRP results (the current certification).
                if not hrrp.get(ccn):
                    continue
            hospitals[hcai] = {
                "ccn": ccn,
                "cmsName": names.get(ccn),
                "hrrp": {k: v for k, v in (hrrp.get(ccn) or {}).items() if k != "name"} or None,
                "hac": {k: v for k, v in (hac.get(ccn) or {}).items() if k != "name"} or None,
                "payments": {k: v for k, v in (payments.get(ccn) or {}).items() if k != "name"} or None,
            }

        unmatched = [{"ccn": c, "name": names.get(c)} for c in ccns if c not in ccn_to_hcai]
        rates = data["rates"]
        write_json(self.out_dir / "hospitals.json", hospitals)
        write_json(
            self.out_dir / "manifest.json",
            {
                "id": self.id,
                "title": self.title,
                "sourcePage": self.source_page,
                "hrrp": {
                    "fiscalYear": self.hrrp_fy,
                    "period": self.hrrp_period,
                    "minDischarges": HRRP_MIN_DISCHARGES,
                    "cap": HRRP_CAP,
                    "sourcePage": "https://data.cms.gov/provider-data/dataset/9n3s-kdb3",
                },
                "hac": {
                    "fiscalYear": self.hac_fy,
                    "periods": self.hac_periods,
                    "reduction": 0.01,
                    **hac_national,
                    "sourcePage": "https://data.cms.gov/provider-data/dataset/yq43-i98g",
                },
                "payments": {
                    "fiscalYear": self.payment_fy,
                    "sourcePage": f"{IPPS_PAGE}/fy-{self.payment_fy}-ipps-final-rule-home-page",
                    "standardizedAmount": {
                        "wageIndexAboveOne": {k: rates["operating"][k] for k in ("laborRelated", "nonlaborRelated")},
                        "wageIndexAtMostOne": rates["operatingLowWage"],
                    },
                },
                "sources": self.sources,
                "crosswalk": self.crosswalk.sources,
                "sharedReporting": shared,
                "coverage": {
                    "cmsHospitals": len(ccns),
                    "matchedHospitals": len(hospitals),
                    "withHrrp": sum(1 for h in hospitals.values() if h["hrrp"]),
                    "withHac": sum(1 for h in hospitals.values() if h["hac"]),
                    "withPayments": sum(1 for h in hospitals.values() if h["payments"]),
                    "matchedByNameAndZip": by_name,
                    "unmatched": unmatched,
                },
                "generatedAt": utc_now_iso(),
                "notes": [
                    "HRRP payment reduction = min(3%, neutrality modifier x sum over conditions with 25+ eligible discharges of DRG payment ratio x max(0, ERR - peer group median ERR)); it applies to base operating DRG payments.",
                    "HAC: Total HAC Score = equally weighted average of the Winsorized z-scores the hospital has; above the national 75th percentile, all Medicare fee-for-service operating payments are reduced 1%.",
                    "Payments are estimated from the Impact File: transfer-adjusted cases x case mix index x the wage-adjusted standardized amount (base operating DRG payments), plus IME, DSH, and outlier add-ons for the HAC base. Capital and uncompensated care payments aren't included.",
                ],
            },
            compact=False,
        )
        print(f"  {len(hospitals)} California hospitals matched ({len(unmatched)} CCNs unmatched)")

    def _build_hrrp(self, pdc: pd.DataFrame, sup: pd.DataFrame) -> dict[str, dict]:
        pdc = pdc.copy()
        pdc["ccn"] = pdc["Facility ID"].str.strip().str.zfill(6)
        starts, ends = pdc["Start Date"].dropna().unique(), pdc["End Date"].dropna().unique()
        if len(starts) != 1 or len(ends) != 1:
            raise RuntimeError(f"HRRP: expected one performance period, found {starts} {ends}")
        self.hrrp_period = {"start": pd.to_datetime(starts[0]).date().isoformat(), "end": pd.to_datetime(ends[0]).date().isoformat()}
        by_measure = {(r["ccn"], r["Measure Name"]): r for _, r in pdc.iterrows()}

        sup = sup.copy()
        sup["ccn"] = sup["Hospital CCN"].str.strip().str.zfill(6)
        out: dict[str, dict] = {}
        worst = 0.0
        for _, r in sup.iterrows():
            modifier = _num(r["Neutrality modifier"])
            conditions: dict[str, dict] = {}
            total = 0.0
            for label, (key, measure) in CONDITIONS.items():
                n = _num(r[f"Number of eligible discharges for {label}"])
                err = _num(r[f"ERR for {label}"])
                median = _num(r[f"Peer group median ERR for {label}"])
                ratio = _num(r[f"DRG payment ratio for {label}"])
                if n is not None and n >= HRRP_MIN_DISCHARGES and err is not None and median is not None and ratio is not None:
                    total += ratio * max(0.0, err - median)
                if err is None:
                    continue
                p = by_measure.get((r["ccn"], measure))
                conditions[key] = {
                    "discharges": int(n) if n is not None else None,
                    "err": round(err, 6),
                    "peerMedian": _round(median, 6),
                    "paymentRatio": _round(ratio, 6),
                    "predicted": _num(p["Predicted Readmission Rate"]) if p is not None else None,
                    "expected": _num(p["Expected Readmission Rate"]) if p is not None else None,
                    "readmissions": _num(p["Number of Readmissions"]) if p is not None else None,
                }
            reduction = _num(r["Payment reduction percentage"])
            calc = min(HRRP_CAP, total * (modifier or 0))
            worst = max(worst, abs(calc - (reduction or 0)))
            if not r["ccn"].startswith("05"):
                continue
            out[r["ccn"]] = {
                "fiscalYear": self.hrrp_fy,
                "adjustmentFactor": _num(r["Payment adjustment factor"]),
                "reduction": reduction,
                "peerGroup": int(_num(r["Peer group assignment"]) or 0) or None,
                "neutralityModifier": modifier,
                "conditions": conditions,
            }
        # The published reduction is rounded to 4 decimals.
        if worst > 0.00006:
            raise RuntimeError(f"HRRP: formula doesn't reproduce CMS's payment reduction (off by up to {worst:.5f})")
        print(f"  HRRP FY {self.hrrp_fy}: formula reproduces every published reduction (max diff {worst:.6f}); {len(out)} California hospitals")
        return out

    def _build_hac(self, df: pd.DataFrame) -> tuple[dict[str, dict], dict]:
        df = df.copy()
        df["ccn"] = df["Facility ID"].str.strip().str.zfill(6)
        fys = df["Fiscal Year"].dropna().unique()
        if len(fys) != 1 or int(fys[0]) != self.hac_fy:
            raise RuntimeError(f"HAC: expected fiscal year {self.hac_fy}, found {fys}")
        self.hac_periods = {
            "psi90": {"start": pd.to_datetime(df["PSI 90 Start Date"].dropna().iloc[0]).date().isoformat(), "end": pd.to_datetime(df["PSI 90 End Date"].dropna().iloc[0]).date().isoformat()},
            "hai": {"start": pd.to_datetime(df["HAI Measures Start Date"].dropna().iloc[0]).date().isoformat(), "end": pd.to_datetime(df["HAI Measures End Date"].dropna().iloc[0]).date().isoformat()},
        }

        # Recover each measure's national mean, SD, and Winsorization bounds: z = (x - mean) / sd
        # for results between the bounds; results outside them share the bound's z-score.
        measures: dict[str, dict] = {}
        for prefix, (key, suffix) in HAC_MEASURES.items():
            x = pd.to_numeric(df[f"{prefix} {suffix}"], errors="coerce")
            z = pd.to_numeric(df[f"{prefix} W Z Score"], errors="coerce")
            ok = x.notna() & z.notna()
            x, z = x[ok], z[ok]
            inner = (z > z.min() + 1e-9) & (z < z.max() - 1e-9)
            slope, intercept = np.polyfit(x[inner], z[inner], 1)
            sd, mean = 1 / slope, -intercept / slope
            low, high = mean + z.min() * sd, mean + z.max() * sd
            recomputed = (x.clip(low, high) - mean) / sd
            err = (recomputed - z).abs().max()
            # PSI 90 is published to 4 decimals and its z-score to 4: allow a little more slack.
            if err > (0.003 if key == "psi90" else 0.0005):
                raise RuntimeError(f"HAC {prefix}: recovered mean/SD don't reproduce the z-scores (off by {err:.4f})")
            measures[key] = {"mean": round(mean, 5), "sd": round(sd, 5), "low": round(max(low, 0.0), 4), "high": round(high, 4)}

        total = pd.to_numeric(df["Total HAC Score"], errors="coerce")
        zs = pd.DataFrame({key: pd.to_numeric(df[f"{p} W Z Score"], errors="coerce") for p, (key, _) in HAC_MEASURES.items()})
        off = (zs.mean(axis=1) - total).abs()[total.notna()].max()
        if off > 0.0005:
            raise RuntimeError(f"HAC: Total HAC Score isn't the average of the z-scores (off by {off:.4f})")
        penalized = df["Payment Reduction"].str.strip()
        scored = total.notna() & (df["State"] != "MD")
        cutoff = float(total[scored & (penalized == "No")].max())
        lowest_penalized = float(total[scored & (penalized == "Yes")].min())
        if lowest_penalized <= cutoff:
            raise RuntimeError(f"HAC: penalized and unpenalized scores overlap ({lowest_penalized} <= {cutoff})")

        out: dict[str, dict] = {}
        for i, r in df[df["State"] == STATE].iterrows():
            results = {}
            for prefix, (key, suffix) in HAC_MEASURES.items():
                value, z = _num(r[f"{prefix} {suffix}"]), _num(r[f"{prefix} W Z Score"])
                if z is not None:
                    results[key] = {"value": value, "z": z}
            out[r["ccn"]] = {
                "fiscalYear": self.hac_fy,
                "measures": results,
                "totalScore": _num(r["Total HAC Score"]),
                "penalized": {"Yes": True, "No": False}.get(str(r["Payment Reduction"]).strip()),
                "footnote": str(r["Total HAC Score Footnote"]).strip() if pd.notna(r["Total HAC Score Footnote"]) else None,
            }
        print(f"  HAC FY {self.hac_fy}: cutoff {cutoff} (lowest penalized {lowest_penalized}); {len(out)} California hospitals")
        return out, {"measures": measures, "cutoff": cutoff, "lowestPenalized": lowest_penalized}

    def _build_payments(self, impact: pd.DataFrame, rates: dict) -> dict[str, dict]:
        impact = impact.copy()
        impact["ccn"] = impact["Provider Number"].astype(str).str.strip().str.zfill(6)
        high = rates["operating"]
        low = rates["operatingLowWage"]
        out: dict[str, dict] = {}
        for _, r in impact[impact["ccn"].str.startswith("05")].iterrows():
            cases, cmi, wi = _num(r["cases"]), _num(r["cmi"]), _num(r["wageIndex"])
            if not (cases and cmi and wi):
                continue
            split = high if wi > 1 else low
            rate = split["laborRelated"] * wi + split["nonlaborRelated"]
            base = cases * cmi * rate
            ime, dsh, outlier = (_num(r[c]) or 0.0 for c in ("TCHOP", "DSHOPP", "OUTFACT_F"))
            operating = base * (1 + ime + dsh) * (1 + outlier)
            out[r["ccn"]] = {
                "name": str(r["Name"]).strip(),
                "fiscalYear": self.payment_fy,
                "cases": round(cases, 1),
                "caseMixIndex": round(cmi, 4),
                "wageIndex": round(wi, 4),
                "ime": round(ime, 5),
                "dsh": round(dsh, 5),
                "outlier": round(outlier, 5),
                "baseOperating": round(base),
                "operating": round(operating),
            }
        return out
