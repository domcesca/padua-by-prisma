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
| **Propose** | The financial case for a new technology, service, or piece of equipment. Enter capital, implementation, and yearly running costs and a useful life; pick how the benefit is estimated (**Inpatient reimbursement**: MS-DRGs × added cases × a national Medicare payment estimate, with the hospital's own Medicare cases and its peers' as context; **Outpatient reimbursement**: APCs × added services × the national OPPS rate, with physician fees optional; **Cost savings**: staff time, shorter stays, supplies; **Avoided penalties**: the Medicare readmission (HRRP) and hospital-acquired condition (HAC) penalties a quality initiative would avoid; or **Custom**: your own benefit lines). Payback, ROI, NPV, amortized and cumulative net for Conservative / Expected / Optimistic side by side (70% / 100% / 130% of the estimated benefit by default; each rate is editable), a cumulative chart, a year-by-year table, and a print-to-PDF layout. The proposal lives in the link; nothing is saved. |
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

## Opportunity Finder (V7.0)

Once a hospital is picked, Padua ranks the handful of places it stands out unfavorably against its peers, with the math
shown. A weighted, transparent formula (no model); reads only what Benchmark and Propose already read.
- **Where it shows**: Home's "Where to look first" (top 3 primary findings, with Review in Benchmark / Model in
  Propose / Pin); Benchmark's **Key findings** panel above the hospital summary (5 primary, 5 to watch; on phones a
  summary bar and bottom sheet, the same `MobileSheet` as the filter strip); "Related signal" links on metric cards; a
  **methodology drawer** per finding (side sheet on desktop, bottom sheet on phones); and **`/briefing`**, pinned
  findings kept in this browser only, each shown as pinned next to now: "Still a key finding", "Score changed", or
  "No longer qualifies" (against the same peer group it was pinned with). Printable.
- **Families** (`src/lib/findings/families.ts`): Margin & liquidity, Cost per case, Revenue per case (financial);
  Readmissions, Infections & patient safety, Mortality, Patient experience (quality); ED throughput (operational).
  A family is one finding however many signals it has: e.g. readmission penalties on five conditions are one
  Readmissions finding with the conditions as its evidence, so they take one slot. Only metrics with a favorable
  direction (`directions.ts`) can be candidates; volumes, length of stay, occupancy, case mix and payer mix never
  are. Workforce and capacity aren't scored (no judged metrics yet; the HCAI staffing fields exist but need their own
  metric definitions and direction approval). Service lines and specialty data are context only.
- **Candidates**: a metric standing Unfavorable against peers (the V6.13 rule, with at least 5 peers with a value and
  the hospital's value no more than one period behind the source); a metric the source rates worse than its
  benchmark; a CMS readmissions (HRRP) penalty; the hospital-acquired-condition (HAC) penalty.
- **Score** (`src/lib/findings/score.ts`) = 100 × Severity × Persistence × Weight × Confidence.
  Severity = average of depth into the unfavorable quarter ((0.25 − q) ÷ 0.25) and distance from the peer median in
  interquartile ranges (capped at 3, ÷ 3); HRRP = cut ÷ 3% cap; HAC = 1. Persistence = 1.0 / 0.9 / 0.8 for 3 / 2 / 1
  of the last three values unfavorable, +0.1 if worsening; flat 0.9 for multi-year measurement windows and penalties.
  Weight = the family tier, 1.0 / 0.8 / 0.6. Confidence = product of peers (20+ 1.0, 10–19 0.9, 5–9 0.75), freshness
  (stale 0.8), provisional 0.85, partial period 0.85, matched record 0.9, unaudited 0.95, source says no different
  0.7, under 25 cases 0.8; High ≥ 0.8, Medium ≥ 0.6. Dollars (penalties) are evidence only.
- **Selection**: primary = score ≥ 20, Medium confidence or better, at most 2 per signal type, at most 5; the rest (up
  to 5) are "to watch". Ties: confidence, then a dollar figure, then persistence, then family order. The minimum of 20
  comes from a statewide calibration (`scripts/calibrate_findings.py`, against a running server): findings under 20
  sit barely inside the unfavorable quarter (median severity 0.26 vs 0.73 above).
- **Propose handoffs**: penalties open Avoided penalties prefilled with each condition's readmission-rate gap to the
  CMS peer-group median (or each infection's cut to the peer median), labeled "a starting point, not a target"; Cost
  per case opens Cost savings with a name and description only, no amounts.
- API: `GET /api/findings?facility=…` plus Benchmark's peer filters.

## Shared vocabulary (V6.13)

A consistency pass across every tool; no data or calculation changed (136/136 API responses identical to V6.12 apart
from the new status metadata).
- **Favorability** (`src/lib/favorability/`): every peer comparison leads with **Favorable**, **Unfavorable**,
  **Similar to peers**, or **Direction depends on strategy**, then the rank and peer median as evidence. Rule:
  outside the 25th–75th percentile band (the band the charts shade) on the favorable/unfavorable side; inside it,
  similar; fewer than 3 peers, "Too few peers to judge". Which way is favorable is one config,
  `src/lib/favorability/directions.ts` (higher / lower / context for every metric); `npm run check:directions` checks
  it against the ETL dictionaries' `higherIsBetter`. Volumes, length of stay, occupancy, case mix index, and payer mix
  are context: never judged.
- **Direction words**: metric cards say how the value moved since the previous period, "↗ Improving", "↘ Worsening",
  or "Up"/"Down" for context metrics, "→ Unchanged". Favorable and unfavorable use the same two tokens everywhere
  (`--color-favorable`, `--color-unfavorable`) and never carry meaning by color alone.
- **Status line** (`src/components/shell/status-line.tsx`, `src/lib/status.ts`, `src/lib/data/freshness.ts`): one line
  on every metric card, Build chart, Correlate axis, Translate year, and the payer mix, specialty, and service-line
  panels: data through · period type · published (from the source file's release date) · processed · audit status
  (HCAI financials) · quality flags from one vocabulary: stale, provisional, partial period, matched record,
  unavailable.
- **Terms** (`src/lib/vocabulary.ts`, listed first in the help glossary): hospital (not facility), peer group / peers,
  unit (a hospital's beds in one HCAI bed classification), service line, report year, calendar year, federal fiscal
  year, measurement period. The peer-group control is labeled "Peer group" in every tool; Build's extra hospitals are
  "Hospitals side by side".
- **Contrast**: secondary and tertiary text meet WCAG AA (4.5:1) in light and dark; 11px captions and metadata are now
  12px; inactive navigation is darker.
- **Loading and empty states**: skeletons say what's loading ("Loading Cedars-Sinai Medical Center's utilization
  data…"); Propose shows what the results will hold instead of zeros until a benefit or cost is entered.
- **Small screens**: Benchmark's and Correlate's control strips fold into a pinned summary bar (hospital, topic, data
  period, "Filters" with a count) and a bottom sheet with the full controls.
- **Keyboard and screen readers**: every focusable control shows a solid focus ring; loading states and result counts
  are announced (`LiveStatus`); pickers and popovers return focus to their trigger (checked in the browser).

## Service lines (V6.12)

Benchmark → Utilization → **Unit or service line** groups HCAI's 14 bed classifications into service lines, alongside
the existing one-classification unit view (which is unchanged).
- **Mapping** (`src/lib/service-lines/lines.ts`, edit to regroup, rename, or add a line; no data rebuild): Medical/Surgical;
  Critical Care (ICU, CCU, Respiratory) = Intensive Care + Coronary Care + Acute Respiratory Care; Maternity & Newborn = Perinatal + NICU,
  with the well-baby nursery (report line 35) listed under it but outside its totals (nursery days and infants only;
  bassinets aren't licensed beds, and a NICU-then-nursery baby would count twice); Pediatrics; Burn Center (standalone,
  13 hospitals in 2024); Rehabilitation; Behavioral Health = Acute Psychiatric + Chemical Dependency Recovery; Long-Term
  Care = Skilled Nursing + Intermediate Care + ICF/DD. The server checks at load that every classification is in
  exactly one line.
- **Views.** `?line=all`: every line with licensed beds, patient days, discharges, occupancy, peer median occupancy,
  and length of stay, each followed by its classifications, plus a whole-hospital row; a year picker covers every
  year reported. `?line=criticalCare` (lines of 2+ classifications): the same metric cards as a unit, combined,
  with that line's breakdown above them. A unit view links to its line.
- **Math** (`src/lib/service-lines/compute.ts`, from `fields.json`): sums of HCAI's own fields, then occupancy =
  Σ patient days ÷ Σ licensed bed days, ADC = Σ days ÷ days in the period, LOS = Σ days ÷ Σ stays (discharges, plus
  transfers out for critical care, NICU, and skilled nursing: "time in unit"). Rounding mirrors the ETL's Python
  `round`, so a classification's row matches the unit view exactly.
- **Reconciliation:** for all 2,645 hospital-years, the lines add up to TOT_LIC_BEDS, TOT_LIC_BED_DAYS, TOT_CEN_DAYS,
  and TOT_DISCHARGES (±1 from rounding in 4 annualized years), and 9,859 classification rows match `units.json`. A
  classification counts in a year if it had beds on Dec 31 *or* any activity (units that closed mid-year).
- **Blanks.** About 475 classification-years report beds but leave patient days or discharges blank. The combined line
  counts a blank as none (as HCAI's own hospital totals do) and says so; the classification's row shows the blank.
- **Why "Critical Care", not "Adult":** HCAI has no pediatric ICU classification, so a PICU's beds are Intensive Care
  and land in this line (e.g. Children's Hospital Los Angeles's 74). The line's note says so.

## Specialty benchmarking (V6.11)

Benchmark → Utilization → **Medicare specialty** compares hospitals by clinical specialty, which HCAI's bed data
(organized by acuity, not specialty) can't do. It rolls the per-hospital, per-MS-DRG Medicare baseline that Propose's
Inpatient reimbursement already uses (`cms-inpatient`) up to CMS's MDCs (Major Diagnostic Categories). No new data
source; `src/lib/specialty/compute.ts` aggregates on request, and `/api/specialty` serves it.
- **Views.** All specialties: a table of MDCs with the hospital's cases, estimated payment, or share of cases, the peer
  median, and where it ranks. One specialty: every peer ranked on it, plus the hospital's DRGs in it. Up to 4 hospitals
  can be added side by side (`&with=`). URL: `?view=utilization&specialty=all|05|PRE|none&with=…`.
- **Labels** (`src/lib/specialty/mdc.ts`, edit to relabel): CMS's official MDC name (short form) with a plain-language
  specialty, "Circulatory System (Cardiac & Vascular)", and a note wherever an MDC spans specialties people think of
  separately (circulatory = cardiology + cardiac and vascular surgery; musculoskeletal = ortho, spine, and
  rheumatology-adjacent; infectious = mostly sepsis from every service; myeloproliferative ≠ all cancer).
- **Scope, shown on screen:** Original Medicare fee-for-service discharges at IPPS hospitals only. It excludes Medicare
  Advantage and every other payer; critical access, psychiatric, rehab, long-term care, and children's hospitals; and
  psych or rehab units paid outside IPPS.
- **Suppression.** CMS drops hospital-DRG rows under 11 cases, so an MDC's count sums its DRGs with 11+ (a floor). An
  MDC with none shows "fewer than 11 in each DRG" (this can still total more than 10 cases). Peer medians use peers
  with a count.
- **Estimated payment:** cases × FY 2027 DRG weight × the national operating standardized amount, the same as Propose.
  It's a national average, so hospitals compare on volume and case mix.
- **DRG → MDC across versions.** 2024 cases were grouped under the FY 2024 and FY 2025 MS-DRGs, and 13 of their DRGs
  (1.3% of cases; spinal fusion 453–460 is most of it, about 14% of Musculoskeletal) aren't in the FY 2027 table. The
  `cms-inpatient` ETL now reads Table 5 for FY 2024–2027, checks that every DRG's MDC is the same in all of them (it is),
  and writes `drgs.json`. Retired DRGs are priced at their last published weight.

## Closed and outdated hospitals (V6.10)

Wherever a hospital is picked or summarized, a flag says when its numbers shouldn't be read as current
(`src/lib/facility-flag.ts`): a callout on Benchmark's hospital card (so every category and unit view) and under
Propose's hospital picker (it prints), and a badge on the shared hospital picker on every tab.
- **Closed?** HCAI's Licensed Healthcare Facility Listing (CHHS Open Data, `hcai-facility-status` ETL: the current
  listing and every half-year snapshot since December 2016, keyed by OSHPD ID = HCAI facility number, so no
  crosswalk) shows the license in Suspense (not operating) or Closed, now or when the hospital dropped off the listing.
  The listing has no closure-date field; the date shown is that status's effective date. Adventist Health Feather River
  (Paradise): Open through June 2019, Suspense from 2019-09-30, off the listing from December 2020. Six hospitals as of
  the September 2026 listing.
- **Outdated.** The hospital's newest report is more than two years behind the newest year any hospital has.
Hospitals that dropped off the listing while still Open get only the outdated flag: a new license or facility number
(CPMC's California campus, Modoc Medical Center's new building, campuses folded into another license) looks the same
as a closure, so the listing alone doesn't prove one.

## Navigation and help (V6.9)

- **Build hub.** "Build" in the nav opens `/build`, a landing page for its two tools: the report builder
  (`/build/report`, formerly `/build`) and Correlate (`/build/correlate`, formerly `/correlate`). Old links keep working:
  `/correlate?…` redirects (308, `next.config.ts`) to `/build/correlate?…`, and a `/build?…` link carrying report
  settings (anything beyond `facility`/`category`) redirects to `/build/report?…`. The tools themselves are unchanged.
- **About this tool.** Every tab has an "About this tool" button beside its title, a popup styled like the glossary with
  two or three plain sentences (`src/lib/about.ts`; keep them that short). Quality isn't a separate tab: it's a
  Benchmark view, and Benchmark's panel covers it.
- **Tours** (`components/shell/tour.tsx`, one engine): the first-visit **welcome** tour is now three steps (the nav,
  the hospital picker, where help lives) and still plays once per browser. **Propose** (7 steps) and **Correlate**
  (6 steps) have step-by-step walkthroughs, started only from "Show me how this works" in their About panels; steps
  point at `data-tour` targets and skip any that aren't on screen.

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
engine and page don't change. A module's `benefit` also gets the useful life, for benefits that phase in.

- **Inpatient reimbursement** (id `reimbursement`): estimated payment per case = FY MS-DRG relative weight (Table 5, the 10%-capped column CMS pays
  on) × the national operating standardized amount (Table 1A labor + non-labor, full update: $6,848.98 for FY 2027).
  It is labeled everywhere as a **national Medicare estimate, not the hospital's actual reimbursement**: wage index,
  DSH/IME, outliers, transfers, capital (≈ weight × $540), and other payers aren't applied. Added volume is entered as
  cases a year, or as a % of the hospital's own 2024 Medicare fee-for-service cases for that DRG (from CMS's
  by-provider-and-service file; CMS hides counts under 11). The hospital's Benchmark peer group's median for each DRG
  is shown as context. An optional "cost of caring for the added patients" (% of payment) turns revenue into margin;
  at 0 the result counts revenue, and the page says so.
- **Finding DRGs** (for people who don't speak billing): a **Body system** filter (CMS's Major Diagnostic Category,
  from Table 5) narrows the picker, and search matches DRG code, title, body system, and **plain-language terms** from
  `src/lib/propose/search-terms.ts`: "aneurysm" → intracranial vascular procedures, "tavr" → endovascular valve
  replacement, "robotic" → the inpatient DRGs where robotic approaches are common. Each entry lists the DRGs its terms
  mean directly (`drgs`, ranked first) and ones they touch (`related`). Adding terms means editing that file only; the
  server logs any code that isn't in the current Table 5 or any range that crosses body systems. A search with no
  inpatient DRG (MRI, CT, outpatient) explains why and points to Outpatient reimbursement.
- **Outpatient reimbursement** (`outpatient`): pick APCs (CMS's outpatient payment groups) and the added services a year
  (or a % of the hospital's own 2024 Medicare services, where CMS publishes them). The hospital (facility) side is each
  APC's national unadjusted OPPS payment rate from Addendum A, labeled as a national estimate like the DRG module (no
  wage index, multiple-procedure discounts, packaging, or outliers). A "Whose revenue counts" toggle picks **Hospital
  only** (default; independent physicians bill for themselves), **Hospital + physician** (employed physicians), or
  **Physician only**; physician payments are entered per APC by the proposer, tagged as their assumption, with a link to
  CMS's Physician Fee Schedule Look-Up. Picker groups (Imaging, Visits/ED, Surgery and procedures, …) and plain-language
  terms come from the same `search-terms.ts` entries as DRGs (`apcs` / `relatedApcs`). **Why APCs, not CPT codes:**
  CMS serves the OPPS addenda and PFS RVU files under the AMA's CPT license (internal, non-commercial use only; no
  redistribution or derivative works), so Padua carries no CPT content: the ETL takes Addendum A only, keeps APC-level
  fields, and fails if the file ever contains CPT-like columns or titles. APCs are levels ("Level 3 Imaging without
  Contrast"), so terms point at the family. A "confirm each APC level with your coding team" caution sits above the APC list, at the
  top of the results (a module can set `caution` on its benefit; it prints too), and on each APC line in "What went in".
  The baseline (data.cms.gov "Medicare Outpatient Hospitals – by Provider and Service") covers only the 72
  comprehensive APCs (procedures, observation); imaging, ED, and clinic APCs have no per-hospital counts, and the page
  says so. Professional claims are published per clinician (NPI), with no clean hospital link, so there's no physician
  baseline.
- **Cost savings**: staff hours saved a week × loaded hourly cost × 52, patient days avoided a year × cost of a patient
  day, and a flat supplies/other amount. The cost of a day is pre-filled with the hospital's latest HCAI average: operating
  expense ÷ adjusted patient days (patient days × gross ÷ inpatient charges, the per-day twin of Benchmark's expense per
  adjusted discharge), with its peer group's median beside it, and labeled as a fully loaded average that overstates what
  a day off a stay saves. Hospitals with more than 10% of their days in long-term care units (skilled nursing, sub-acute)
  aren't pre-filled, since those cheaper days pull the average far below an acute day; the figure is shown and the
  proposer enters their own. Overwriting the figure goes in the link (`daycost=`); "Use HCAI" restores it.
- **Avoided penalties**: the proposer enters a cut in readmission rate (points, per HRRP condition) or in infections (%,
  per HAC infection measure); the module re-runs CMS's formulas (`src/lib/propose/penalty.ts`) on the hospital's own
  published results. HRRP: min(3%, neutrality modifier × Σ DRG payment ratio × max(0, ERR − peer median ERR)) over
  conditions with 25+ cases, on base operating DRG payments; with the published components it reproduces CMS's penalty
  for every hospital. A cut of x points lowers the predicted rate by x (CMS's model shrinks small hospitals toward
  average, so real ERRs move less); peer medians are held. HAC: SIRs fall by the percent entered, are rescored as
  Winsorized z-scores, and the Total HAC Score is compared with the cutoff; it's all or nothing (1% of operating
  payments) and only offered to hospitals penalized that year, with the distance to the cutoff shown. Penalties lag
  performance, so each program's scoring window is phased in year by year (readmissions: from year 3, full in year 6;
  infections: from year 2, full in year 4, taking year 1 to start on October 1) and the module gives the engine the
  **average over the useful life**, showing the full-effect figure and the year-by-year table beside it. Lost payments for
  avoided readmissions and care costs saved aren't counted, and the notes say so.
- **Custom**: named lines, each quantity × rate or a flat amount a year. No data.

Inputs are tagged **Public data** (with the source and year) or **Your assumption** in the editors, and the results'
notes repeat which is which.

**Intake.** "Describe what you're proposing" (optional) suggests a module (`src/lib/propose/intake.ts`) from the same
`search-terms.ts` entries as the code pickers: DRG entries vote for inpatient, APC entries for outpatient, and intent
entries (`modules: [...]`, e.g. "FTEs", "boarding", "readmissions", "CLABSI") for the module they name, counting double.
It suggests only when the winner scores at least 1 and leads the runner-up 1.5 to 1; otherwise (or with nothing typed)
the module picker stays open, as before. A suggestion folds the picker to the chosen module with "Choose another way"
one click away; picking by hand (`pick=manual`) stops later edits to the description from switching modules. In the
link as `desc=`.

**Printout.** A "Printout" panel next to Print sets what the printed/PDF proposal includes (`src/lib/propose/output.ts`):
presets **Board summary** (scenario comparison, chart, a short key-assumptions box) and **Finance committee** (today's
full printout: adds the year-by-year table and the full "What went in" list), then per-section on/off, Key vs Full
assumptions, and up/down order. The screen always shows everything; only print changes. The caution, notes, and method
text always print. In the link as `out=board|finance|<sections in order>`; links from before this (a proposal with no
`out`) open as Finance, so what they printed doesn't change; new proposals start on Board.

**Advanced mode** (`src/lib/propose/advanced.ts`, `advanced-panel.tsx`): a switch under Costs, off by default. Off, or on
with every field at its default, results are identical to the basic model (checked against `main` on the rendered
results of every module, including links that carry advanced settings while it's off). On, three folded sections:
- **Payer mix** (inpatient and outpatient reimbursement only; `payerMix: true` on the module): share and a "pays vs
  Medicare" multiplier per payer (Medicare, Medi-Cal, Commercial, Other and self-pay). Medicare is 1.00 by definition;
  the others are blank until the proposer enters them (no invented contract rates). "Use this hospital's payer mix"
  fills the shares from HCAI (gross charges). The estimate is multiplied by Σ share × multiplier (shares scaled to
  100%), shown as a "Payer mix adjustment (advanced)" line so the lines still add up.
- **Ramp-up**: straight line from "starts in year" to "full from year" (default 1 → 1). Avoided penalties
  (`ownTiming: true`) keeps its CMS scoring-window phase-in; in Advanced mode its editor gets "Phase-in timing" per
  program, and setting years other than CMS's switches that program to a straight line.
- **Escalation**: benefit and running-cost growth, % a year, compounding from year 2; the up-front cost isn't escalated.
Ramp-up and escalation reach the engine as optional per-year factors (`YearFactors`); without them the engine's math is
the original (checked on 1.2M random inputs). With them, "benefit a year" and "net a year" on the cards read "avg".
In the link: `adv=1`, `pm=`, `ramp=`, `esc=`, and the penalty module's `ptime=`; kept when Advanced is off, applied only
when on.

V6.10 adds six more, each with its own switch (so one can be used without the others) and all off by default:
- **Wage index** (reimbursement modules; `wageIndex: true`): prices at the hospital's own CMS wage index the way Medicare
  pays. Inpatient: weight × (labor-related × wage index + non-labor), Table 1A's split above 1 and 1B's at or below
  (`lib/propose/wage-index.ts`). Outpatient: national rate × (0.60 × wage index + 0.40); physician fees aren't adjusted.
  Labeled "wage-index-adjusted for <hospital>" in the editor, the lines, "What went in", and the notes; hospitals with
  no published index (critical access, children's, cancer, psychiatric, rehab, LTC for IPPS) stay on the national rate
  with a note.
- **Break-even volume** (`lib/propose/analysis.ts` `breakEven`): the least multiple of the entered volume (each module's
  `volume` hook: cases, services, hours/days/supplies, improvement, benefit lines) at which the expected scenario's
  cumulative cash reaches zero by the end of the useful life. Scans and bisects, so capped or all-or-nothing benefits
  (penalties) work; "not reachable" when even 1,000× doesn't pay back. One number under the scenario cards.
- **Sensitivity** (`sensitivity`, `sensitivity-chart.tsx`): the expected scenario's NPV or ROI with one input at a time
  lowered and raised 10/20/30% (volume, the module's own `drivers` such as payment per case or hourly cost, up-front
  and running costs, useful life, discount rate for NPV, growth rates when set), ranked in a tornado chart with a
  screen-reader table. A printout section ("Sensitivity (Advanced)"): in the Finance preset, not Board.
- **Staff time by role** (Cost savings, in its editor): role, hours saved a week, loaded hourly cost; summed into the same
  staff-time saving. Seeded from the single pair when first switched on.
- **Lost readmission revenue** (Avoided penalties, in its editor): $ per avoided readmission × readmissions avoided a
  year (each cut × the condition's HRRP Medicare discharges ÷ the 3-year window), from year 1, netted as a negative line.
- **Readmission dampening** (Avoided penalties): the share (0–1, default 1) of a cut that reaches the ERR, for CMS's
  shrinkage toward the average. A "use this hospital's" button offers a rough reading from CMS's own figures:
  (predicted − expected) ÷ (raw − expected), discharge-weighted; labeled as not a CMS figure.
Break-even and sensitivity re-run the same model (`modelBenefit` → engine); they never change the estimate. In the link:
`wi=1`, `be=1`, `sens=20[:roi]`, and the modules' `byrole=1&roles=RN~10~70|…`, `lostrev=on:12000`, `damp=on:0.5`.
Checked against `main`: rendered results identical with Advanced off (including links carrying all the new settings)
and with Advanced on and the new options off.

No persistence by design (no accounts): the whole proposal, including every module's inputs, is in the URL, so
reloading keeps it and the link can be shared. "Print or save PDF" uses the browser; print styles
(`@media print` in `globals.css`) force the light palette, flatten the glass, and hide the app chrome and inputs.

ETL: `cms-ipps` (scrapes CMS's IPPS page for the newest final rule and downloads its Table 5 and Tables 1A–1E zips;
`--years 2026` picks another FY; checks that 1A and 1B agree) and `cms-inpatient` (the data.cms.gov catalog's newest
CSV; CCNs mapped like Care Compare through the shared `crosswalk.match_ccns`), and `cms-penalties`: the Provider Data
Catalog's current HRRP (9n3s-kdb3) and HAC (yq43-i98g) hospital files, the HRRP Supplemental Data File from the same
fiscal year's final rule page (ERRs, peer medians, DRG payment ratios, neutrality modifier), and the newest final rule's
Impact File and Tables 1A/1B for estimated Medicare payments (transfer-adjusted cases × case mix × wage-adjusted
standardized amount; plus IME, DSH, and outlier factors for the HAC base; capital and uncompensated care left out). CMS
doesn't publish the HAC measures' national mean, SD, and Winsorization bounds, so the ETL recovers them from the national
file and fails unless they reproduce every hospital's z-scores; it also fails unless the HRRP formula reproduces every
published penalty. The hospital-level files trail the fiscal year (a year's HRRP supplemental file comes with or after
its final rule; its HAC file the following January), so the newest complete year is used: FY 2026 as of September 2026.
`cms-opps`: the newest quarterly OPPS Addendum A (through CMS's AMA click-through; APC rows only, service status
indicators only, so drug/device/biological APCs are dropped; 299 APCs in July 2026, conversion factor $91.415) and the
newest outpatient provider-and-service CSV (suppressed counts under 11 are left out, not zeroed). Needs www.cms.gov and
data.cms.gov reachable.
`cms-wage-index` (run after `cms-opps`): each hospital's IPPS wage index from the newest final rule's Table 2 ("Wage
Index With Cap", or the low-wage transition value where filled; fails unless it matches the same rule's Impact File for
every hospital in both, 3,074 for FY 2027), the Table 1A/1B labor splits, and the OPPS wage index from the matching
calendar year's OPPS final rule Hospital Impact File ("Post Reclassification Wage Index": the final FY IPPS index; checked
against Table 2's prior-year column, 2,957 of 2,978 equal, the rest revised after the OPPS rule). OPPS's 60% labor
share is a constant (it isn't restated in the files).
`hcai-facility-status` (after the HCAI datasets): HCAI's Licensed Healthcare Facility Listing, current and half-year
snapshots; writes only the app hospitals that aren't Open on the current listing (see "Closed and outdated hospitals").

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
