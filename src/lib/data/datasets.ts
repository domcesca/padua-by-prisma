import type { DatasetId, DictionaryMetric, HcaiDatasetId, MetricCategory, PayerLens } from "./types"

// Client-safe descriptions of the loaded datasets and metric categories.
// Server code reads the data itself through ./store.ts.

export const DATASETS: Record<
  DatasetId,
  {
    label: string
    shortLabel: string
    sourcePage: string
    yearNote: string
    /** Tag on a metric card when the chart's topic mostly uses another kind of year. */
    yearTag: string | null
  }
> = {
  "hafd-selected": {
    label: "HCAI Hospital Annual Financial Data – Selected File",
    shortLabel: "Financial data",
    sourcePage: "https://data.chhs.ca.gov/dataset/hospital-annual-financial-data-selected-data-pivot-tables",
    yearNote: "Report years: each covers the hospital's fiscal year that ended in that calendar year.",
    yearTag: "Fiscal years",
  },
  hau: {
    label: "HCAI Hospital Annual Utilization Report",
    shortLabel: "Utilization data",
    sourcePage: "https://data.chhs.ca.gov/dataset/hospital-annual-utilization-report",
    yearNote: "Calendar years (January–December).",
    yearTag: "Calendar years",
  },
  "case-mix-index": {
    label: "HCAI Case Mix Index",
    shortLabel: "Case mix index",
    sourcePage: "https://data.chhs.ca.gov/dataset/case-mix-index",
    yearNote: "Federal fiscal years (October–September), filed under the year they end.",
    yearTag: "Federal fiscal years",
  },
  "cms-care-compare": {
    label: "CMS Care Compare – hospital quality measures",
    shortLabel: "Care Compare",
    sourcePage: "https://data.cms.gov/provider-data/topics/hospitals",
    yearNote: "Filed under the year each measurement period ends; most periods span one to three years.",
    yearTag: null,
  },
  "cdph-hai": {
    label: "CDPH Healthcare-Associated Infections in California Hospitals",
    shortLabel: "Infection data",
    sourcePage: "https://www.cdph.ca.gov/Programs/CHCQ/HAI/Pages/HAIreport.aspx",
    yearNote: "Calendar years (January–December).",
    yearTag: null,
  },
}

export const HCAI_DATASETS: HcaiDatasetId[] = ["hafd-selected", "hau"]
export const isHcaiDataset = (d: DatasetId): d is HcaiDatasetId => d === "hafd-selected" || d === "hau"

/** Short URL names for datasets (Translate's ?source=). */
export const DATASET_SLUG: Record<HcaiDatasetId, string> = { "hafd-selected": "financial", hau: "utilization" }

export function parseDatasetSlug(value: string | null | undefined): HcaiDatasetId {
  return value === "utilization" ? "hau" : "hafd-selected"
}

/** Translate deep link explaining a metric or field (HCAI datasets only). */
export function translateHref(dataset: HcaiDatasetId, focus?: { metric?: string; field?: string }, facilityId?: string | null) {
  const params = new URLSearchParams({ source: DATASET_SLUG[dataset] })
  if (facilityId) params.set("facility", facilityId)
  if (focus?.metric) params.set("metric", focus.metric)
  if (focus?.field) params.set("field", focus.field)
  return `/translate?${params}`
}

export type CategoryInfo = {
  id: MetricCategory
  label: string
  description: string
  /** Metric ids shown by default on Benchmark, in order. */
  defaultMetrics: string[]
}

export const CATEGORIES: CategoryInfo[] = [
  {
    id: "financial",
    label: "Financials",
    description: "Margin, cash, unit cost and revenue, and payer mix.",
    defaultMetrics: ["operatingMargin", "daysCashOnHand", "expensePerAdjDischarge", "revenuePerAdjDischarge"],
  },
  {
    id: "utilization",
    label: "Utilization",
    description: "Beds, occupancy, length of stay, census, case mix, ED visits, and surgeries.",
    defaultMetrics: ["occupancy", "edVisits", "alos", "discharges", "ipSurgeries", "opSurgeries"],
  },
  {
    id: "quality",
    label: "Quality",
    description: "Readmissions, mortality, patient experience, and infections.",
    defaultMetrics: ["overallStar", "hcahpsRating", "readmHf", "mortHf", "clabsiSir", "cdiSir"],
  },
]

/** Categories planned for later phases; shown as "coming soon" on the home page. */
export const FUTURE_CATEGORIES = [
  { id: "caseMix", label: "Case mix", description: "The conditions and procedures hospitals treat. (Case mix index is under Utilization.)" },
] as const

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<MetricCategory, CategoryInfo>

export function parseCategory(value: string | null | undefined): MetricCategory {
  return value === "utilization" || value === "quality" ? value : "financial"
}

/** The dataset whose years a category's charts follow; quality mixes sources and periods. */
export const PRIMARY_DATASET: Record<MetricCategory, DatasetId | null> = {
  financial: "hafd-selected",
  utilization: "hau",
  quality: null,
}

/** A benchmarkable metric: its definition plus which dataset it comes from. */
export type MetricDef = DictionaryMetric & { category: MetricCategory; dataset: DatasetId }

/** Metrics plotted as a single number over time (payer mix is a composition). */
export const isTrendMetric = (m: DictionaryMetric) => m.unit !== "share"

// -- unit view (utilization narrowed to one bed classification) ---------------------

/** Utilization metrics HCAI reports by bed classification, in picker order, with their unit-level names. */
export const UNIT_METRIC_LABELS: Record<string, string> = {
  occupancy: "Occupancy rate",
  adc: "Average daily census",
  alos: "Average length of stay",
  discharges: "Discharges",
  inpatientDays: "Patient days",
  licensedBeds: "Licensed beds",
}
export const UNIT_METRICS = Object.keys(UNIT_METRIC_LABELS)
export const UNIT_DEFAULT_METRICS = ["occupancy", "adc", "alos", "discharges"]

/** Only utilization has unit-level data; financial and quality data are hospital-wide. */
export const supportsUnits = (category: MetricCategory) => category === "utilization"

// -- payer view (Benchmark's Medicare lens) --------------------------------------

/** "all" = every payer (the default); otherwise a payer lens metrics can be narrowed to. */
export type PayerView = "all" | PayerLens

export const PAYER_VIEWS: { value: PayerView; label: string; description: string }[] = [
  { value: "all", label: "All payers", description: "Every payer combined." },
  {
    value: "medicare",
    label: "Medicare",
    description:
      "Traditional Medicare plus Medicare Advantage, from the Medicare columns of the hospital's HCAI financial report (fiscal years).",
  },
]

export function parsePayerView(value: string | null | undefined): PayerView {
  return value === "medicare" ? "medicare" : "all"
}

/**
 * Metrics offered in Benchmark's pickers for a category: all-payer metrics plus, under a
 * lens, that lens's extras. Companions (an SIR's raw rate) ride on their metric's card.
 */
export function pickableMetrics(catalog: MetricDef[], category: MetricCategory, payer: PayerView) {
  return catalog.filter(
    (m) =>
      m.category === category &&
      m.unit !== "share" &&
      !m.companionOf &&
      (!m.lens || (m.lens === payer && !m.allPayer))
  )
}

/**
 * The metric actually shown for each chosen id under a payer view: an all-payer
 * metric becomes its lens version when one exists and otherwise stays as is
 * (the UI marks it "All payers"). Lens-only metrics drop out of the all-payer view.
 */
export function applyPayerView(ids: string[], payer: PayerView, catalog: MetricDef[]): string[] {
  const out: string[] = []
  for (const id of ids) {
    const metric = catalog.find((m) => m.id === id)
    if (!metric) continue
    let shown: string | undefined = id
    if (payer === "all") shown = metric.lens ? metric.allPayer : id
    else if (!metric.lens) shown = catalog.find((m) => m.lens === payer && m.allPayer === id)?.id ?? id
    else if (metric.lens !== payer) shown = metric.allPayer
    if (shown && !out.includes(shown)) out.push(shown)
  }
  return out
}
