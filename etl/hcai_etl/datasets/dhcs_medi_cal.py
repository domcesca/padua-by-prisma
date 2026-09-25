"""DHCS Medi-Cal certified eligibles by county (community context for Benchmark).

Source: https://data.chhs.ca.gov/dataset/medi-cal-certified-eligibles-with-demographics-by-month
("By Medicare Dual Status, Certified Eligibles"): one row per month, county, and
dual status (Dual = also on Medicare, Non-Dual).

County-level context, not a hospital metric: the app shows it next to a hospital
for the county it's in, and never ranks hospitals on it.

  * A year's figure is the average of its monthly counts (enrollment churns month
    to month); the latest month is kept too.
  * DHCS marks recent months "P" (preliminary: revised as late eligibility
    determinations post) and the rest "F" (final). Years with any preliminary
    month are flagged.
  * Small cells are suppressed; "Invalid County Code" rows are dropped.
"""

from __future__ import annotations

import pandas as pd

from ..core import Dataset, Resource, ckan_package, utc_now_iso, write_json

PACKAGE = "medi-cal-certified-eligibles-with-demographics-by-month"
RESOURCE = "By Medicare Dual Status, Certified Eligibles"
DEFAULT_FIRST_YEAR = 2019
NOT_COUNTIES = {"Invalid County Code", "Statewide", "STATEWIDE"}


class DhcsMediCal(Dataset):
    id = "dhcs-medi-cal"
    title = "DHCS Medi-Cal Certified Eligibles by County"
    source_page = f"https://data.chhs.ca.gov/dataset/{PACKAGE}"

    def resources(self) -> list[Resource]:
        pkg = ckan_package(PACKAGE)
        self.package_meta = {"title": pkg.get("title"), "metadata_modified": pkg.get("metadata_modified")}
        for res in pkg["resources"]:
            if res.get("name", "").strip() == RESOURCE:
                return [Resource(name=RESOURCE, url=res["url"], format="CSV")]
        raise RuntimeError(f"{RESOURCE!r} not found in {PACKAGE}")

    def load(self, files):
        (res, path), = files
        df = pd.read_csv(path, dtype=str, encoding="utf-8-sig")
        expected = {"Month of Eligibility", "County", "Dual Status", "Total Eligibles", "Status"}
        missing = expected - set(df.columns)
        if missing:
            raise RuntimeError(f"Medi-Cal file is missing columns {sorted(missing)}; the layout changed.")
        df["count"] = pd.to_numeric(df["Total Eligibles"].str.replace(",", ""), errors="coerce")
        df["year"] = df["Month of Eligibility"].str[:4].astype(int)
        df["County"] = df["County"].str.strip()
        self.sources = [{"name": res.name, "url": res.url}]
        return df[df["Dual Status"].isin(["Dual", "Non-Dual"])]

    def build(self, df: pd.DataFrame) -> None:
        monthly = (
            df.pivot_table(index=["County", "Month of Eligibility", "year"], columns="Dual Status", values="count", aggfunc="sum")
            .reset_index()
            .rename(columns={"Dual": "dual", "Non-Dual": "nonDual"})
        )
        monthly["eligibles"] = monthly["dual"].fillna(0) + monthly["nonDual"].fillna(0)
        status = df.groupby(["County", "Month of Eligibility"])["Status"].first()
        monthly["preliminary"] = [status.get((c, m)) == "P" for c, m in zip(monthly["County"], monthly["Month of Eligibility"])]
        first_year = min(self.years) if self.years else DEFAULT_FIRST_YEAR
        monthly = monthly[monthly["year"] >= first_year]

        def summarize(g: pd.DataFrame) -> dict:
            return {
                "eligibles": round(float(g["eligibles"].mean())),
                "dual": round(float(g["dual"].mean())) if g["dual"].notna().any() else None,
                "months": int(len(g)),
                "preliminary": bool(g["preliminary"].any()),
            }

        counties: dict[str, dict] = {}
        for county, g in monthly.groupby("County"):
            if county in NOT_COUNTIES:
                continue
            g = g.sort_values("Month of Eligibility")
            last = g.iloc[-1]
            counties[county] = {
                "years": {str(y): summarize(gy) for y, gy in g.groupby("year")},
                "latest": {
                    "month": last["Month of Eligibility"],
                    "eligibles": int(last["eligibles"]),
                    "dual": None if pd.isna(last["dual"]) else int(last["dual"]),
                    "preliminary": bool(last["preliminary"]),
                },
            }
        if len(counties) != 58:
            print(f"  WARNING: expected 58 counties, found {len(counties)}")

        years = sorted({int(y) for c in counties.values() for y in c["years"]})
        write_json(self.out_dir / "counties.json", counties)
        write_json(
            self.out_dir / "manifest.json",
            {
                "id": self.id,
                "title": self.title,
                "sourcePage": self.source_page,
                "package": self.package_meta,
                "years": years,
                "latestMonth": max(c["latest"]["month"] for c in counties.values()),
                "sources": self.sources,
                "generatedAt": utc_now_iso(),
                "notes": [
                    "Certified eligibles: people DHCS has determined eligible for Medi-Cal in the month.",
                    "Annual figures average the year's monthly counts. Recent months are preliminary and get revised as late eligibility determinations post.",
                    "Dual = also enrolled in Medicare.",
                ],
            },
            compact=False,
        )
