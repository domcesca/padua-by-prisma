"""Census American Community Survey (ACS) 5-year estimates for California counties.

Source: the Census Data API (https://api.census.gov/data/<year>/acs/acs5 and
/acs5/subject). Unlike the other sources this one is an API, and it requires a
free key: set CENSUS_API_KEY in the environment or in the repo's .env file (see
.env.example). The key is used only here, at ETL time; the app reads the
processed JSON and needs no key.

County-level context for Benchmark: population, income, age, poverty, and health
insurance coverage. The newest 5-year release whose variables all exist is used
(found through the API's variables.json, which needs no key).

Coverage shares are Census's "alone or in combination" percentages: someone with
Medicare and a Medi-Cal plan counts in both, so they don't add up to 100%.
"""

from __future__ import annotations

import json
import os
from datetime import date

import requests

from ..core import REPO_ROOT, USER_AGENT, Dataset, utc_now_iso, write_json

API = "https://api.census.gov/data"
STATE_FIPS = "06"
MISSING_KEY = (
    "CENSUS_API_KEY is not set. Get a free key at https://api.census.gov/data/key_signup.html and put it in the "
    "environment or in .env at the repo root (see .env.example)."
)

# id -> (table, variable, label). Detailed tables (B...) and subject tables (S...) use different endpoints.
VARIABLES: dict[str, tuple[str, str]] = {
    "population": ("detailed", "B01003_001E"),
    "medianHouseholdIncome": ("detailed", "B19013_001E"),
    "medianAge": ("detailed", "B01002_001E"),
    "pctAge65Plus": ("subject", "S0101_C02_030E"),
    "pctBelowPoverty": ("subject", "S1701_C03_001E"),
    "pctUninsured": ("subject", "S2701_C05_001E"),
    "pctPrivate": ("subject", "S2703_C03_001E"),
    "pctMedicare": ("subject", "S2704_C03_002E"),
    "pctMedicaid": ("subject", "S2704_C03_006E"),
}
ENDPOINT = {"detailed": "acs/acs5", "subject": "acs/acs5/subject"}


def _api_key() -> str:
    key = os.environ.get("CENSUS_API_KEY", "").strip()
    env_file = REPO_ROOT / ".env"
    if not key and env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            name, _, value = line.partition("=")
            if name.strip() == "CENSUS_API_KEY":
                key = value.strip().strip('"').strip("'")
    if not key:
        raise RuntimeError(MISSING_KEY)
    return key


def _number(value) -> float | None:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    # The API codes suppressed or unavailable estimates as large negative sentinels (-666666666, ...).
    return None if v < -999 else v


class AcsCounty(Dataset):
    id = "acs-county"
    title = "Census ACS 5-year estimates – California counties"
    source_page = "https://www.census.gov/programs-surveys/acs"

    def _session(self) -> requests.Session:
        s = requests.Session()
        s.headers["User-Agent"] = USER_AGENT
        return s

    def _latest_year(self, session: requests.Session) -> int:
        """Newest ACS 5-year release that has every variable (metadata needs no key)."""
        candidates = self.years or range(date.today().year - 1, date.today().year - 6, -1)
        for year in sorted(candidates, reverse=True):
            found = True
            for table in ("detailed", "subject"):
                resp = session.get(f"{API}/{year}/{ENDPOINT[table]}/variables.json", timeout=120)
                if resp.status_code != 200:
                    found = False
                    break
                names = resp.json()["variables"]
                if any(v not in names for t, v in VARIABLES.values() if t == table):
                    found = False
                    break
            if found:
                return year
        raise RuntimeError("No ACS 5-year release found with all the variables this pipeline uses.")

    def run(self) -> None:
        print(f"[{self.id}] {self.title}")
        key = _api_key()
        session = self._session()
        year = self._latest_year(session)
        print(f"  ACS 5-year {year - 4}–{year}")
        self.raw_dir.mkdir(parents=True, exist_ok=True)

        counties: dict[str, dict] = {}
        for table in ("detailed", "subject"):
            wanted = [v for t, v in VARIABLES.values() if t == table]
            cache = self.raw_dir / f"acs5-{year}-{table}.json"  # the key never goes into the cache or outputs
            if cache.exists() and not self.refresh:
                rows = json.loads(cache.read_text(encoding="utf-8"))
            else:
                resp = session.get(
                    f"{API}/{year}/{ENDPOINT[table]}",
                    params={"get": ",".join(["NAME", *wanted]), "for": "county:*", "in": f"state:{STATE_FIPS}", "key": key},
                    timeout=120,
                    allow_redirects=False,
                )
                if resp.status_code != 200 or resp.headers.get("X-DataWebAPI-KeyError"):
                    raise RuntimeError(f"Census API refused the request ({resp.status_code}). Check CENSUS_API_KEY.")
                rows = resp.json()
                cache.write_text(json.dumps(rows), encoding="utf-8")
            header, *data = rows
            missing = [c for c in ["NAME", *wanted, "county"] if c not in header]
            if missing:
                raise RuntimeError(f"Census API response is missing columns {missing}; the response format changed.")
            idx = {c: i for i, c in enumerate(header)}
            for row in data:
                name = row[idx["NAME"]].replace(" County, California", "").strip()
                entry = counties.setdefault(name, {"fips": f"{STATE_FIPS}{row[idx['county']]}"})
                for metric, (t, var) in VARIABLES.items():
                    if t == table:
                        entry[metric] = _number(row[idx[var]])

        if len(counties) != 58:
            print(f"  WARNING: expected 58 counties, found {len(counties)}")
        write_json(self.out_dir / "counties.json", counties)
        write_json(
            self.out_dir / "manifest.json",
            {
                "id": self.id,
                "title": self.title,
                "sourcePage": self.source_page,
                "years": [year],
                "vintage": f"{year - 4}–{year}",
                "sources": [{"name": f"ACS 5-year {year}, {table} tables", "url": f"{API}/{year}/{ENDPOINT[table]}"} for table in ENDPOINT],
                "variables": {k: v for k, (_, v) in VARIABLES.items()},
                "generatedAt": utc_now_iso(),
                "notes": [
                    f"ACS 5-year estimates pool surveys from {year - 4} through {year}.",
                    "Coverage percentages are 'alone or in combination' and overlap, so they don't sum to 100%.",
                    "Median household income is in the final year's inflation-adjusted dollars.",
                ],
            },
            compact=False,
        )
        print(f"[{self.id}] done")
