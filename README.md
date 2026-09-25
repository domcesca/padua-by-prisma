# Padua by Prisma

**Padua** is a web app from Prisma Executive for California hospital administrators. It is an independent tool, not
an HCAI, CMS, CDPH, or DHCS product. It turns HCAI's public hospital financial and utilization data
into something usable: a guided front door, peer benchmarking against similar hospitals, a chart and table builder, a
business-case builder for new initiatives, a plain-language field guide, and a reporting calendar.

| Tab | What it does |
| --- | --- |
| **Home** | The front door. Pick a hospital, pick a topic (Financials, Utilization, or Quality; Case mix is reserved for later), optionally refine the peer group, metrics, and years, and land in Benchmark pre-loaded. The chosen hospital follows you to every tab. |
| **Benchmark** | A hospital against its peer group on financial metrics (operating margin, days cash on hand, cost and revenue per adjusted discharge, payer mix) utilization metrics (occupancy, ALOS, ED visits and flow, surgeries, cath volume), or quality (CMS readmissions, mortality, patient experience, star ratings; CDPH infection ratios). A collapsible panel shows the county's Census and Medi-Cal context. Default peers are **similar hospitals** (see below); switch to all of California or set filters yourself. A **Payer view** toggle (All payers / Medicare) narrows the metrics to Medicare where HCAI reports a Medicare split. Every view is a shareable URL. |
| **Build** | A guided chart and table builder: up to four metrics from the catalog, line / bar / table, grouped by year, by hospital, or against the peer group. Legend, table view, CSV download, and a copyable link on every result. |
| **Correlate** | Any two catalog metrics (Financial, Utilization, Quality, Medicare lens) plotted against each other across a hospital's similar hospitals or all of California for one year: scatter, least-squares trend line, Pearson r, and Spearman rank ρ (robust to outliers). Fewer than 8 hospitals gets "Small sample size — interpret with caution"; fewer than 3, no r. Pairing years of different kinds (fiscal vs. calendar vs. CMS periods) is called out. Table view, CSV, shareable link. |
| **Propose** | The financial case for a new technology, service, or piece of equipment. Enter capital, implementation, and yearly running costs and a useful life; pick how the benefit is estimated (**Reimbursement**: MS-DRGs × added cases × a national Medicare payment estimate, with the hospital's own Medicare cases and its peers' as context; or **Custom**: your own benefit lines). Payback, ROI, NPV, amortized and cumulative net for Conservative / Expected / Optimistic side by side (70% / 100% / 130% of the estimated benefit by default; each rate is editable), a cumulative chart, a year-by-year table, and a print-to-PDF layout. The proposal lives in the link; nothing is saved. |
| **Translate** | Every field in either dataset in plain language, with why it moves. Pick a hospital to see year-over-year changes, or paste/upload a raw HCAI extract (.xlsx/.csv, including the utilization workbook) to translate its columns. Parsing happens in the browser. |
| **Deadlines** | (Desktop sidebar and the home page; not in the phone tab bar.) Quarterly and annual financial report due dates for a hospital's fiscal year, the Annual Utilization Report (Feb 15), extension limits, off-cycle report periods, and filed/extended tracking (saved in the browser). |
| **Ask** / **Watch** | Placeholders for natural-language queries and anomaly detection on uploaded data. |
| **Help (?)** | On every page (bottom corner, or press <kbd>?</kbd>): a search-as-you-type glossary of every metric and HCAI field, read from the same dictionaries as Translate. A lookup, not a chat. Also replays the tour. |

A short guided tour (five steps) plays on the first visit to the home page. It's remembered in the browser
(`hcai-tour-v1` in localStorage), can be skipped at any step, and can be replayed from the help panel.

Data, calendar/report years 2019–2024:

- [HCAI Hospital Annual Financial Data – Selected Data & Pivot Tables](https://data.chhs.ca.gov/dataset/hospital-annual-financial-data-selected-data-pivot-tables)
- [HCAI Hospital Annual Utilization Report & Pivot Tables](https://data.chhs.ca.gov/dataset/hospital-annual-utilization-report)
- [HCAI Case Mix Index](https://data.chhs.ca.gov/dataset/case-mix-index) (federal fiscal years 2019–2025)
- [CMS Care Compare – Hospitals](https://data.cms.gov/provider-data/topics/hospitals) (archived snapshots, 2019–2026)
- [CDPH Healthcare-Associated Infections](https://www.cdph.ca.gov/Programs/CHCQ/HAI/Pages/HAIreport.aspx) (CLABSI, C. diff, MRSA, VRE; 2019–2025)
- [DHCS Medi-Cal Certified Eligibles by month](https://data.chhs.ca.gov/dataset/medi-cal-certified-eligibles-with-demographics-by-month) and the [Census ACS 5-year API](https://www.census.gov/data/developers/data-sets/acs-5year.html) (county context)
- [CMS IPPS Final Rule](https://www.cms.gov/medicare/payment/prospective-payment-systems/acute-inpatient-pps) Table 5 (MS-DRG relative weights) and Tables 1A–1E (standardized amount), FY 2027, and [Medicare Inpatient Hospitals by Provider and Service](https://data.cms.gov/provider-summary-by-type-of-service/medicare-inpatient-hospitals/medicare-inpatient-hospitals-by-provider-and-service) (Medicare cases per DRG, 2024), for Propose
- [CDPH Licensed and Certified Healthcare Facility Listing](https://data.chhs.ca.gov/dataset/healthcare-facility-locations) and [crosswalk](https://data.chhs.ca.gov/dataset/licensed-facility-crosswalk) (to match CMS and CDPH IDs to HCAI)

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

Commit the regenerated files and redeploy. Build the HCAI datasets (`hafd-selected`, `hau`) before `case-mix-index`,
`cms-care-compare` and `cdph-hai`, which map onto their facility list (the default order does this).

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
  discharges (critical care and skilled nursing add transfers out), matching HCAI's published figures.
- **Workbook layout.** Data is on the "Page 1-6" sheet with four metadata rows (description, Page, Column, Line) under
  the header; both the ETL and browser uploads skip them.
- **Length of stay and average daily census are acute-only** (general acute bed lines 1–9: med/surg, perinatal,
  pediatric, ICU, CCU, acute respiratory, burn, NICU, rehab), so skilled nursing, psychiatric, and chemical-dependency
  units don't distort them. ADC = acute census days ÷ days in the period. Inpatient days, discharges, and occupancy
  are all-bed totals. The Medicare lens's length of stay comes from the financial report and includes SNF days.
- **Units (bed classifications)** go to `units.json`: HCAI's 14 lines (1–9, 16–20), which sum exactly to total licensed
  beds (lines 30–31 are "of which" breakdowns and are left out). A unit appears in a year only when the hospital has
  licensed beds in it. Benchmark's Utilization topic can be narrowed to one (`?unit=icu`); peers without the unit are
  left out of the median. Critical-care and skilled-nursing length of stay count transfers out to general acute beds,
  as HCAI's published figures do.
- **Known gaps in HCAI's files:** births are blank from 2022 on; there's no total outpatient-visits field (the app
  takes outpatient visits from the financial report instead, labeled as fiscal-year).

### Adding another HCAI dataset

Subclass `hcai_etl.core.Dataset` in `etl/hcai_etl/datasets/`, implement `resources()` / `load()` / `build()`, add a
dictionary module (with `category` on each metric), register it in `datasets/__init__.py`, and add its id to
`DATASET_IDS` in `src/lib/data/store.ts` and `DATASETS` in `src/lib/data/datasets.ts`. Its metrics then appear in
Benchmark, Build, and Translate. Planned: Quarterly Financial & Utilization, Annual Disclosure complete set.

Case mix index (`case-mix-index`):

- **Federal fiscal years** (October–September), filed under the year they end, and tagged on the card.
- **IDs:** the workbook's `oshpd_id` drops the `106` prefix and a leading zero (`10735` → `106010735`).
- **Campuses:** HCAI calculates CMI per facility, so the license's CMI is its campuses' CMIs weighted by their
  utilization-report discharges (19 hospitals; the card says which campuses). Single-facility values are HCAI's own,
  unchanged. State hospitals (DSH) and Porterville have no CMI.

## Quality (Benchmark's third topic)

Two non-HCAI sources, mapped onto HCAI facility numbers:

- **CMS Care Compare** (`cms-care-compare`): readmissions, mortality, PSI 90, patient experience (HCAHPS), ED time
  and sepsis bundle, and the overall star rating. Care Compare only publishes the current quarter, so the ETL reads
  CMS's archived snapshots (the last one of each year, plus the newest) and files each value under the year its
  measurement period **ends**; the card shows the period ("Jul 2023–Jun 2025"). Periods run up to three years and
  overlap. CMS left January–June 2020 out of its claims measures, so no period ends in 2020, and it withheld pneumonia
  results for the period ending June 2021. The retired claims-based hospital-wide readmission measure and its "hybrid"
  replacement are separate metrics. Missing values carry CMS's footnote reason ("too few cases to report").
- **CDPH healthcare-associated infections** (`cdph-hai`): CLABSI, C. diff, and MRSA as the SIR (observed ÷ predicted,
  with the 95% CI and CDPH's better/same/worse call) plus the raw rate on the same card; VRE as a rate only, because
  no national risk adjustment exists for it (CDPH compares it with the mean for the same hospital type). Rates follow
  CDPH: CLABSI per 1,000 central-line days, the rest per 10,000 patient days. Rehabilitation units, which report
  under their hospital's ID, are excluded. 2020 was published in two halves and is combined; many hospitals have
  July–December only.

**Facility matching** (`etl/hcai_etl/crosswalk.py`): CDPH uses its own ELMS facility IDs and CMS uses the Medicare CCN.
CDPH's Licensed and Certified Healthcare Facility Listing (plus its ELMS–OSHPD crosswalk for closed facilities) has
ELMS ID, CCN, license number, and HCAI ID side by side. Campuses reported separately roll up to the licensed hospital,
like utilization. CCNs retired after an ownership change are matched on ZIP plus a close name (listed in the manifest).
Where one CCN covers several licensed hospitals (Alameda Health System's Highland and San Leandro; Emanate), CMS's
combined score goes to the hospital CMS names and the other hospital says so. Coverage: 286 of 288 comparable general
acute hospitals reporting in 2024 have infection data.

**"Not yet reported"**: a card never shows an empty chart. Years the source hasn't published are named under the
chart; a hospital with no value gets "Not reported for this hospital" with the source's reason.

## Community context (Benchmark panel)

A collapsible panel under the hospital summary shows the hospital's **county**: population, median household
income, age 65+, poverty, health coverage (Census ACS 5-year), and Medi-Cal enrollment with its share of residents
and the share also on Medicare (DHCS certified eligibles, averaged over the year's months; recent months are
preliminary). It's context, not a benchmark, and the county isn't the hospital's service area.

- `dhcs-medi-cal`: file-based like the other sources (CHHS "Medi-Cal Certified Eligibles … by Month", dual-status table).
- `acs-county`: the one API source. Needs a free Census key at **ETL time only**: copy `.env.example` to `.env` and
  set `CENSUS_API_KEY`, or export it, then `python -m hcai_etl acs-county`. It picks the newest 5-year release that has
  every variable and writes `data/processed/acs-county/`; the key is never cached or written out. Until that runs,
  the panel shows Medi-Cal only.

## Medicare lens (Benchmark's Payer view)

Built from the Medicare columns HCAI already publishes in the financial report (`*_MCAR_TR` traditional Medicare,
`*_MCAR_MC` Medicare Advantage), so years and definitions match the all-payer view. The CMS public-use files are not
used (they cover traditional Medicare only, by calendar year, and need a CCN crosswalk).

- Each Medicare metric in `etl/hcai_etl/dictionary/hafd_selected.py` (`MEDICARE_METRICS`) has `lens: "medicare"` and
  `allPayer: <metric id>`, the metric it replaces. `applyPayerView` in `src/lib/data/datasets.ts` does the swap.
  Metrics with no Medicare split (days cash on hand, ED visits, occupancy, surgeries, …) stay all-payer and get an
  "All payers" tag on the card.
- **Medicare margin and cost per adjusted discharge are estimates**, tagged "Estimate" on the card. HCAI doesn't
  report expense by payer, so Medicare's cost is its gross charges × the hospital's cost-to-charge ratio
  (`TOT_OP_EXP ÷ (GR_PT_REV + OTH_OP_REV)`), the AHA payment-to-cost method. The median for comparable general
  hospitals is about −29% to −35% (payment-to-cost 0.74–0.78). That is far below MedPAC's Medicare margin (−13%
  nationally in 2023) **by design**: MedPAC counts only Medicare-allowable costs and traditional Medicare, while the
  AHA method counts all operating expense and includes Medicare Advantage. On the AHA method Medicare paid 82 cents
  per dollar nationally in 2022, and the California Hospital Association cites about 75 cents for California.
  Allocating by charges doesn't inflate Medicare's share: Medicare's share of gross charges (~44%) is below its share
  of patient days (~47–49%) and discharges (~47%). A days-based split would make the margin more negative.
- Medicare volumes (discharges, days, length of stay, outpatient visits) come from the financial report, so they're
  fiscal-year and include long-term care units. Cards say so.
- Medicare Advantage share (MA discharges ÷ all Medicare discharges) is available under the Medicare view and in Build.

## Propose (business cases)

`/propose` builds the case for a new initiative. The **core engine** (`src/lib/propose/engine.ts`, pure functions) is
the same for every proposal: year 0 is capital + implementation; years 1..life each get the full annual benefit minus
maintenance (no ramp-up, inflation, or taxes). It returns payback (fractional years, from cumulative cash), simple ROI
((total benefit − total cost) ÷ total cost over the life), NPV at the entered discount rate, and straight-line
amortized net. Scenarios multiply the module's annual benefit by an editable rate per scenario (default 70% / 100% /
130%, in the link as `scen=70,100,130` when changed); costs are unchanged. A Conservative rate above Optimistic gets a
non-blocking note, nothing more.

**Benefit modules are plug-ins.** Each is a `ProposalModule` (`src/lib/propose/module.ts`): its inputs, how they go
in the URL, its benefit calculation, and its editor. Register it in `src/components/propose/modules/index.ts`; if it
needs server data, add a loader to `src/lib/propose/module-data.ts` (served at `/api/propose/<id>?facility=`). The
engine and page don't change.

- **Reimbursement**: estimated payment per case = FY MS-DRG relative weight (Table 5, the 10%-capped column CMS pays
  on) × the national operating standardized amount (Table 1A labor + non-labor, full update: $6,848.98 for FY 2027).
  It is labeled everywhere as a **national Medicare estimate, not the hospital's actual reimbursement**: wage index,
  DSH/IME, outliers, transfers, capital (≈ weight × $540), and other payers aren't applied. Added volume is entered as
  cases a year, or as a % of the hospital's own 2024 Medicare fee-for-service cases for that DRG (from CMS's
  by-provider-and-service file; CMS hides counts under 11). The hospital's Benchmark peer group's median for each DRG
  is shown as context. An optional "cost of caring for the added patients" (% of payment) turns revenue into margin;
  at 0 the result counts revenue, and the page says so.
- **Finding DRGs** (for people who don't speak billing): a **Body system** filter (CMS's Major Diagnostic Category,
  from Table 5) narrows the picker, and search matches DRG code, title, body system, and **plain-language terms** from
  `src/lib/propose/drg-search-terms.ts`: "aneurysm" → intracranial vascular procedures, "tavr" → endovascular valve
  replacement, "robotic" → the inpatient DRGs where robotic approaches are common. Each entry lists the DRGs its terms
  mean directly (`drgs`, ranked first) and ones they touch (`related`). Adding terms means editing that file only; the
  server logs any code that isn't in the current Table 5 or any range that crosses body systems. A search with no
  inpatient DRG (MRI, CT, outpatient) explains why and points to the Custom module.
- **Custom**: named lines, each quantity × rate or a flat amount a year. No data.

No persistence by design (no accounts): the whole proposal, including every module's inputs, is in the URL, so
reloading keeps it and the link can be shared. "Print or save PDF" uses the browser; print styles
(`@media print` in `globals.css`) force the light palette, flatten the glass, and hide the app chrome and inputs.

ETL: `cms-ipps` (scrapes CMS's IPPS page for the newest final rule and downloads its Table 5 and Tables 1A–1E zips;
`--years 2026` picks another FY; checks that 1A and 1B agree) and `cms-inpatient` (the data.cms.gov catalog's newest
CSV; CCNs mapped like Care Compare through the shared `crosswalk.match_ccns`). Needs www.cms.gov and data.cms.gov
reachable.

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
src/lib/glossary.ts    the help panel's glossary, built from the dataset dictionaries (no second copy)
src/lib/propose/       Propose: the financial engine, the module contract, URL state, module data loaders
src/app/api/           /api/benchmark, /api/peers, /api/report, /api/correlate, /api/glossary,
                       /api/propose/[module], /api/facilities/[id]/fields
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
- Long lists (metrics, units, counties) all use one picker, `GroupedPicker` / `PickerPill`
  (`src/components/shell/grouped-picker.tsx`): a search box over groups that stay collapsed until opened. Short fixed
  lists (years, distance, bed size) use `FilterPill`.

## Brand

The name lives in `src/lib/brand.ts` (`APP_NAME` "Padua" for the nav wordmark, `APP_FULL_NAME` "Padua by Prisma" for
the page title, printouts, and the nav subline). The mark is `src/components/shell/padua-mark.tsx`: a thin-line SVG in
`currentColor` that thickens its stroke below ~64px. Favicons in `src/app/`: `icon.svg` (switches stroke color with the
browser's light/dark setting), plus `favicon.ico` (16/32/48) and `apple-icon.png` (180) on a dark tile. The home page's
attribution line (`APP_ATTRIBUTION`) is placeholder wording awaiting confirmation.

Internal names that still say "hcai" refer to the **data**, not the product, and are kept on purpose: the `etl/hcai_etl`
package, and the browser-storage keys `hcai-selection-v1` / `hcai-tour-v1` (renaming them would forget every viewer's
chosen hospital and replay the tour).

## Deploying (Vercel)

Import the repo in Vercel with the defaults (framework: Next.js). `next.config.ts` uses `outputFileTracingIncludes`
to bundle `data/processed/**/*.json` into the server functions, and API responses are CDN-cached for a day.
The app needs no environment variables (`CENSUS_API_KEY` is only for the ETL).

## Caveats worth knowing

- **Days cash on hand is hospital-level.** Hospitals in a system often sweep cash to the parent, so values can be
  near zero even at strong systems. Compare like ownership structures.
- **Financial and utilization years differ** (fiscal report years vs. calendar years); the app labels each chart.
- **Kaiser and other "non-comparable" hospitals** (per HCAI's Type of Hospital) are excluded from peer groups by
  default.
- **Recent financial years include reports HCAI hasn't finished auditing** ("In Process").
- **Deadline dates are computed from the rules.** Financial due dates aren't moved for weekends or holidays; the
  utilization due date is (per HCAI's instructions). SIERA is authoritative.
