# HCAI Insights

A web app for California hospital administrators that turns HCAI's public hospital financial and utilization data
into something usable: a guided front door, peer benchmarking against similar hospitals, a chart and table builder, a
plain-language field guide, and a reporting calendar.

| Tab | What it does |
| --- | --- |
| **Home** | The front door. Pick a topic (Financials or Utilization; Quality and Case mix are reserved for later), pick a hospital, optionally refine the peer group, metrics, and years, and land in Benchmark pre-loaded. The chosen hospital follows you to every tab. |
| **Benchmark** | A hospital against its peer group on financial metrics (operating margin, days cash on hand, cost and revenue per adjusted discharge, payer mix) or utilization metrics (occupancy, ALOS, ED visits and flow, surgeries, cath volume). Default peers are **similar hospitals** (see below); switch to all of California or set filters yourself. Every view is a shareable URL. |
| **Build** | A guided chart and table builder: up to four metrics from the catalog, line / bar / table, grouped by year, by hospital, or against the peer group. Legend, table view, CSV download, and a copyable link on every result. |
| **Translate** | Every field in either dataset in plain language, with why it moves. Pick a hospital to see year-over-year changes, or paste/upload a raw HCAI extract (.xlsx/.csv, including the utilization workbook) to translate its columns. Parsing happens in the browser. |
| **Deadlines** | Quarterly and annual financial report due dates for a hospital's fiscal year, the Annual Utilization Report (Feb 15), extension limits, off-cycle report periods, and filed/extended tracking (saved in the browser). |
| **Ask** / **Watch** | Placeholders for natural-language queries and anomaly detection on uploaded data. |

Data, calendar/report years 2019–2024:

- [HCAI Hospital Annual Financial Data – Selected Data & Pivot Tables](https://data.chhs.ca.gov/dataset/hospital-annual-financial-data-selected-data-pivot-tables)
- [HCAI Hospital Annual Utilization Report & Pivot Tables](https://data.chhs.ca.gov/dataset/hospital-annual-utilization-report)

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. The processed data is committed in `data/processed`, so no Python is needed to run the app.

## Refreshing the data

HCAI publishes new extracts once or twice a year. The ETL finds files through the CalHHS CKAN API and downloads them
itself (cached in `data/raw`, which is gitignored), so a new year is picked up automatically — no manual downloads.

```bash
python -m venv .venv
.venv/Scripts/pip install -r etl/requirements.txt   # macOS/Linux: .venv/bin/pip
cd etl
../.venv/Scripts/python -m hcai_etl                         # every dataset, using cached downloads
../.venv/Scripts/python -m hcai_etl hau                     # just utilization
../.venv/Scripts/python -m hcai_etl hafd-selected --refresh # re-download
../.venv/Scripts/python -m hcai_etl hau --years 2024 2025   # include a preliminary year explicitly
```

Each dataset writes `data/processed/<id>/`:

- `facilities.json`: one profile per hospital
- `metrics.json`: derived benchmark metrics per hospital-year
- `fields.json`: every numeric field per hospital-year (columnar)
- `dictionary.json`: plain-language data dictionary and metric definitions (from `etl/hcai_etl/dictionary/<id>.py`)
- `manifest.json`: source files, years, and processing notes

Commit the regenerated files and redeploy.

### How the ETL handles HCAI's quirks

Financial (`hafd-selected`):

- **Report years.** Each "CY YYYY" file contains reports whose period *ended* in that year, so a June fiscal-year
  hospital's 2024 value is its July 2023 – June 2024 year.
- **Multiple reports per year** (fiscal-year changes, ownership changes, openings/closures) are combined: flows are
  summed and annualized when coverage is more than 3% off a full year; balance-sheet items and bed counts come from
  the latest report; occupancy and length of stay are re-weighted.
- **Header drift** between extracts (`NAT_ BIRTHS` vs `NAT_0BIRTHS`) is normalized by `normalize_column` plus an alias
  table. `src/lib/translate/columns.ts` mirrors it for browser uploads.

Utilization (`hau`):

- **Calendar years**, January–December (unlike the financial report years). The UI labels which is which.
- **Campuses are rolled up to the license.** A campus reported as a "Consolidated Facility" or "Distinct Part" (UCSF
  Mission Bay, Alta Bates Herrick, …) files its own utilization report but is part of its parent's financial report.
  The ETL combines every campus into the parent facility on the same `LICENSE_NO`, so "a hospital" means the same
  thing in both datasets. Campus names are kept and shown.
- **Rates are recomputed** from combined totals: occupancy = census days ÷ licensed bed days; ALOS = census days ÷
  discharges (critical care adds transfers out), per HCAI's instructions.
- **Workbook layout.** Data is on the "Page 1-6" sheet with four metadata rows (description, Page, Column, Line) under
  the header; both the ETL and browser uploads skip them.
- **Known gaps in HCAI's files:** births are blank from 2022 on; there's no total outpatient-visits field (the app
  takes outpatient visits from the financial report instead, labeled as fiscal-year).

### Adding another HCAI dataset

Subclass `hcai_etl.core.Dataset` in `etl/hcai_etl/datasets/`, implement `resources()` / `load()` / `build()`, add a
dictionary module (with `category` on each metric), register it in `datasets/__init__.py`, and add its id to
`DATASET_IDS` in `src/lib/data/store.ts` and `DATASETS` in `src/lib/data/datasets.ts`. Its metrics then appear in
Benchmark, Build, and Translate. Planned: Quarterly Financial & Utilization, Annual Disclosure complete set, Case Mix
Index.

## Similar hospitals (the default peer group)

Same type of care, same county, same bed-size band (under 100 / 100–299 / 300+), and same ownership group (nonprofit,
district, investor-owned, or public/other). With fewer than 5 matches it widens step by step — within 25 miles, the
county at any ownership, within 50 miles, within 100 miles, then statewide — and the UI says why. Distances are
straight-line from the utilization file's coordinates. Kaiser and other hospitals HCAI marks non-comparable are left
out unless included, and hospitals that stopped reporting drop out. Logic: `src/lib/benchmark/peers.ts`.

This is a geographic and characteristic proxy, **not a service area**. A true primary/secondary service area needs
patient-origin (ZIP-level discharge) data, which HCAI releases only through a formal data request; the app says so
next to the peer group.

## Architecture

```
etl/                   Python ETL (pandas) → data/processed/<dataset>/*.json
data/processed/        committed static data, read by server code
src/lib/data/          store.ts: the only code that touches storage; merges facilities across datasets
                       datasets.ts: dataset + category metadata (client-safe)
src/lib/benchmark/     peer groups (peers.ts), filters/URL state, percentile stats (server)
src/lib/report/        ReportSpec (spec.ts) and its runner (run.ts) for the Build tab
src/lib/deadlines/     HCAI filing rules with citations
src/lib/selection.ts   the remembered hospital + topic (browser storage, per viewer)
src/app/api/           /api/benchmark, /api/peers, /api/report, /api/facilities/[id]/fields
src/app/<tab>/         one route per tab; / is the guided home page
```

**The Build tab is config-driven, not a query engine.** A report is a `ReportSpec` (metrics from the catalog, chart,
grouping, compared hospitals, peer group, year) that the server validates and runs into chart-ready panels. A future
natural-language front end would only have to produce a `ReportSpec`; rendering, validation, and data access stay as
they are.

**Where a database would go:** `src/lib/data/store.ts` is the only storage boundary. Moving to Postgres (Prisma), or
SQLite locally, for user uploads, saved reports, or accounts means reimplementing its functions against tables. The
comment in that file sketches the table layout.

## Design

Apple-style restraint with a "Liquid Glass" layer (utilities in `src/app/globals.css`):

- `glass` / `glass-strong` / `glass-subtle`: translucent, blurred elevated surfaces (cards, nav, menus, controls)
  with a 1px inner highlight and soft shadow. `widget`: rounder glass tiles for at-a-glance summaries.
  `surface`: opaque, for text-heavy lists (Translate, Deadlines) where blur would cost legibility.
- The Siri-style gradient (`--accent-gradient`, red → pink → purple → blue) appears only on active and selected states
  (`ring-accent`), primary actions (`btn-accent`), focus rings, and loading (`loading-bar`) — never on large surfaces.
  A soft `glow` sits behind active and primary elements.
- Light and dark have separate glass, glow, and ambient-backdrop values. `prefers-reduced-transparency` and browsers
  without `backdrop-filter` get opaque surfaces; `prefers-reduced-motion` stops the loading sweep.
- Charts: one metric per panel (no dual axes), thin lines, minimal gridlines, a legend, and a table view. Hospital
  series use a validated 5-slot categorical palette (`--series-1..5`); peer and state medians are gray context.

## Deploying (Vercel)

Import the repo in Vercel with the defaults (framework: Next.js). `next.config.ts` uses `outputFileTracingIncludes`
to bundle `data/processed/**/*.json` into the server functions, and API responses are CDN-cached for a day.
No environment variables are needed.

## Caveats worth knowing

- **Days cash on hand is hospital-level.** Hospitals in a system often sweep cash to the parent, so values can be
  near zero even at strong systems. Compare like ownership structures.
- **Financial and utilization years differ** (fiscal report years vs. calendar years); the app labels each chart.
- **Kaiser and other "non-comparable" hospitals** (per HCAI's Type of Hospital) are excluded from peer groups by
  default.
- **Recent financial years include reports HCAI hasn't finished auditing** ("In Process").
- **Deadline dates are computed from the rules.** Financial due dates aren't moved for weekends or holidays; the
  utilization due date is (per HCAI's instructions). SIERA is authoritative.
