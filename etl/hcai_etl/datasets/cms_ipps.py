"""CMS IPPS Final Rule: MS-DRG relative weights and the national standardized amount.

Source: the "FY <year> IPPS Final Rule Home Page" under
https://www.cms.gov/medicare/payment/prospective-payment-systems/acute-inpatient-pps
  * Table 5: every MS-DRG with its relative weight, type (MED/SURG), MDC, and mean lengths of stay.
  * Tables 1A-1E: the national operating standardized amounts (1A/1B) and the capital rate (1D).

Propose multiplies a DRG's weight by the national operating standardized amount to get a
national-average estimated Medicare payment per case. That's a deliberate simplification: a
hospital's actual payment also depends on its wage index, DSH and IME add-ons, outliers,
transfer rules, and capital, none of which are applied here.

  * Weight: Table 5's "10% Cap Applied" column (the weight CMS pays on; since FY 2023 a DRG's
    weight can't fall more than 10% in a year).
  * Standardized amount: Table 1A's labor + non-labor for a hospital that submits quality data
    and is a meaningful EHR user (the full update, which nearly every California hospital gets).
    1A and 1B split the same total differently by wage index; we check they agree.

Without --years this takes the newest final rule on CMS's page; --years 2026 picks FY 2026.
"""

from __future__ import annotations

import re

import openpyxl
import requests

from ..core import USER_AGENT, Dataset, Resource, utc_now_iso, write_json

CMS = "https://www.cms.gov"
IPPS_PAGE = f"{CMS}/medicare/payment/prospective-payment-systems/acute-inpatient-pps"


def _get(url: str) -> str:
    resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=60)
    resp.raise_for_status()
    return resp.text


def _xlsx(path) -> list[tuple]:
    """Rows of the one worksheet inside a downloaded table zip."""
    import zipfile
    from io import BytesIO

    with zipfile.ZipFile(path) as z:
        names = [n for n in z.namelist() if n.lower().endswith(".xlsx")]
        if len(names) != 1:
            raise RuntimeError(f"{path.name}: expected one .xlsx, found {names}")
        wb = openpyxl.load_workbook(BytesIO(z.read(names[0])), read_only=True, data_only=True)
    return [tuple(r) for r in wb.worksheets[0].iter_rows(values_only=True)]


def _text(v) -> str:
    return re.sub(r"\s+", " ", str(v)).strip() if v is not None else ""


class CmsIpps(Dataset):
    id = "cms-ipps"
    title = "CMS IPPS Final Rule: MS-DRG relative weights and national standardized amount"
    source_page = IPPS_PAGE

    def resources(self) -> list[Resource]:
        years = sorted({int(y) for y in re.findall(r"/fy-(\d{4})-ipps-final-rule-home-page", _get(IPPS_PAGE))})
        if not years:
            raise RuntimeError("No final rule home pages linked from the IPPS page; its layout changed.")
        fy = self.years[-1] if self.years else years[-1]
        self.fiscal_year = fy
        self.rule_page = f"{IPPS_PAGE}/fy-{fy}-ipps-final-rule-home-page"
        links = sorted(set(re.findall(r'href="(/files/zip/[^"]+\.zip)"', _get(self.rule_page))))
        wanted = {"table5": rf"fy-?{fy}-ipps-fr-table-5\.zip$", "table1": rf"fy-?{fy}-ipps-fr-table-1a-1e\.zip$"}
        out = []
        for key, pattern in wanted.items():
            hit = [link for link in links if re.search(pattern, link)]
            if len(hit) != 1:
                raise RuntimeError(f"FY {fy}: expected one {key} zip on {self.rule_page}, found {hit}")
            out.append(Resource(name=f"FY {fy} final rule {key}", url=CMS + hit[0], format="ZIP", tags={"table": key}))
        return out

    def load(self, files):
        paths = {res.tags["table"]: path for res, path in files}
        self.sources = [{"name": res.name, "url": res.url} for res, _ in files]
        return {"drgs": self._table5(_xlsx(paths["table5"])), "rates": self._table1(_xlsx(paths["table1"]))}

    def _table5(self, rows: list[tuple]) -> list[dict]:
        header_at = next(
            (i for i, r in enumerate(rows) if _text(r[0]).upper() == "MS-DRG" and any("weight" in _text(c).lower() for c in r)),
            None,
        )
        if header_at is None:
            raise RuntimeError("Table 5: header row (MS-DRG ... Weights) not found; the layout changed.")
        header = [_text(c).lower() for c in rows[header_at]]

        def col(*needles: str) -> int:
            for i, h in enumerate(header):
                if all(n in h for n in needles):
                    return i
            raise RuntimeError(f"Table 5: no column matching {needles} in {header}")

        capped = next((i for i, h in enumerate(header) if "weight" in h and "cap applied" in h), None)
        c = {
            "code": 0,
            "postAcute": col("post-acute"),
            "specialPay": col("special pay"),
            "mdc": col("mdc"),
            "type": col("type"),
            "title": col("title"),
            # Capped weight when the table has one (FY 2023 on); the plain weight otherwise.
            "weight": capped if capped is not None else col("weight"),
            "gmlos": col("geometric"),
            "amlos": col("arithmetic"),
        }
        drgs = []
        for r in rows[header_at + 1 :]:
            code = _text(r[0])
            if not re.fullmatch(r"\d{1,3}", code):
                continue
            weight = r[c["weight"]]
            if not isinstance(weight, (int, float)):
                continue
            num = lambda v: round(float(v), 1) if isinstance(v, (int, float)) else None  # noqa: E731
            drgs.append(
                {
                    "code": code.zfill(3),
                    "title": _text(r[c["title"]]),
                    "weight": round(float(weight), 4),
                    "type": _text(r[c["type"]]).upper() or None,
                    "mdc": _text(r[c["mdc"]]) or None,
                    "gmlos": num(r[c["gmlos"]]),
                    "amlos": num(r[c["amlos"]]),
                    "postAcute": _text(r[c["postAcute"]]).lower() == "yes",
                    "specialPay": _text(r[c["specialPay"]]).lower() == "yes",
                }
            )
        if len(drgs) < 700:
            raise RuntimeError(f"Table 5: only {len(drgs)} MS-DRGs parsed; expected ~770.")
        return drgs

    def _table1(self, rows: list[tuple]) -> dict:
        def first_amounts(title: str) -> tuple[list[float], str]:
            """The first row of dollar amounts after a table's title, and the column heading above it."""
            start = next((i for i, r in enumerate(rows) if _text(r[0]).upper().startswith(title)), None)
            if start is None:
                raise RuntimeError(f"Tables 1A-1E: {title} not found; the layout changed.")
            for i in range(start + 1, min(start + 8, len(rows))):
                nums = [v for v in rows[i] if isinstance(v, (int, float))]
                if nums:
                    return nums, _text(rows[start + 1][0])
            raise RuntimeError(f"Tables 1A-1E: no amounts under {title}.")

        a, a_heading = first_amounts("TABLE 1A")
        b, _ = first_amounts("TABLE 1B")
        d, _ = first_amounts("TABLE 1D")
        if "quality data and is a meaningful ehr user" not in a_heading.lower():
            raise RuntimeError(f"Table 1A: first column isn't the full-update rate ({a_heading!r}).")
        total = round(a[0] + a[1], 2)
        if abs(total - (b[0] + b[1])) > 0.02:
            raise RuntimeError(f"Tables 1A and 1B disagree on the standardized amount: {total} vs {b[0] + b[1]}")
        update = re.search(r"update\s*=\s*(-?[\d.]+)\s*percent", a_heading, re.I)
        return {
            "operating": {
                "total": total,
                "laborRelated": a[0],
                "nonlaborRelated": a[1],
                "laborShare": round(a[0] / total, 3),
                "update": float(update.group(1)) if update else None,
                "basis": a_heading,
            },
            "capital": d[0],
        }

    def build(self, data: dict) -> None:
        drgs, rates = data["drgs"], data["rates"]
        fy = self.fiscal_year
        write_json(self.out_dir / "drgs.json", drgs)
        write_json(
            self.out_dir / "manifest.json",
            {
                "id": self.id,
                "title": self.title,
                "sourcePage": self.rule_page,
                "fiscalYear": fy,
                "effective": f"{fy - 1}-10-01",
                "drgCount": len(drgs),
                "standardizedAmount": rates["operating"],
                "capitalRate": rates["capital"],
                "sources": self.sources,
                "generatedAt": utc_now_iso(),
                "notes": [
                    f"Relative weights: Table 5 of the FY {fy} IPPS Final Rule (the 10%-capped weights CMS pays on).",
                    "National operating standardized amount: Table 1A, labor-related plus non-labor-related, for a hospital that submits quality data and is a meaningful EHR user.",
                    "Estimated payment = relative weight x national standardized amount. This is a national average, not a hospital's actual payment: wage index, DSH, IME, outliers, transfer adjustments, and capital are not applied.",
                ],
            },
            compact=False,
        )
