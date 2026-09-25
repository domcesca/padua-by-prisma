# PROGRESS — handoff for the next session

_Last updated 2026-09-25, mid-V4 (see §2 V4). Read this first, then `README.md` (run/refresh/deploy commands) and `AGENTS.md` (this is Next.js 16 — check `node_modules/next/dist/docs/` before writing Next code)._

## 1. Project overview

**HCAI Insights** (working name; the repo is `usc-hcai-insights`) is a web app for California hospital administrators and finance leaders (CFO-level readers). It turns HCAI's public hospital financial and utilization files into peer benchmarks, a chart/table builder, a plain-language field guide, and a filing calendar. There are no accounts, no database and no API keys. All data is public HCAI open data, pre-processed by a Python ETL into committed JSON.

## 2. What's built

### V1
- **Benchmark** (`/benchmark`): a hospital vs. its peer group. Each metric card shows the latest value, a one-line takeaway ("Higher than 62% of 22 peers"), a trend chart (hospital, peer median, middle-50% band, state median) and a chart/table toggle. Payer mix is included. Every view is a shareable URL.
- **Translate** (`/translate`): every field in plain language, with why it moves. Pick a hospital to see year-over-year changes, or paste or upload a raw HCAI `.xlsx`/`.csv` extract. The upload is parsed in the browser and never sent to a server.
- **Deadlines** (`/deadlines`): quarterly and annual financial due dates by fiscal year end, extension limits, off-cycle periods, and filed/extended checkboxes (stored in the browser only).

### V2 (5 commits, one per step)
1. **Utilization data** (`b503513`): HCAI Annual Utilization Report 2019–2024, 458 facilities.
   - Adds 14 metrics: occupancy, ALOS, discharges, inpatient days, licensed beds, ED visits, ED admit rate, ED high-acuity share, ED LWBS rate, ED visits per station, diversion hours, inpatient surgeries, outpatient surgeries and cath procedures.
   - Financials gained cost per adjusted discharge and revenue per adjusted discharge.
   - Deadlines gained the utilization report (due Feb 15, moved to the next working day).
2. **Similar-hospital peers** (`3ea2eb9`): the new default peer group (see §3). The peer-group control has three modes: Similar hospitals, All of California and Custom filters.
3. **Guided home page** (`9764459`): `/` walks through three steps.
   - Pick a topic: Financials or Utilization. Quality and Case mix are shown as "coming later".
   - Pick a hospital.
   - Optionally refine the peers, metrics and years.

   It then lands pre-loaded in Benchmark. The chosen hospital and topic follow the user across tabs through `src/lib/selection.ts` (localStorage key `hcai-selection-v1`).
4. **Build tab** (`596c15a`, `/build`): up to 4 catalog metrics, shown as a bar, line or table chart.
   - Group by year, by hospital (up to 4 compared, or the 20 nearest peers) or by peer group.
   - Every result has a legend, a table view, CSV download and a copyable link.
5. **Liquid Glass refresh** (`b09ba3a`): applied across every screen (see §3).

### Placeholders only
- **Ask** (`/ask`) and **Watch** (`/watch`): "coming soon" pages that describe the planned feature, built with `src/components/shell/coming-soon.tsx`. Nothing is implemented.

### Rough edges and known issues
- **Similar hospitals can widen a long way.** For rural or unusual hospitals the group can widen to 100 mi or statewide. The UI states the reason, but the peers can be loose.
- **Widening order is debatable.** "County, any ownership" comes before "50 mi, same ownership". This hasn't been confirmed with the user.
- **Kaiser and other hospitals HCAI marks non-comparable are excluded by default**, for utilization as well as financials. Utilization might reasonably include Kaiser. Not confirmed.
- **Palette contrast.** Three light-mode series colors are below 3:1 contrast, so the legend and table view are always present.
- **Deadline dates are computed.** Financial due dates are not shifted for weekends or holidays; the utilization due date is shifted for weekends and Presidents' Day, which is our reading of HCAI's rule. SIERA is authoritative.
- **Unaudited financial years.** Recent financial years include "In Process" (unaudited) reports.
- **Build warning.** Turbopack warns about a stray `C:\Users\domin\package-lock.json` outside the repo. It's harmless, and the file hasn't been removed.
- **No automated tests.** Verification so far has been typecheck, lint, `next build`, and manual/browser checks at desktop and 375px widths in both themes.

### V3 (in progress)
1. **Medicare lens** (done): a "Payer view" toggle (All payers / Medicare, `?payer=medicare`) on Benchmark for
   Financials and Utilization, built from HCAI's own Medicare columns (the user chose this over the CMS public-use
   file; CMS payment per discharge may be added later as an extra metric). Medicare margin uses the AHA
   payment-to-cost method (cost-to-charge ratio = TOT_OP_EXP ÷ (GR_PT_REV + OTH_OP_REV)); median −29% to −35%,
   checked against AHA (82¢ per dollar nationally, 2022) and CHA (~75¢ in California). It's far below MedPAC (−13%)
   by design; the popup says so. Charge-based allocation doesn't inflate Medicare's share (charge share ~44% <
   days share ~47–49%).
2. **Quality topic** (done): see README "Quality". CMS Care Compare (archived snapshots) + CDPH HAI. **CDPH's
   Facility_ID is NOT the HCAI ID** (ELMS ID, e.g. 930000004); mapped via CDPH's facility listing + ELMS–OSHPD
   crosswalk (`etl/hcai_etl/crosswalk.py`), 286/288 comparable general hospitals matched. **VRE has no SIR** in the
   source (no national risk adjustment) — rate only, as the user agreed for missing years. VRE is still published
   through 2025. Rates follow CDPH units (CLABSI per 1,000 line days, others per 10,000 patient days).
3. **Community context** (done): Medi-Cal enrollment (DHCS) and Census ACS 2020–2024 5-year, fetched from the
   live API with the user's `CENSUS_API_KEY` (never written to disk). Verified: 58 counties, no nulls, county
   populations sum exactly to the API's state total (39,287,377), and population, median age, % 65+, median household
   income, poverty, and uninsured match Census's independent profile tables (DP03/DP05) for LA, SF, Humboldt, and
   Imperial. DHCS enrollment runs well above ACS self-reported Medicaid (15.0M vs ~10.6M statewide; LA 42% vs 30%) —
   known survey undercount; the panel labels the Census bar self-reported and explains the gap.
4. **Correlate tab** (done, built at the start of V4): `/correlate`, `src/lib/correlate/{spec,run}.ts`,
   `/api/correlate`. Pairs values by year number across datasets (and says so when year kinds differ). Default year =
   newest with ≥80% of the best coverage. r, slope and Spearman ρ verified against scipy. Small-sample note below 8
   hospitals (`SMALL_SAMPLE`); no r below 3.

### V4 (in progress)
1. **Length of stay / average daily census** (done). All-payer LoS already existed as `alos` ("Average length of stay
   (acute)", GAC lines 1–9). Added `adc` = acute census days ÷ days in the period (`hau`). Both acute-only; note that
   inpatient days, discharges and occupancy are all-bed totals, not acute-only. Medicare-lens LoS (financial report)
   still includes SNF days.
2. **Home page reorder** (done): hospital first, then topic.
3. **Case mix index** (done): pulled directly from CHHS (`case-mix-index` package) — the user didn't need to supply a
   file. Federal fiscal years 2019–2025, category Utilization. Per-facility in the source, so campuses are combined by
   utilization-report discharge weights (see README). The "Case mix" home placeholder now describes a future
   conditions/procedures topic.
4. **Hospital card** (done): licensed beds, FY end, data years, plus latest LoS, ADC (both acute) and CMI.
5. **Unit-level drill-down** (done). User decisions: HCAI's 14 categories as-is (no "Definitive Observation"); a unit is
   offered only if the hospital has licensed beds > 0 in it; peer comparison included, limited to peers with the unit.
   `hau` ETL writes `units.json` (per facility-year per unit: licensed beds, occupancy, ADC, ALOS with HCAI's critical-care
   transfer denominators, discharges, patient days; campuses rolled up like everything else). Benchmark `?unit=<id>`
   (Utilization only, all payers only; Payer toggle hidden), unit pill next to the topic, unit-specific metric
   definitions (`src/lib/benchmark/units.ts`). Home has an optional step 3 "View by unit". Checks: unit beds sum to
   hospital beds in every facility-year; unit ALOS matches HCAI's published ALOS in all 7,194 single-report,
   single-campus unit-years 2019–2024 (the 4 differences left are years a second campus was rolled into the license,
   where HCAI's figure is the parent campus only). Getting there fixed a V2 bug: skilled nursing ALOS must count
   SN_INTRA_TRANSFERS like critical care (HCAI's SN_ALOS_CY matches that for 89/89 SNF units in 2023 and 2024);
   the ETL had counted discharges only. Hospital-wide metrics were unaffected; fields.json SN_ALOS_CY (Translate) changed. 105/2,621 facility-years report patient days in a category with 0 licensed beds (e.g. ICU-level days in
   med/surg-licensed beds) — those days aren't in any unit view, by the beds > 0 rule. Not extended to Build/Correlate
   (they're hospital-wide). HAU report page 3 has: Medical/Surgical (1), Perinatal (2), Pediatric (3), Intensive Care (4), Coronary Care (5), Acute
   Respiratory Care (6), Burn (7), Intensive Care Newborn Nursery (8), Rehabilitation Center (9), GAC subtotal (15),
   Chemical Dependency Recovery (16), Acute Psychiatric (17), Skilled Nursing (18), Intermediate Care (19), ICF-DD
   (20), Total (25), plus lines 30/31 (chemical dependency recovery hospital / acute psychiatric hospital licenses)
   and newborn-nursery census days (35). There is **no "Definitive Observation" line**. Each has licensed beds, bed
   days, discharges, census days (critical care also intra-hospital transfers). Raw files are cached in `data/raw/hau`.

Cloud sessions need data.cms.gov, data.chhs.ca.gov and api.census.gov allowed (the user added them); CHHS
downloads redirect to s3.amazonaws.com, which was reachable. calhospital.org and aha.org were not.

## 3. Key decisions and why

### Peer groups: a proxy, not a PSA/SSA
- **Where it lives:** `src/lib/benchmark/peers.ts` (`resolvePeerGroup`, with a minimum of 5 peers).
- **Default match:** same county, same bed band (<100 / 100–299 / 300+) and same ownership group (nonprofit, district, investor-owned, or county/city/UC/other).
- **Widening order** when there are fewer than 5 matches:
  1. county + band + ownership
  2. 25 mi + band + ownership
  3. county + band
  4. 50 mi + band + ownership
  5. 50 mi + band
  6. 100 mi + band + ownership
  7. 100 mi + band
  8. statewide + band + ownership
  9. statewide + band
  10. everyone

  The UI shows the reason for any widening.
- **Distance** is haversine (straight-line) from the lat/long in the utilization file.
- **Who counts as a peer:** only hospitals that reported within one year of the latest year.
- **Why it's not a service area:** a true primary/secondary service area needs patient-origin data (discharges by ZIP). HCAI does not publish that as open data; it requires a formal **Limited Data Set request**, which is out of scope for now.
  - The UI labels the group "Similar hospitals" and has an info note saying it is not a service area.
  - **Never label it a PSA/SSA or invent service-area boundaries.**

### Data and ETL
- **Code:** a Python/pandas package in `etl/hcai_etl/`, one class per dataset in `datasets/` (`hafd_selected.py` and `hau.py`), registered in `datasets/__init__.py`.
- **Dictionaries:** each dataset has a plain-language dictionary in `dictionary/<id>.py`. Every metric has a `category`, and that is what puts it into the metric catalog.
- **Downloads:** the ETL fetches source files from the CalHHS CKAN API. Files are cached in `data/raw/`, which is gitignored. **Nobody places source files by hand.**
  - Financial package: `hospital-annual-financial-data-selected-data-pivot-tables`.
  - Utilization package: `hospital-annual-utilization-report`.
  - Preliminary years are skipped unless requested, e.g. `--years 2025`.
- **Output:** `data/processed/<id>/{facilities,metrics,fields,dictionary,manifest}.json` is **committed**, so the app needs no Python to run.
- **Quirks handled** (details in the README):
  - **Report periods:** financial "report years" are the year a fiscal period ended.
  - **Multiple reports in one year** are combined: flows summed, stocks taken from the latest report, and annualized when coverage is more than 3% off a full year.
  - **Header drift** between extracts is normalized.
  - **Campus rollup:** utilization is filed **per campus** and rolled up to the parent `LICENSE_NO` so it matches the financial report. Campus names are kept.
  - **Rates are recomputed** from the combined totals.
- **Utilization-schema calls made without asking the user.** These were reported to them; revisit if they object.
  - Births are blank in HCAI's files from 2022, so there is no births metric.
  - There is no total outpatient-visits field, so outpatient visits come from the financial file (`VIS_TOT`, fiscal year).
  - Utilization is by calendar year and financials by fiscal year. Charts label which is which.

### Stack as built
- **Next.js 16.3 App Router** (Turbopack) with React 19.2.
  - URL state is synced with native `window.history.replaceState`, **not** `router.replace`. That avoids a server re-render on every filter change.
- **Tailwind v4.** Custom utilities are defined with `@utility` in `src/app/globals.css`.
- **shadcn "base-nova"** components on `@base-ui/react`, which is not Radix.
- **Recharts 3** and lucide icons. Browser `.xlsx` parsing uses `read-excel-file`.
- **Deviation from the original plan:** the data is **JSON only, with no Parquet and no database.**
  - `src/lib/data/store.ts` is the **single storage boundary** and is server-only. It merges facilities across datasets; a comment there sketches a Postgres/SQLite table layout.
  - `next.config.ts` uses `outputFileTracingIncludes` to bundle the JSON into server functions.
- **Server data access** goes through API routes: `/api/benchmark`, `/api/peers`, `/api/report` and `/api/facilities/[id]/fields`. Responses are CDN-cached for a day.
- **Adding a dataset:** register it in the ETL, then add its id to `DATASET_IDS` (`store.ts`) and `DATASETS` (`src/lib/data/datasets.ts`). Its metrics then flow into Benchmark, Build and Translate automatically.
- **Build is config-driven.** A report is a `ReportSpec` (`src/lib/report/spec.ts`) that the server validates and runs (`run.ts`). This is how **Ask** should plug in later: natural language produces a `ReportSpec`, and everything downstream is unchanged.

### Design system: what "Liquid Glass" means here
The utilities are all in `src/app/globals.css`. **Reuse them; don't invent new ones.**
- **Surfaces:**
  - `glass`, `glass-strong`, `glass-subtle`: translucent, blurred surfaces with a 1px inner highlight and a soft shadow. Used for cards, nav, menus and controls.
  - `widget`: rounder glass tiles for at-a-glance numbers (metric cards, facility summary).
  - `surface`: **opaque**, for text-heavy lists (Translate, Deadlines), where readability beats blur.
- **Accent:** the Siri gradient `--accent-gradient` runs red → pink → purple → blue. It appears **only** on:
  - active or selected states (`ring-accent`, a gradient hairline);
  - primary buttons (`btn-accent`);
  - focus rings (violet `--ring`);
  - key highlights (`text-accent`);
  - loading (`loading-bar`).

  **Never on large surfaces.**
- **Glow:** `glow` and `glow-soft` set `--extra-glow`, which only takes effect inside the `glass`/`widget`/`surface` shadows. On a bare element it does nothing, so pair it with one of those.
- **Backdrop:** an ambient gradient sits in `body::before`.
- **Themes and fallbacks:**
  - Light and dark each have their own glass, glow and backdrop values; neither is auto-inverted.
  - `prefers-reduced-transparency` and browsers without `backdrop-filter` get opaque surfaces.
  - Reduced motion stops the loading sweep.
- **Charts:**
  - One metric per panel and no dual axes.
  - Thin lines and minimal gridlines.
  - A legend and table view are always present.
  - Hospital series use the validated palette `--series-1..5` (light: #0071e3, #eb6834, #1baf7a, #eda100, #e87ba4; dark: #0a84ff, #d95926, #199e70, #c98500, #d55181).
  - Peer and state medians are gray context lines.
- **Readability first** for a CFO audience: text uses text tokens, never series colors. The iOS-style `Segmented` control is in `src/components/shell/segmented.tsx`.

## 4. Deferred or not built
- **Ask** (natural-language queries): placeholder only. The intended design is NL → `ReportSpec` → the existing Build runner.
- **Watch** (anomaly detection on uploaded data): placeholder only.
- **Case mix** topic (conditions/procedures treated): shown as "coming later" on the home page (`FUTURE_CATEGORIES` in `datasets.ts`). The CMI itself is built (Utilization).
- **Other**: no accounts, saved reports, server-side uploads or database.
- **More HCAI datasets:** Quarterly Financial & Utilization and the complete Annual Disclosure set are planned but not started.

## 5. Deployment state (checked 2026-09-24)
- **GitHub:** https://github.com/domcesca/usc-hcai-insights (public). `main` is pushed and in sync with `origin/main` at `b09ba3a`.
- **Vercel:** the project is connected through the GitHub integration, and pushes to `main` deploy to Production.
  - The latest deployment, for `b09ba3a`, succeeded: https://usc-hcai-insights-ahr9mluhr-dom-2e75.vercel.app.
  - **It is not publicly viewable.** Every `*.vercel.app` URL for the project redirects to Vercel SSO (Deployment Protection is on).
  - The repo's listed homepage, https://usc-hcai-insights.vercel.app, returns **404**, so that domain isn't assigned to the project.
  - **To go public:** turn off Deployment Protection, or assign a production domain, in the Vercel project settings.
- **Local:** `npm run dev` serves http://localhost:3000. No environment variables are needed.

## 6. Next: V3 scope
- **Quality tab:** CMS Care Compare (hospital quality measures) plus CDPH healthcare-associated infection (HAI) data. It would fill the reserved "Quality" topic on the home page.
- **Medicare lens:** a Medicare-specific view on the existing tabs (Benchmark, Build and so on).
- **Community context overlay on Benchmark:** Census ACS demographics plus DHCS Medi-Cal enrollment for the hospital's area.
- **Correlate tab:** cross-dataset correlation analysis, e.g. financial vs. utilization vs. quality vs. community measures.
- **Integration notes for V3:**
  - New sources should follow the ETL pattern above: a dataset class, a dictionary with `category` on each metric, and registration in `store.ts` and `datasets.ts`.
  - Non-HCAI sources need a crosswalk to HCAI facility ids (e.g. CMS CCN ↔ OSHPD id), since the app merges everything by facility id.
  - Correlate should reuse the `ReportSpec`/runner pattern where possible.
  - Keep the design utilities from §3.
