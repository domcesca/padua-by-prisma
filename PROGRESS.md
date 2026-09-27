# PROGRESS — handoff for the next session

_Last updated 2026-09-25, V6.2 (see §2 V6.0–V6.2). Read this first, then `README.md` (run/refresh/deploy commands) and `AGENTS.md` (this is Next.js 16 — check `node_modules/next/dist/docs/` before writing Next code)._

## 1. Project overview

**Padua by Prisma** ("Padua" in the nav; formerly "HCAI Insights"; GitHub repo `domcesca/padua-by-prisma`, formerly `usc-hcai-insights`) is a web app from Prisma Executive, an independent consulting firm (not HCAI-, agency-, or university-affiliated), for California hospital administrators and finance leaders (CFO-level readers). It turns HCAI's public hospital financial and utilization files into peer benchmarks, a chart/table builder, a plain-language field guide, a business-case builder (Propose), and a filing calendar. There are no accounts, no database and no API keys. All data is public HCAI open data, pre-processed by a Python ETL into committed JSON.

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

### V5 (UI polish and onboarding; no new data)
1. **Home:** the "Or try" suggested-hospital chips under the hospital search are gone (Benchmark's empty state still
   offers its own starting points; the spec only named the home page).
2. **One picker for long lists:** `GroupedPicker` / `PickerPill` (`src/components/shell/grouped-picker.tsx`) — search
   plus groups collapsed until opened; searching lists every match, label matches first (it also matches metric
   summaries). Up to 4 choices show as removable chips, more become a collapsed "Chosen" group. Options come from
   `metricPickerOptions` (`src/lib/data/metric-options.ts`): category · Medicare · quality sub-heading across
   categories, sub-heading only within one. Applied to Build's metrics (was a wall of ~60 chips), Benchmark's Metrics,
   Unit, and County pills, Correlate's two axes, and Home's Refine metrics. Home's step-3 unit chips stay chips (a
   hospital has a handful of units). Filtering and ranking are done in React (`shouldFilter={false}`); cmdk's own
   sorting reorders DOM nodes and fought the collapsible rendering.
3. **Glossary:** floating "?" (`src/components/shell/help-panel.tsx`, mounted in the root layout; also the `?` key).
   Data from `/api/glossary` → `src/lib/glossary.ts`, which builds entries from each dataset's `dictionary.json` via
   `getDictionary` — the same files Translate and the metric catalog read, so no refactor was needed and nothing is
   duplicated. 576 entries (62 metrics, 514 fields; quality/CMI metrics included), ~240 KB, fetched on first open.
   Financial and utilization entries link to their Translate entry. Explicitly a lookup: no NL, no LLM.
4. **Tour:** `src/components/shell/tour.tsx`, five steps on the home page (hospital → topic → Compare → Correlate nav →
   help button), anchored on `data-tour` attributes. Auto-plays once (localStorage `hcai-tour-v1`; skip, close, Esc,
   finishing, or navigating away all mark it done). "Take the tour" in the help panel replays it (from another page it
   goes home first via a sessionStorage flag). Steps whose target isn't visible are skipped.

Checked: typecheck, lint, `next build`; Playwright runs at 1280px and 375px in light and dark over every changed picker,
the glossary (search, expand, deep link, `?` key), and the tour (autoplay, all steps, skip, Esc, no replay on reload,
replay from another page). No horizontal overflow at 375px.

Cloud sessions need data.cms.gov, data.chhs.ca.gov and api.census.gov allowed (the user added them); CHHS
downloads redirect to s3.amazonaws.com, which was reachable. calhospital.org and aha.org were not.

### V6.0 (Propose: proposal builder, core engine + two modules)
- **Data (step 1):** two new ETL datasets.
  - `cms-ipps`: FY 2027 IPPS Final Rule (effective 2026-10-01). Table 5 → `drgs.json` (766 MS-DRGs; 998/999 have no
    weight and are dropped), weight = "Weights - 10% Cap Applied". Tables 1A–1E → manifest: national operating
    standardized amount $6,848.98 (1A: $4,520.33 labor + $2,328.65 non-labor, "submitted quality data and meaningful
    EHR user", update 2.3%; 1B splits the same total), capital rate $540.03 (not used in the estimate; mentioned).
  - `cms-inpatient`: Medicare Inpatient Hospitals by Provider and Service, data year 2024 → `cases.json`
    (hospital → year → DRG → Original Medicare discharges). 271 of 272 California IPPS CCNs matched. The CCN matcher
    moved from `cms_care_compare.py` into `crosswalk.match_ccns` (re-ran Care Compare: metrics.json byte-identical).
  - www.cms.gov was blocked in the cloud environment at first; the user allowed it.
- **Engine (step 2):** `src/lib/propose/engine.ts`. Cash view (year 0 outlay, full benefit − maintenance each year,
  no ramp-up) for payback / cumulative / ROI / NPV; straight-line amortization shown as the accounting view. NPV
  was cheap, so it's in (discount rate input, default 5%).
- **Modules (steps 3–4):** `ProposalModule` contract (`src/lib/propose/module.ts`), registry in
  `src/components/propose/modules/index.ts`, server data via `MODULE_DATA` in `src/lib/propose/module-data.ts` and
  `/api/propose/[module]`. Reimbursement: `GroupedPicker` over 766 DRGs grouped by MDC (up to 20), per-DRG added
  cases or % of the hospital's 2024 Medicare cases, peer median as context (step 7), optional cost-of-care %. That defaults to 0 on purpose (user's call): a "typical" ratio
  varies too much by service line to be a defensible default, so the page labels the result as revenue, not margin.
  Custom: up to 20 lines, quantity × rate or flat.
- **Scenarios, results, print (steps 5–6):** three scenario cards side by side (0.7× / 1× / 1.3× benefit; clicking one
  or the segmented control picks the highlighted line and the year-by-year table), cumulative chart, "What went in",
  caveats. Browser print-to-PDF with print CSS (light palette even from dark mode; chrome, inputs, and controls hidden).
- **Persistence:** user agreed to URL state (session-only plus a shareable link). Every module's inputs are in the URL.
- **Nav (step 8):** Propose (Calculator icon) after Correlate; carries the remembered hospital. On phones, Deadlines
  left the tab bar (`desktopOnly` in `nav.ts`; user's call) so it stays at six tabs; it's still in the desktop sidebar
  and linked from the home page.
- Checked: typecheck, lint, `next build`; Playwright at 1280 and 375, light and dark; reload restores the proposal;
  PDF output reviewed. No horizontal overflow at 375px.
- **Deferred to V6.5:** two more modules, slider sensitivity. Not done: hospital-specific payment (wage index,
  DSH/IME), ramp-up years, payer mix.

### V6.1 (plain-language DRG search; findability only, no calculation changes)
- **Body system browse:** Table 5's MDC is present for 760 of 766 DRGs (981–989, "procedures unrelated to principal
  diagnosis", have none by CMS design and are grouped as such). A "Body system" `FilterPill` next to "Add DRGs" narrows
  the picker to one MDC (with counts); search still works inside it. Local UI state, not in the URL.
- **Search terms:** `src/lib/propose/drg-search-terms.ts` (now `search-terms.ts`), 85 entries / 342 terms covering neuro, cardiac, vascular,
  ortho/spine, oncology, GI, respiratory, imaging/interventional, robotic surgery, sepsis/critical care, plus kidney,
  urology, women's, behavioral, trauma, transplant. 479 of 766 DRGs carry at least one term. `drgs` (direct) vs
  `related` (touched) decides ranking; e.g. "tavr" puts 266–267 above open valve surgery 216–221.
  `drgTerms` in `module-data.ts` resolves codes/ranges against the live table, logging unknown codes and ranges that
  span MDCs (that check caught two of my own range mistakes: 447–451 swept in 449, 820–850 swept in 831–833).
- **Imaging:** scans aren't DRGs (outpatient APCs). "Imaging and interventional" maps interventional/hybrid-OR terms;
  `DRG_SEARCH_NOTES` answers MRI/CT/PET/outpatient searches with an explanation and a pointer to Custom.
- **Shared picker:** `PickerOption` gained optional `tags` / `leadTags` (searchable; a tag match shows "Matches
  “aneurysm”" and ranks under label matches, lead tags above other tags) and `GroupedPicker` an `emptyText`. Metric
  pickers set neither, so their ranking is unchanged (Build "stay" checked). Labels wrap to two lines instead of
  truncating, for long DRG titles on phones.
- Also fixed: a blank proposal showed payback "Immediate" (0 cost, 0 benefit); it shows "—" until something is entered.

### V6.2 (editable scenario rates; rebrand to Padua by Prisma)
- **Scenario rates:** Conservative / Expected / Optimistic are now editable percents (default 70 / 100 / 130) above the
  scenario cards; the engine applies them exactly as the old fixed multipliers (`projectAll(benefit, costs, rates)`).
  In the URL as `scen=` only when changed. Conservative > Optimistic shows a soft note, no validation beyond that.
  Cards show the rate ("Conservative · 70%"); "What went in" lists the rates; its benefit heading now says "estimate,
  before scenario rates" (the Expected rate can differ from 100%).
- **Rebrand:** "HCAI Insights" → "Padua" (nav wordmark, mobile header) / "Padua by Prisma" (page title template,
  Open Graph site name, nav subline, home eyebrow, proposal print header). Name constants in `src/lib/brand.ts`.
  Data sourcing and disclosure copy unchanged. `package.json` (and lockfile) name → `padua`; ETL user agent →
  `padua-etl`. Kept on purpose: `etl/hcai_etl`, storage keys `hcai-selection-v1` / `hcai-tour-v1` (data-named; renaming
  resets viewers' saved hospital and replays the tour).
- **Logo:** `PaduaMark` (stroke thickens at small sizes) in the sidebar (30px), mobile header (22px), and proposal print
  header. Favicons generated from it: `src/app/icon.svg` (light/dark aware), `favicon.ico`, `apple-icon.png` (the old
  Next.js default favicon is gone).
- **Placeholder to confirm:** the attribution line at the foot of the home page (`APP_ATTRIBUTION`). No copyright text.
- **Outside this repo (for the owner):** the GitHub repo is now `domcesca/padua-by-prisma` (renamed by the owner; old
  URLs redirect). Still to do there: the Vercel project name and its `usc-hcai-insights*.vercel.app` URLs, and the
  repo's listed homepage. Nothing in the code depends on them.

### V6.5 (Propose: Cost savings and Avoided penalties modules)
- **Cost savings** (`savings`): staff time (hours a week × loaded hourly cost × 52), shorter stays (patient days avoided ×
  cost of a day), supplies/other (flat). No per-diem existed in the app; the cost of a day is derived per hospital from
  HCAI fields already in `hafd-selected/fields.json` (TOT_OP_EXP ÷ (DAY_TOT × GR_PT_REV ÷ GR_IP_TOT)), latest year, with
  the Benchmark peer median. Owner's call: pre-fill the average with a marginal-cost caution, no assumed "savable share".
  Not pre-filled when >10% of days are long-term care (76 hospitals are above 20%; e.g. Alameda Hospital $1,658 vs a
  $7,295 peer median).
- **Avoided penalties** (`penalty`): new `cms-penalties` ETL (see README). Checked the Quality tab's sources first: Care Compare's
  readmission rates are the public-reporting versions (a different period and cohort from the HRRP measures), and CDPH's
  HAI data is California's own reporting with no national scoring or cutoff, so neither can drive CMS's penalty math.
  The pipeline pattern (PDC download, `match_ccns`) is reused; the data is CMS's program files. Checks: the HRRP formula reproduces all 2,946 published
  FY 2026 penalties (to rounding); recovered HAC parameters reproduce every z-score and Total HAC Score and every
  California hospital's penalty flag. Owner's calls: (1) lag handled by averaging the phased-in benefit over the useful
  life (no engine change; `benefit` and the editor context now receive `life`); (2) HAC all-or-nothing with distance to
  the cutoff; the cutoff is last year's and moves.
- **Data currency:** as of 2026-09-25 the newest complete sets are FY 2026 for both programs. FY 2027 HRRP components
  (supplemental file, Table 15) aren't on the FY 2027 final rule page yet; FY 2027 HAC results post in early 2027. The
  FY 2027 Impact File's "proxy" readmission factor is just the FY 2026 factor, so it isn't used. Re-run `cms-penalties`
  when they post; it picks the Provider Data Catalog's fiscal year and that year's supplemental file.
- **Refactor:** `cms_ipps.parse_table1` is shared and also returns Table 1B's labor split (wage index ≤ 1); `cms-ipps`
  output is unchanged.

### V6.6 (Propose: Outpatient reimbursement module)
- **Licensing finding (owner's decision):** OPPS Addendum B and the PFS RVU files carry AMA CPT content, licensed only
  for internal, non-commercial use with no redistribution or derivative works: incompatible with a public app. Owner
  chose a license-free build at the APC level, and approved taking Addendum A (CMS's APC table, no CPT) through CMS's
  click-through, APC fields only. The ETL refuses the file if it ever carries CPT-like content. Addendum B is never
  downloaded; physician payments are the proposer's figures. Code-level CPT search needs an AMA distribution license.
- **Module:** a separate `outpatient` module (less disruptive than a mode inside the DRG module, whose state and URL
  keys stay as they were); the DRG module is relabeled "Inpatient reimbursement" (id unchanged, links still work).
  Module cards go 3 across on wide screens. "Whose revenue counts": Hospital only (default) / Hospital + physician /
  Physician only, with the effect spelled out in the editor and the notes.
- **Search terms:** `drg-search-terms.ts` → `search-terms.ts`; entries can carry `apcs` / `relatedApcs` alongside
  `drgs` / `related`, matched by one shared function (`codeTerms`). ~45 outpatient entries (visits/ED, imaging,
  diagnostics, oncology/infusion, procedures, wound care, rehab, behavioral health) plus notes for searches that aren't
  APC-paid (mammography, lab, therapy: fee schedules) and for "cpt".
- **Baseline:** comprehensive APCs only (72), 2024; 22 hospitals have every count suppressed and show "fewer than 11".
  No per-hospital baseline for imaging/ED/clinic APCs or for professional services (published per clinician only).

### UI touch-ups (after V6.6)
- **Benchmark spacing:** the loading bar between the filters and the hospital card had `-my-3`, which cancelled the
  24px section gap (leaving ~2px). It's now absolutely positioned inside the filter block, so the gap is back.
- **Nav lockup:** "Padua" with "by Prisma" small, medium weight, in the accent color on the same line, and the tagline "Healthcare Data,
  Decoded" below in muted text (not the accent). Phone header: "Padua by Prisma" on one line, no tagline (no room).
  `APP_TAGLINE` is the new tagline; the home page eyebrow keeps its descriptive line as `APP_SUMMARY`.

### V6.7 (Propose: smart intake and printout customization; presentation and input flow only)
- **Intake:** free-text description → suggested module, reusing `search-terms.ts` (new intent entries with `modules`).
  Confidence rule: score ≥ 1 and ≥ 1.5× the runner-up; else no suggestion and the picker stays open. Intent entries
  count double over clinical words ("readmission … heart failure" → avoided penalties). Ambiguous descriptions ("robotic
  surgery": inpatient and outpatient both) deliberately get no suggestion. Manual picks stick (`pick=manual`); older
  links with a module but no description count as manual.
- **Printout (owner's call):** the existing export had every section, so **Finance committee = today's printout** and
  **Board summary = condensed** (no year-by-year table; a short key-assumptions box instead of the full list). Legacy
  links open as Finance; new proposals start on Board. Sections toggle and reorder for print only (CSS `order` in a
  print-only flex column); disclosures can't be turned off.

### V6.8 (Propose: Advanced mode)
- Payer mix (reimbursement modules), ramp-up (all modules; penalties keep CMS timing but it can be moved), escalation
  (benefit and running costs). Off by default and inert at defaults.
- **Engine:** one additive change, optional per-year benefit/cost factors, needed for ramp-up and escalation. Default
  path verified identical to the old engine on 1.2M randomized comparisons (worst difference 7.5e-11, float order).
  Payback generalized to "after the last year cumulative cash is negative", which equals the old rule for flat years.
- **Not split:** the ramp generalization didn't need the penalty logic reworked. Penalties keep their own phase-in
  (averaged, as approved in V6.5); Advanced only lets the proposer move its years.
- **Verified:** rendered results match `main` for all five modules with Advanced off, including links holding advanced
  settings; payer mix, ramp, escalation, and penalty timing checked numerically.

### V6.9 (navigation and help; no calculation, data, or disclosure changes)
- Build and Correlate merged under a Build landing page (`/build` → `/build/report`, `/build/correlate`), with
  redirects for old URLs. Phone tab bar is now Home, Benchmark, Build, Propose, Translate.
- "About this tool" on every tab (Home, Benchmark, Build, report builder, Correlate, Propose, Translate, Deadlines).
  The spec's "Quality" tab is Benchmark's Quality view, covered in Benchmark's panel. Named "About this tool" (not a
  second "?") because the floating "?" is already the glossary.
- Welcome tour trimmed from five steps (topic, compare, Correlate, glossary) to three; the storage key is unchanged, so
  people who finished it aren't shown it again.
- Propose and Correlate walkthroughs, on demand. Correlate reports r, ρ, r², and a small-sample warning but no p-value,
  so its walkthrough explains strength, sample size, outliers, and association vs cause without adding a significance
  test.

### V6.10 (Advanced mode expansion; Standard mode unchanged)
- Six independently switched Advanced options: wage index (inpatient/outpatient), break-even volume, sensitivity
  tornado, staff time by role (Cost savings), lost readmission revenue and readmission dampening (Avoided penalties).
- New ETL `cms-wage-index`: FY 2027 IPPS Table 2 (checked against the Impact File for all 3,074 hospitals) and the
  CY 2026 OPPS Hospital Impact File. California: 275 hospitals with an IPPS index, 298 with an OPPS index (LTC, rehab,
  and psych hospitals bill OPPS but not IPPS).
- Wage index source confirmed before building: Table 2's with-cap column already includes out-migration and the 5% cap
  (Impact File's variable description); OPPS uses the final FY IPPS index (CMS's impact-file layout, column F).
- The Federal Register was unreachable from the build environment, so OPPS's 60% labor share is a documented constant.
- Break-even and sensitivity reuse one model function (`analysis.ts`), which the page now uses for its results too.
- The Propose walkthrough is unchanged: its targets didn't move.
- Part B, closed/outdated hospital flag: the "Licensed Healthcare Facility Listing" (published by HCAI, keyed by OSHPD
  ID) has a status (Open / Suspense / Closed) and status date but no closure date, and a closed hospital usually drops
  off rather than staying as Closed. Of 467 app hospitals, 14 are off the current listing and 4 are in Suspense.
  Closure is claimed only with Suspense/Closed evidence (6 hospitals, including the Feather River test case, dated
  2019-09-30); 10 that dropped off while Open are staleness-only, because several are new license numbers, not closures.
  Outdated = newest report more than 2 years behind the newest data (13 hospitals, some of them campuses now reported
  under a parent).

### V7.0 (Opportunity Finder and administrator front door)
- Key findings engine (`src/lib/findings/`), `/api/findings`, Home's "Where to look first", Benchmark's Key findings
  panel with methodology drawer and "Related signal" links on metric cards, and `/briefing` (browser-local pins with
  a pinned-vs-now comparison). Details in the README. No existing metric, calculation or data changed; the engine
  reads Benchmark's metric series and Propose's penalty data.
- Decisions (confirmed): workforce/capacity left out; weights 1.0 / 0.8 / 0.6; occupancy never judged; at most 2
  primary per signal type; penalty prefills = gap to peer median ("a starting point, not a target"), cost savings
  with no amounts; primary minimum 20 from calibration; Home shows the top 3; briefing is its own page; no strengths.
  One finding per family: multi-condition readmission penalties are one Readmissions finding.
- Calibration (451 active hospitals, default Similar peers, no minimum): 1,493 findings; 411 hospitals have at least
  one, 40 none; median 3 per hospital, max 8. Score quartiles 18.8 / 31.5 / 45.6, 90th percentile 67.1. Confidence:
  540 High, 682 Medium, 271 Low. At a minimum of 20: 53 of 411 hospitals get no primary finding (median 2 primary).
  With 8 families the 5 + 5 cap never overflows yet. Every HAC-penalized hospital (75) leads at 90 (binary penalty at
  full severity). 276 of 451 Similar peer groups have 5–9 hospitals, the main reason findings are Medium.

### V6.13 (Shared vocabulary: favorability, freshness, visual polish)
- Favorability labels, direction words, status lines, terminology, contrast, loading/empty states, mobile summary bar
  and sheet, and focus/announcement fixes across Benchmark, Build, Correlate, Propose, Translate, and Deadlines. Details
  in the README. No data or calculation changes: 136/136 API responses (Benchmark, Specialty, Propose, Build,
  Correlate, Translate fields) identical to V6.12 apart from the new status metadata.
- Decisions to confirm: (1) Favorable/Unfavorable = outside the peer middle 50% (25th–75th percentile), matching the
  chart band; (2) directions come from the ETL dictionaries unchanged (context for volumes, LOS, occupancy, CMI, payer
  mix; revenue per adjusted discharge stays higher-is-better as the dictionary has it); (3) "provisional" is driven by
  a source marking a year preliminary (none loaded today), kept separate from HCAI's audit status, which shows as
  "Unaudited (HCAI audit in process)"; (4) "matched record" = CMS reports the hospital under another's CCN, or its CCN
  was matched by ZIP and name; (5) Build's step-by-step form stays a form on small screens (only filter strips fold
  into the sheet).

### V6.12 (Service lines)
- Benchmark → Utilization's unit picker ("Unit or service line") adds "All service lines, side by side" and the four
  combined lines; single classifications are still there. Config in `src/lib/service-lines/lines.ts`; computed on
  request from `hau/fields.json` (no ETL change). Details in the README.
- Verified: all 2,645 hospital-years reconcile to HCAI's hospital totals; 9,859 classification rows match the unit
  view exactly (after mirroring Python's rounding); 104/104 existing Benchmark, Specialty, and Propose API responses
  are identical to main apart from the new fields.
- Found in the data: (1) ~475 classification-years with beds but blank days or discharges, counted as none in a
  combined line (as HCAI's totals do) and flagged; (2) 107 hospital-years where a classification has activity but no
  Dec 31 beds (closed mid-year), included so lines add up; (3) children's hospitals report PICU beds as Intensive
  Care, so the line was renamed from "Adult Critical Care" to "Critical Care (ICU, CCU, Respiratory)"
  (id `criticalCare`) on review. Blanks counted as none (flagged) and mid-year closures kept: confirmed on review.

### V6.11 (Specialty-level benchmarking: Medicare cases by MDC)
- Benchmark → Utilization gains a "Medicare specialty" picker: all MDCs vs peers, or one MDC ranked across peers with
  the hospital's DRGs, plus up to 4 hospitals side by side. Other Benchmark views unchanged: 60/60 identical API
  responses (Benchmark and Propose) vs main, and page text differs only by the new picker.
- Aggregates the existing CMS inpatient baseline; the MDC for each DRG is CMS's Table 5. Found in the data: 13 DRGs in
  the 2024 cases were retired after FY 2024–2026, so the current Table 5 alone would have dropped 5,821 cases (mostly
  spinal fusion). `cms-inpatient` now reads Table 5 for FY 2024–2027 (FY 2024 isn't linked from CMS's IPPS page any
  more; found at CMS's usual file name). MDCs agree across all four versions for every DRG in the data. Retired DRGs
  are priced at their last published weight (flagged per DRG and in the notes).
- Suppression: an MDC with no DRG at 11+ shows "fewer than 11 in each DRG", not "fewer than 11", because several
  suppressed DRGs can add up to more than 10. Counts are floors, and the notes say so.
- Home page: the "Case mix" tile is now "Case mix by specialty", still marked "All payers: coming later", with a
  link to the Medicare specialty view ("Available now: Medicare only").
- Service-line bundling (built in V6.12): mapping decided. Maternity & Newborn = Perinatal +
  NICU, with the well-baby nursery (report line 35) as its own row outside the totals; Critical Care (was "Adult Critical Care") = ICU +
  Coronary Care + Acute Respiratory; Burn standalone; Pediatrics standalone; Behavioral Health = Acute Psychiatric +
  Chemical Dependency Recovery; Long-Term Care = SNF + ICF + ICF/DD; Medical/Surgical and Rehabilitation standalone.
  Every bed category is in exactly one line, so lines add up to total licensed beds.

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
- **Ask** (natural-language queries): placeholder only, deferred past V5. The intended design is NL → `ReportSpec` → the existing Build runner.
- **Watch** (anomaly detection on uploaded data): placeholder only.
- **Case mix** topic (conditions/procedures treated): shown as "coming later" on the home page (`FUTURE_CATEGORIES` in `datasets.ts`). The CMI itself is built (Utilization).
- **Other**: no accounts, saved reports, server-side uploads or database (the V7.0 briefing is browser-local).
- **Opportunity Finder follow-ups**: workforce metrics (HCAI staffing fields, pending definitions and directions), a strengths companion, peer-fit signal (V7.1), tool-level findings (V7.2), more Propose handoffs (V7.3).
- **More HCAI datasets:** Quarterly Financial & Utilization and the complete Annual Disclosure set are planned but not started.

## 5. Deployment state (checked 2026-09-24)
- **GitHub:** https://github.com/domcesca/padua-by-prisma (public; renamed from `usc-hcai-insights` in V6.2, old URLs redirect). `main` is pushed and in sync with `origin/main` at `b09ba3a`.
- **Vercel:** the project is connected through the GitHub integration, and pushes to `main` deploy to Production.
  - The latest deployment, for `b09ba3a`, succeeded: https://usc-hcai-insights-ahr9mluhr-dom-2e75.vercel.app.
  - **It is not publicly viewable.** Every `*.vercel.app` URL for the project redirects to Vercel SSO (Deployment Protection is on).
  - The repo's listed homepage, https://usc-hcai-insights.vercel.app, returns **404**, so that domain isn't assigned to the project.
  - **To go public:** turn off Deployment Protection, or assign a production domain, in the Vercel project settings.
- **Local:** `npm run dev` serves http://localhost:3000. No environment variables are needed.

## 6. Original V3 scope (done; kept for context)
- **Quality tab:** CMS Care Compare (hospital quality measures) plus CDPH healthcare-associated infection (HAI) data. It would fill the reserved "Quality" topic on the home page.
- **Medicare lens:** a Medicare-specific view on the existing tabs (Benchmark, Build and so on).
- **Community context overlay on Benchmark:** Census ACS demographics plus DHCS Medi-Cal enrollment for the hospital's area.
- **Correlate tab:** cross-dataset correlation analysis, e.g. financial vs. utilization vs. quality vs. community measures.
- **Integration notes for V3:**
  - New sources should follow the ETL pattern above: a dataset class, a dictionary with `category` on each metric, and registration in `store.ts` and `datasets.ts`.
  - Non-HCAI sources need a crosswalk to HCAI facility ids (e.g. CMS CCN ↔ OSHPD id), since the app merges everything by facility id.
  - Correlate should reuse the `ReportSpec`/runner pattern where possible.
  - Keep the design utilities from §3.
