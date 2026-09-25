"""CMS Care Compare hospital quality measures (Provider Data Catalog, Hospitals theme).

Care Compare publishes only the current quarter's snapshot, so the trend comes
from CMS's archived snapshots: we take the last snapshot of each calendar year
(plus the newest) and file each value under the year its measurement period
ENDS. When two snapshots cover the same end year, the later one wins (CMS
sometimes republishes a period, e.g. PSI 90 ending June 2021).

What varies between snapshots and is handled here:
  * file names: "Unplanned Hospital Visits - Hospital.csv", "632h-zaca.csv" (2020),
    "632h-zaca_2026-07-22_Unplanned_Hospital_Visits-Hospital.csv" — matched by
    dataset id or normalized name;
  * columns ("County Name" -> "County/Parish", "City" -> "City/Town");
  * measure IDs (PSI_90_SAFETY -> PSI_90); the retired claims-based hospital-wide
    readmission measure and its hybrid replacement are kept apart.

Hospitals are keyed by CMS CCN, mapped to HCAI facility numbers through CDPH's
facility listing. A few systems certify several separately licensed hospitals
under one CCN (UCI Health; Alameda Health System); CMS's combined score is filed
under the hospital whose name matches CMS's listing, and the others are recorded
as "reported with" it rather than given a copy of the number.
"""

from __future__ import annotations

import difflib
import json
import re
import zipfile
from datetime import datetime

import pandas as pd

from ..core import PROCESSED_DIR, USER_AGENT, Dataset, Resource, clean_value, utc_now_iso, write_json
from ..crosswalk import FacilityCrosswalk
from ..dictionary import cms_care_compare as dictionary

import requests

ARCHIVE_API = "https://data.cms.gov/provider-data/api/1/archive/aggregate/theme/hospitals/relative"
ARCHIVE_ROOT = "https://data.cms.gov"
DEFAULT_FIRST_YEAR = 2019
STATE = "CA"

# Care Compare file -> (dataset identifier, normalized file name).
FILES = {
    "unplanned": ("632h-zaca", "unplannedhospitalvisitshospital"),
    "complications": ("ynj2-r877", "complicationsanddeathshospital"),
    "hcahps": ("dgck-syfz", "hcahpshospital"),
    "timely": ("yv7e-xc69", "timelyandeffectivecarehospital"),
    "general": ("xubh-q36u", "hospitalgeneralinformation"),
}
FOOTNOTE_URL = "https://data.cms.gov/provider-data/sites/default/files/resources/f29bb7c812e242f6edfef0a4b7d0eaca_1760630713/Footnote_Crosswalk.csv"

COMPARED = {
    "better than the national rate": "better",
    "better than the national value": "better",
    "no different than the national rate": "same",
    "no different than the national value": "same",
    "worse than the national rate": "worse",
    "worse than the national value": "worse",
}


def _file_key(name: str) -> str | None:
    base = name.rsplit("/", 1)[-1]
    if base.startswith("._") or "__MACOSX" in name:
        return None
    stem = re.sub(r"\.csv$", "", base, flags=re.I)
    for key, (dataset_id, normalized) in FILES.items():
        if stem == dataset_id or stem.startswith(f"{dataset_id}_") and re.sub(r"[^a-z]", "", stem.lower()).endswith(normalized):
            return key
        if re.sub(r"[^a-z]", "", stem.lower()) == normalized:
            return key
    return None


def _num(value) -> float | None:
    try:
        v = float(str(value).replace(",", "").replace("%", ""))
    except (TypeError, ValueError):
        return None
    return None if pd.isna(v) else v


def _date(value) -> datetime | None:
    try:
        return datetime.strptime(str(value).strip(), "%m/%d/%Y")
    except ValueError:
        return None


def _period(start: datetime | None, end: datetime | None) -> str | None:
    if not end:
        return None
    fmt = lambda d: d.strftime("%b %Y")  # noqa: E731
    return f"{fmt(start)}–{fmt(end)}" if start else f"Through {fmt(end)}"


class CmsCareCompare(Dataset):
    id = "cms-care-compare"
    title = "CMS Care Compare — Hospital quality measures"
    source_page = "https://data.cms.gov/provider-data/topics/hospitals"

    def resources(self) -> list[Resource]:
        resp = requests.get(ARCHIVE_API, headers={"User-Agent": USER_AGENT}, timeout=60)
        resp.raise_for_status()
        snapshots = [s for s in resp.json()["data"] if s["type"] == "theme"]
        latest_by_year: dict[int, dict] = {}
        for snap in snapshots:
            year = int(snap["date"][:4])
            if (self.years and year not in self.years) or (not self.years and year < DEFAULT_FIRST_YEAR):
                continue
            if year not in latest_by_year or snap["date"] > latest_by_year[year]["date"]:
                latest_by_year[year] = snap
        return [
            Resource(name=s["name"], url=ARCHIVE_ROOT + s["url"], format="ZIP", tags={"date": s["date"]})
            for _, s in sorted(latest_by_year.items())
        ]

    # ------------------------------------------------------------------ #

    def load(self, files):
        self.crosswalk = FacilityCrosswalk.load(self.refresh)
        from ..core import download

        footnotes = pd.read_csv(
            download(Resource("Footnote Crosswalk", FOOTNOTE_URL, "CSV"), self.raw_dir, self.refresh), dtype=str
        )
        self.footnotes = dict(zip(footnotes["Footnote"].str.strip(), footnotes["Footnote Text"].str.strip()))

        measures_by_source: dict[str, list[tuple[str, dict]]] = {}
        for key, m in dictionary.MEASURES.items():
            measures_by_source.setdefault(m["source"], []).append((key, m))

        records = []
        self.cms_names: dict[str, str] = {}
        self.cms_zips: dict[str, str] = {}
        for res, path in files:
            snapshot = res.tags["date"]
            with zipfile.ZipFile(path) as z:
                for name in z.namelist():
                    source = _file_key(name)
                    if source not in measures_by_source:
                        continue
                    frame = self._read(z, name, source)
                    for ccn, fname, zip_code in zip(frame["Facility ID"], frame["Facility Name"], frame["ZIP Code"]):
                        self.cms_names[ccn] = fname
                        self.cms_zips[ccn] = str(zip_code).strip()[:5].zfill(5)
                    for key, m in measures_by_source[source]:
                        records.extend(self._extract(frame, source, key, m, snapshot))
            print(f"  {snapshot}: {len(records):,} values so far")
        self.sources = [{"snapshot": r.tags["date"], "name": r.name, "url": r.url} for r, _ in files]
        return pd.DataFrame(records)

    def _read(self, z: zipfile.ZipFile, name: str, source: str) -> pd.DataFrame:
        chunks = []
        with z.open(name) as fh:
            for chunk in pd.read_csv(fh, dtype=str, encoding="latin1", chunksize=200_000):
                chunk.columns = [c.strip() for c in chunk.columns]
                chunks.append(chunk[chunk["State"] == STATE])
        frame = pd.concat(chunks, ignore_index=True)
        frame["Facility ID"] = frame["Facility ID"].str.strip().str.zfill(6)
        return frame

    def _footnote(self, *values) -> str | None:
        texts = []
        for value in values:
            if isinstance(value, str):
                for code in re.split(r"[,\s]+", value.strip()):
                    if code in self.footnotes and self.footnotes[code] not in texts:
                        texts.append(self.footnotes[code])
        return " ".join(texts) or None

    def _extract(self, frame: pd.DataFrame, source: str, key: str, m: dict, snapshot: str) -> list[dict]:
        out = []
        if source == "general":
            year = int(snapshot[:4])
            published = datetime.strptime(snapshot, "%Y-%m-%d").strftime("%b %Y")
            for r in frame.to_dict("records"):
                out.append(
                    {
                        "metric": key, "ccn": r["Facility ID"], "year": year, "snapshot": snapshot,
                        "value": _num(r.get(m["value"])), "period": f"Published {published}",
                        "note": self._footnote(r.get("Hospital overall rating footnote")),
                    }
                )
            return out

        id_col = "HCAHPS Measure ID" if source == "hcahps" else "Measure ID"
        rows = pd.DataFrame()
        for cms_id in m["cms"]:
            rows = frame[frame[id_col] == cms_id]
            if len(rows):
                break
        value_col = m.get("value", "Score")
        for r in rows.to_dict("records"):
            end, start = _date(r.get("End Date")), _date(r.get("Start Date"))
            if not end:
                continue
            value = _num(r.get(value_col))
            compared = COMPARED.get(str(r.get("Compared to National", "")).strip().lower())
            lo, hi = _num(r.get("Lower Estimate")), _num(r.get("Higher Estimate"))
            n = _num(r.get("Denominator")) or _num(r.get("Number of Completed Surveys")) or _num(r.get("Sample"))
            note = self._footnote(
                r.get("Footnote"), r.get(f"{value_col} Footnote"), r.get("Number of Completed Surveys Footnote")
            )
            out.append(
                {
                    "metric": key, "ccn": r["Facility ID"], "year": end.year, "snapshot": snapshot,
                    "value": value, "period": _period(start, end), "compared": compared,
                    "ci": [lo, hi] if value is not None and lo is not None and hi is not None else None,
                    "n": int(n) if n is not None else None, "note": note,
                }
            )
        return out

    # ------------------------------------------------------------------ #

    def build(self, records: pd.DataFrame) -> None:
        ccn_to_hcai, shared, by_name = self._match_ccns(records["ccn"].unique())
        records = records[records["ccn"].isin(ccn_to_hcai)].copy()
        records["hcai"] = records["ccn"].map(ccn_to_hcai)
        # Latest snapshot wins for a measure's end year.
        records = records.sort_values("snapshot").drop_duplicates(["metric", "hcai", "year"], keep="last")

        # The usual period for each metric-year goes in the manifest; rows keep theirs only when it differs.
        periods: dict[str, dict[str, str]] = {}
        for (metric, year), g in records.groupby(["metric", "year"]):
            mode = g["period"].dropna().mode()
            if len(mode):
                periods.setdefault(metric, {})[str(year)] = mode.iloc[0]

        metrics: dict[str, dict[str, dict]] = {}
        for r in records.to_dict("records"):
            if r.get("period") == periods.get(r["metric"], {}).get(str(r["year"])):
                r["period"] = None
            row = metrics.setdefault(r["hcai"], {}).setdefault(
                str(r["year"]), {"annualized": False, "status": None, "detail": {}}
            )
            row[r["metric"]] = clean_value(r["value"])
            detail = {
                k: clean_value(r.get(k)) if k != "ci" else r.get("ci")
                for k in ("period", "compared", "ci", "n", "note")
                if r.get(k) is not None and not (isinstance(r.get(k), float) and pd.isna(r.get(k)))
            }
            row["detail"][r["metric"]] = detail

        unmatched = sorted(set(self.cms_names) - set(ccn_to_hcai))
        write_json(self.out_dir / "metrics.json", metrics)
        write_json(self.out_dir / "dictionary.json", dictionary.export(), compact=False)
        write_json(
            self.out_dir / "manifest.json",
            {
                "id": self.id,
                "title": self.title,
                "sourcePage": self.source_page,
                "years": sorted({int(y) for fac in metrics.values() for y in fac}),
                "sources": self.sources,
                "crosswalk": self.crosswalk.sources,
                "generatedAt": utc_now_iso(),
                "sharedReporting": shared,
                "periods": periods,
                "coverage": {
                    "cmsHospitals": len(self.cms_names),
                    "matchedHospitals": len(metrics),
                    "matchedByNameAndZip": by_name,
                    "unmatched": [{"ccn": c, "name": self.cms_names[c]} for c in unmatched],
                },
                "notes": [
                    "Each value is filed under the year its measurement period ends; periods run up to three years and overlap.",
                    "Snapshots: the last Care Compare release of each calendar year, plus the newest.",
                    "CMS CCNs are mapped to HCAI facility numbers with CDPH's licensed facility listing. Where one CCN covers several licensed hospitals, CMS's combined score is filed under the hospital CMS names, and the others are marked as reported with it.",
                    "CCNs that changed after an ownership change aren't in CDPH's current listing; those are matched on ZIP code plus a close name match (listed under coverage.matchedByNameAndZip).",
                ],
            },
            compact=False,
        )

    def _match_ccns(self, ccns) -> tuple[dict[str, str], dict[str, dict], list[dict]]:
        groups = self.crosswalk.ccn_groups()
        facilities = self._app_facilities()
        similarity = lambda a, b: difflib.SequenceMatcher(None, a.lower(), b.lower()).ratio()  # noqa: E731

        def name_score(cms_name: str, hcai_id: str) -> float:
            candidates = [facilities.get(hcai_id, {}).get("name", "")] + self.crosswalk.cdph_names(hcai_id)
            return max(similarity(cms_name, n) for n in candidates if n)

        ccn_to_hcai: dict[str, str] = {}
        shared: dict[str, dict] = {}
        for ccn in ccns:
            ids = groups.get(ccn)
            if not ids:
                continue
            main = ids[0] if len(ids) == 1 else max(ids, key=lambda i: name_score(str(self.cms_names.get(ccn, "")), i))
            ccn_to_hcai[ccn] = main
            for other in ids:
                if other != main:
                    shared[other] = {"ccn": ccn, "reportedWith": main, "reportedWithName": facilities[main]["name"]}

        # Fallback for CCNs missing from CDPH's current listing (retired after an
        # ownership change): same ZIP code and a close name.
        taken = set(ccn_to_hcai.values()) | set(shared)
        by_name: list[dict] = []
        for ccn in ccns:
            if ccn in ccn_to_hcai or ccn not in self.cms_zips:
                continue
            cms_name = str(self.cms_names.get(ccn, ""))
            best, score = None, 0.0
            for hcai_id, f in facilities.items():
                if f.get("zip") != self.cms_zips[ccn]:
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

    @staticmethod
    def _app_facilities() -> dict[str, dict]:
        out: dict[str, dict] = {}
        for dataset in ("hafd-selected", "hau"):
            path = PROCESSED_DIR / dataset / "facilities.json"
            for f in json.loads(path.read_text(encoding="utf-8")):
                entry = out.setdefault(f["id"], {"name": f["name"], "zip": None})
                entry["zip"] = entry["zip"] or (str(f.get("zip"))[:5] if f.get("zip") else None)
                if dataset == "hau":
                    entry["name"] = f["name"]
        return out

    @staticmethod
    def _app_names() -> dict[str, str]:
        names: dict[str, str] = {}
        for dataset in ("hau", "hafd-selected"):
            path = PROCESSED_DIR / dataset / "facilities.json"
            for f in json.loads(path.read_text(encoding="utf-8")):
                names[f["id"]] = f["name"]
        return names
