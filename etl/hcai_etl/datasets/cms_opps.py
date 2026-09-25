"""CMS Hospital Outpatient PPS: APC national payment rates, plus each hospital's Medicare
outpatient services by comprehensive APC.

Sources:
  * OPPS Addendum A (the newest quarterly update under
    https://www.cms.gov/medicare/payment/prospective-payment-systems/hospital-outpatient-pps/quarterly-addenda-updates):
    every Ambulatory Payment Classification (APC) with its title, status indicator, relative
    weight, and national unadjusted payment rate.
  * data.cms.gov "Medicare Outpatient Hospitals - by Provider and Service" (newest data year):
    services per hospital (CMS CCN) and comprehensive APC. CMS publishes only comprehensive APCs
    here (surgery and procedures that package the rest of the visit), not imaging, ED, or clinic
    visits, so the baseline covers those APCs only.

Licensing. CMS serves the OPPS addenda through its AMA CPT click-through, because Addendum B
carries CPT codes and descriptors. CPT is licensed for internal, non-commercial use only, so
this pipeline uses Addendum A alone and keeps only CMS's APC-level fields (number, title,
status indicator, weight, rate). It never downloads Addendum B, and it stops if Addendum A
has any column or title that looks like CPT content. The Physician Fee Schedule RVU files
are CPT-keyed too, so professional payments aren't ingested: the proposer enters them.

Only service APCs are kept: clinical APCs (5000-8999) and New Technology APCs (1491-1999)
with a service status indicator. Drug, biological, device, and brachytherapy-source APCs
(status indicators G, K, H, U, R, ...) are items, not services a proposal adds volume to.
"""

from __future__ import annotations

import re
import zipfile

import pandas as pd
import requests

from ..core import USER_AGENT, Dataset, Resource, utc_now_iso, write_json
from ..crosswalk import FacilityCrosswalk, match_ccns

CMS = "https://www.cms.gov"
ADDENDA_PAGE = f"{CMS}/medicare/payment/prospective-payment-systems/hospital-outpatient-pps/quarterly-addenda-updates"
CATALOG = "https://data.cms.gov/data.json"
PROVIDER_TITLE = "Medicare Outpatient Hospitals - by Provider and Service"
STATE = "CA"
MONTHS = ["january", "april", "july", "october"]

# Status indicators for services paid by APC (see Addendum D1): comprehensive (J1, J2), partial
# hospitalization (P), packaged-unless (Q1-Q3), significant procedures (S, S1, T), visits (V).
SERVICE_SI = {"J1", "J2", "P", "Q1", "Q2", "Q3", "S", "S1", "T", "V"}

# A CPT code: four digits then a digit or F/T/U (Category II/III), not part of a dollar amount.
CPT_LIKE = re.compile(r"(?<![$\d,.-])\b\d{4}[0-9FTU]\b(?![\d,.])")


def _get(url: str) -> str:
    resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=60)
    resp.raise_for_status()
    return resp.text


class CmsOpps(Dataset):
    id = "cms-opps"
    title = "CMS OPPS: APC national payment rates and hospital outpatient services by comprehensive APC"
    source_page = ADDENDA_PAGE

    def resources(self) -> list[Resource]:
        # Quarterly update pages: .../<month>-<year>-addendum (Addendum A), -addendum-b, -addendum-q.
        index = _get(ADDENDA_PAGE)
        pages = {}
        for month, year in re.findall(r"quarterly-addenda-updates/(january|april|july|october)-(\d{4})-addendum\"", index):
            pages[(int(year), MONTHS.index(month))] = f"{ADDENDA_PAGE}/{month}-{year}-addendum"
        if not pages:
            raise RuntimeError("No Addendum A quarterly pages found; the addenda page layout changed.")
        (year, quarter) = self._quarter = max(pages)
        if self.years:
            wanted = [k for k in pages if k[0] == self.years[-1]]
            if not wanted:
                raise RuntimeError(f"No Addendum A for {self.years[-1]}; available: {sorted(pages)}")
            (year, quarter) = self._quarter = max(wanted)
        self.addendum_page = pages[(year, quarter)]
        # The download link goes through CMS's AMA license page; the file itself is the ?file= path.
        files = re.findall(r"license\.asp\?file=(/files/zip/[^'\"]+\.zip)", _get(self.addendum_page))
        files = sorted(set(f for f in files if "addendum-b" not in f.lower()))
        if len(files) != 1:
            raise RuntimeError(f"{self.addendum_page}: expected one Addendum A zip, found {files}")

        catalog = requests.get(CATALOG, headers={"User-Agent": USER_AGENT}, timeout=120)
        catalog.raise_for_status()
        dataset = next((d for d in catalog.json()["dataset"] if d["title"] == PROVIDER_TITLE), None)
        if dataset is None:
            raise RuntimeError(f"{PROVIDER_TITLE!r} not found in the data.cms.gov catalog")
        by_year = {}
        for dist in dataset.get("distribution", []):
            match = re.search(r":\s*(\d{4})-\d{2}-\d{2}$", dist.get("title", ""))
            if dist.get("mediaType") == "text/csv" and match:
                by_year[int(match.group(1))] = dist
        latest = by_year[max(by_year)]
        return [
            Resource(f"{MONTHS[quarter].title()} {year} OPPS Addendum A", CMS + files[0], "ZIP", tags={"key": "addendumA"}),
            Resource(latest["title"], latest["downloadURL"], "CSV", tags={"key": "services", "year": max(by_year)}),
        ]

    def load(self, files):
        self.crosswalk = FacilityCrosswalk.load(self.refresh)
        paths = {res.tags["key"]: (res, path) for res, path in files}
        self.sources = [{"name": res.name, "url": res.url} for res, _ in files]
        self.services_year = paths["services"][0].tags["year"]
        return {"apcs": self._addendum_a(paths["addendumA"][1]), "services": pd.read_csv(paths["services"][1], dtype=str, encoding="latin1")}

    def _addendum_a(self, path) -> pd.DataFrame:
        with zipfile.ZipFile(path) as z:
            names = [n for n in z.namelist() if n.lower().endswith(".xlsx") and not n.startswith("__MACOSX")]
            if len(names) != 1:
                raise RuntimeError(f"{path.name}: expected one .xlsx, found {names}")
            with z.open(names[0]) as f:
                raw = pd.read_excel(f, header=None, dtype=str)
        header_at = next((i for i in range(15) if str(raw.iloc[i, 0]).strip() == "APC"), None)
        if header_at is None:
            raise RuntimeError("Addendum A: no header row starting with 'APC'; the layout changed.")
        title_row = " ".join(str(v) for v in raw.iloc[:header_at, 0] if pd.notna(v))
        cy = re.search(r"CY (\d{4})", title_row)
        self.calendar_year = int(cy.group(1)) if cy else None
        df = raw.iloc[header_at + 1 :].copy()
        df.columns = [re.sub(r"\s+", " ", str(c)).strip() for c in raw.iloc[header_at]]
        need = ["APC", "Group Title", "SI", "Relative Weight", "Payment Rate"]
        missing = [c for c in need if c not in df.columns]
        if missing:
            raise RuntimeError(f"Addendum A: missing columns {missing}")
        # Licensing guard: Addendum A is APC-level. A HCPCS/CPT column or CPT-looking title means the file changed.
        if any(re.search(r"hcpcs|cpt", c, re.I) for c in df.columns):
            raise RuntimeError(f"Addendum A has a HCPCS/CPT column ({list(df.columns)}); refusing to ingest CPT content.")
        cpt = df["Group Title"].fillna("").str.contains(CPT_LIKE)
        if cpt.any():
            raise RuntimeError(f"Addendum A titles look like they contain CPT codes: {df.loc[cpt, 'Group Title'].head().tolist()}")
        return df[need]

    def build(self, data: dict) -> None:
        apcs = data["apcs"].copy()
        apcs["code"] = apcs["APC"].str.strip().str.zfill(4)
        apcs["n"] = pd.to_numeric(apcs["code"], errors="coerce")
        apcs["si"] = apcs["SI"].str.strip()
        apcs["rate"] = pd.to_numeric(apcs["Payment Rate"].str.replace(r"[$,\s]", "", regex=True), errors="coerce")
        apcs["weight"] = pd.to_numeric(apcs["Relative Weight"], errors="coerce")
        keep = apcs["si"].isin(SERVICE_SI) & apcs["rate"].gt(0) & ((apcs["n"].between(5000, 8999)) | (apcs["n"].between(1491, 1999)))
        kept = apcs[keep].sort_values("code")
        out = [
            {
                "code": r["code"],
                "title": re.sub(r"\s+", " ", str(r["Group Title"])).strip(),
                "si": r["si"],
                "weight": round(float(r["weight"]), 4) if pd.notna(r["weight"]) else None,
                "rate": round(float(r["rate"]), 2),
            }
            for _, r in kept.iterrows()
        ]
        if len(out) < 150:
            raise RuntimeError(f"Addendum A: only {len(out)} service APCs; expected ~290.")
        # The conversion factor: rate / weight for APCs that have a weight (they should all agree).
        factors = (kept["rate"] / kept["weight"]).dropna()
        factor = round(float(factors.median()), 3) if len(factors) else None

        services = self._services(data["services"])
        year, quarter = self._quarter
        write_json(self.out_dir / "apcs.json", out)
        write_json(self.out_dir / "services.json", services["byHospital"])
        write_json(
            self.out_dir / "manifest.json",
            {
                "id": self.id,
                "title": self.title,
                "sourcePage": self.addendum_page,
                "calendarYear": self.calendar_year or year,
                "quarter": f"{MONTHS[quarter].title()} {year}",
                "conversionFactor": factor,
                "apcCount": len(out),
                "services": {
                    "year": self.services_year,
                    "sourcePage": "https://data.cms.gov/provider-summary-by-type-of-service/medicare-outpatient-hospitals/medicare-outpatient-hospitals-by-provider-and-service",
                    "apcs": services["apcs"],
                    "sharedReporting": services["shared"],
                    "coverage": services["coverage"],
                },
                "sources": self.sources,
                "crosswalk": self.crosswalk.sources,
                "generatedAt": utc_now_iso(),
                "notes": [
                    "Payment rate: Addendum A's national unadjusted OPPS payment rate (relative weight x conversion factor), before the wage index adjustment and before discounts for multiple procedures.",
                    "Only APC-level fields are kept; CPT/HCPCS content (Addendum B) isn't downloaded, under the AMA CPT license terms.",
                    "Baseline services: Original Medicare (fee-for-service) outpatient services by comprehensive APC. CMS omits counts under 11, and publishes no per-hospital counts for other APCs.",
                ],
            },
            compact=False,
        )
        print(f"  {len(out)} service APCs ({MONTHS[quarter].title()} {year}); conversion factor {factor}; baseline {services['coverage']}")

    def _services(self, df: pd.DataFrame) -> dict:
        df.columns = [c.strip() for c in df.columns]
        need = {"Rndrng_Prvdr_CCN", "Rndrng_Prvdr_Org_Name", "Rndrng_Prvdr_State_Abrvtn", "Rndrng_Prvdr_Zip5", "APC_Cd", "CAPC_Srvcs"}
        missing = need - set(df.columns)
        if missing:
            raise RuntimeError(f"{PROVIDER_TITLE}: missing columns {sorted(missing)}")
        df = df[df["Rndrng_Prvdr_State_Abrvtn"] == STATE].copy()
        df["ccn"] = df["Rndrng_Prvdr_CCN"].str.strip().str.zfill(6)
        df["apc"] = df["APC_Cd"].str.strip().str.zfill(4)
        df["n"] = pd.to_numeric(df["CAPC_Srvcs"], errors="coerce")
        names = dict(zip(df["ccn"], df["Rndrng_Prvdr_Org_Name"].str.strip()))
        zips = dict(zip(df["ccn"], df["Rndrng_Prvdr_Zip5"].str.strip().str.zfill(5)))
        ccn_to_hcai, shared, by_name = match_ccns(self.crosswalk, df["ccn"].unique(), names, zips)
        # Blank counts are CMS suppressing 1-10 services: leave them out, so they read as "fewer than 11", not 0.
        matched = df[df["ccn"].isin(ccn_to_hcai) & df["n"].notna()].copy()
        matched["hcai"] = matched["ccn"].map(ccn_to_hcai)
        # Every matched hospital gets an entry, even when all its counts are suppressed (then it's {}: "under 11 each").
        by_hospital: dict[str, dict[str, int]] = {h: {} for h in set(ccn_to_hcai.values())}
        for (hcai, apc), n in matched.groupby(["hcai", "apc"])["n"].sum().items():
            by_hospital.setdefault(hcai, {})[apc] = int(n)
        return {
            "byHospital": {h: {str(self.services_year): v} for h, v in by_hospital.items()},
            "apcs": sorted(df["apc"].unique()),
            "shared": shared,
            "coverage": {
                "cmsHospitals": len(names),
                "matchedHospitals": len(by_hospital),
                "hospitalsAllSuppressed": sum(1 for v in by_hospital.values() if not v),
                "matchedByNameAndZip": len(by_name),
                "unmatched": [{"ccn": c, "name": names[c]} for c in sorted(set(names) - set(ccn_to_hcai))],
            },
        }
