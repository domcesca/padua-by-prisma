# HCAI Insights

A web app for California hospital administrators that turns HCAI's public hospital financial data into
something usable: peer benchmarking, a plain-language field guide, and a reporting calendar.

| Tab | What it does |
| --- | --- |
| **Benchmark** | Pick a hospital and see operating margin, days cash on hand, occupancy, ED visits, and payer mix against a peer group you narrow by county, bed size, ownership, and teaching/rural status. Every view is a shareable URL. |
| **Translate** | Every field in the Annual Financial Data Selected File in plain language, with why it moves. Pick a hospital to see year-over-year changes (sortable by biggest change), or paste/upload a raw HCAI extract (.xlsx/.csv) to translate its columns. Parsing happens in the browser. |
| **Deadlines** | Quarterly and annual HCAI financial report due dates for a hospital's fiscal year, extension limits, off-cycle report periods, and filed/extended tracking (saved in the browser). |
| **Ask** / **Watch** | Placeholders for natural-language queries and anomaly detection on uploaded data. |

Data: [HCAI Hospital Annual Financial Data – Selected Data & Pivot Tables](https://data.chhs.ca.gov/dataset/hospital-annual-financial-data-selected-data-pivot-tables),
calendar-year files 2019–2024.

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. The processed data is committed in `data/processed`, so no Python is needed to run the app.

## Refreshing the data

HCAI publishes new extracts roughly twice a year. The ETL discovers files through the CalHHS CKAN API,
so a new "CY" file is picked up automatically.

```bash
python -m venv .venv
.venv/Scripts/pip install -r etl/requirements.txt   # macOS/Linux: .venv/bin/pip
cd etl
../.venv/Scripts/python -m hcai_etl hafd-selected            # uses cached downloads in data/raw
../.venv/Scripts/python -m hcai_etl hafd-selected --refresh  # re-download everything
```

Outputs (`data/processed/hafd-selected/`):

- `facilities.json`: one profile per hospital (latest name, county, ownership, beds, fiscal year end)
- `metrics.json`: derived benchmark metrics per hospital-year
- `fields.json`: every numeric field per hospital-year (columnar)
- `dictionary.json`: plain-language data dictionary (from `etl/hcai_etl/dictionary/hafd_selected.py`)
- `manifest.json`: source files, years, and processing notes

Commit the regenerated files and redeploy.

### How the ETL handles HCAI's quirks

- **Report years.** Each "CY YYYY" file contains reports whose period *ended* in that year, so a June fiscal-year
  hospital's 2024 value is its July 2023 – June 2024 year.
- **Multiple reports per year** (fiscal-year changes, ownership changes, openings/closures) are combined: flows are
  summed and annualized when coverage is more than 3% off a full year; balance-sheet items and bed counts come from
  the latest report; occupancy and length of stay are re-weighted.
- **Header drift** between extracts (`NAT_ BIRTHS` vs `NAT_0BIRTHS`, `INTER-REC`) is normalized by `normalize_column`
  plus an alias table. `src/lib/translate/columns.ts` mirrors it for browser uploads.

### Adding another HCAI dataset

Subclass `hcai_etl.core.Dataset` in `etl/hcai_etl/datasets/`, implement `resources()` / `load()` / `build()`,
add a dictionary module, and register it in `datasets/__init__.py`. Planned: Quarterly Financial & Utilization,
Annual Disclosure complete set, and Case Mix Index.

## Architecture

```
etl/                 Python ETL (pandas) → data/processed/*.json
data/processed/      committed static data, read by server code
src/lib/data/        data access layer (the only code that touches storage)
src/lib/benchmark/   peer filtering + percentile stats (server)
src/lib/deadlines/   HCAI filing rules with citations
src/app/api/         /api/benchmark, /api/facilities/[id]/fields
src/app/<tab>/       one route per tab
```

**Where a database would go:** `src/lib/data/hafd.ts` is the only storage boundary. Moving to Postgres (Prisma), or
SQLite locally, for user uploads, saved peer groups, or accounts means reimplementing its functions against tables. The
comment in that file sketches the table layout.

## Deploying (Vercel)

Import the repo in Vercel with the defaults (framework: Next.js). `next.config.ts` uses `outputFileTracingIncludes`
to bundle `data/processed/**/*.json` into the server functions, and API responses are CDN-cached for a day.
No environment variables are needed.

## Caveats worth knowing

- **Days cash on hand is hospital-level.** Hospitals in a system often sweep cash to the parent, so values can be
  near zero even at strong systems. Compare like ownership structures.
- **Kaiser and other "non-comparable" hospitals** (per HCAI's Type of Hospital) are excluded from peer groups by
  default.
- **Recent years include reports HCAI hasn't finished auditing** ("In Process").
- **Deadline dates are computed from the rules**, not adjusted for weekends or holidays. SIERA is authoritative.
