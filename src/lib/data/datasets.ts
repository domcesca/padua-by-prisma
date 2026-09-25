import type { DatasetId, DictionaryMetric, MetricCategory } from "./types"

// Client-safe descriptions of the loaded datasets and metric categories.
// Server code reads the data itself through ./store.ts.

export const DATASETS: Record<
  DatasetId,
  { label: string; shortLabel: string; sourcePage: string; yearNote: string }
> = {
  "hafd-selected": {
    label: "HCAI Hospital Annual Financial Data – Selected File",
    shortLabel: "Financial data",
    sourcePage: "https://data.chhs.ca.gov/dataset/hospital-annual-financial-data-selected-data-pivot-tables",
    yearNote: "Report years: each covers the hospital's fiscal year that ended in that calendar year.",
  },
  hau: {
    label: "HCAI Hospital Annual Utilization Report",
    shortLabel: "Utilization data",
    sourcePage: "https://data.chhs.ca.gov/dataset/hospital-annual-utilization-report",
    yearNote: "Calendar years (January–December).",
  },
}

/** Short URL names for datasets (Translate's ?source=). */
export const DATASET_SLUG: Record<DatasetId, string> = { "hafd-selected": "financial", hau: "utilization" }

export function parseDatasetSlug(value: string | null | undefined): DatasetId {
  return value === "utilization" ? "hau" : "hafd-selected"
}

/** Translate deep link explaining a metric or field. */
export function translateHref(dataset: DatasetId, focus?: { metric?: string; field?: string }, facilityId?: string | null) {
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
    description: "Beds, occupancy, length of stay, ED visits, and surgeries.",
    defaultMetrics: ["occupancy", "edVisits", "alos", "discharges", "ipSurgeries", "opSurgeries"],
  },
]

/** Categories planned for later phases; shown as "coming soon" on the home page. */
export const FUTURE_CATEGORIES = [
  { id: "quality", label: "Quality & outcomes", description: "Readmissions, mortality, and patient safety indicators." },
  { id: "caseMix", label: "Case mix", description: "Case mix index and the conditions hospitals treat." },
] as const

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<MetricCategory, CategoryInfo>

export function parseCategory(value: string | null | undefined): MetricCategory {
  return value === "utilization" ? "utilization" : "financial"
}

/** A benchmarkable metric: its definition plus which dataset it comes from. */
export type MetricDef = DictionaryMetric & { category: MetricCategory; dataset: DatasetId }

/** Metrics plotted as a single number over time (payer mix is a composition). */
export const isTrendMetric = (m: DictionaryMetric) => m.unit !== "share"
