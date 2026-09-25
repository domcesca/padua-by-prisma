// Shapes of the processed files written by the Python ETL (etl/hcai_etl).
// Keep in sync with etl/hcai_etl/datasets/{hafd_selected,hau}.py.

/** Output folder / id of each ETL dataset under data/processed. */
export type DatasetId = "hafd-selected" | "hau"

/** What the user picks on the home page; each metric belongs to one. */
export type MetricCategory = "financial" | "utilization"

export type Ownership = "nonprofit" | "investor" | "district" | "government" | "state" | "other"

/** data/processed/hafd-selected/facilities.json */
export type FinancialFacility = {
  id: string
  name: string
  hcaiName: string
  formerNames: string[]
  county: string | null
  city: string | null
  owner: string | null
  ownership: Ownership
  typeOfCare: string | null
  hospitalType: string | null
  teaching: boolean
  rural: boolean
  traumaLevel: number | null
  licensedBeds: number | null
  fiscalYearEnd: string | null
  years: number[]
}

/** data/processed/hau/facilities.json */
export type UtilizationFacility = {
  id: string
  name: string
  hcaiName: string
  formerNames: string[]
  county: string | null
  city: string | null
  zip: string | null
  latitude: number | null
  longitude: number | null
  parentOrganization: string | null
  ownership: Ownership
  licenseCategory: string | null
  principalService: string | null
  teaching: boolean
  rural: boolean
  traumaLevel: number | null
  edLevel: string | null
  licensedBeds: number | null
  /** Other campuses on this hospital's license, rolled into its numbers. */
  campuses: string[]
  years: number[]
}

/**
 * One hospital across every dataset (joined on HCAI facility number), built by
 * src/lib/data/store.ts. Financial attributes win where both datasets have one.
 */
export type Facility = FinancialFacility & {
  zip: string | null
  latitude: number | null
  longitude: number | null
  licenseCategory: string | null
  edLevel: string | null
  campuses: string[]
  /** Report years with financial data (same as `years`). */
  financialYears: number[]
  /** Calendar years with utilization data. */
  utilizationYears: number[]
}

export type PayerGroup = "medicare" | "medical" | "commercial" | "indigent" | "other"
export type PayerMix = Record<PayerGroup, number>

export type FacilityYearMetrics = {
  operatingMargin: number | null
  daysCashOnHand: number | null
  occupancy: number | null
  edVisits: number | null
  netPatientRevenue: number | null
  totalOperatingExpense: number | null
  discharges: number | null
  licensedBeds: number | null
  alos: number | null
  payerMixRevenue: PayerMix | null
  payerMixDays: PayerMix | null
  days: number
  annualized: boolean
  status: string | null
}

/** Any dataset's metrics row: metric key -> value, plus coverage flags. */
export type MetricsRow = Record<string, unknown> & { days: number; annualized: boolean; status: string | null }

/** facilityId -> year -> metrics */
export type MetricsFile<Row = MetricsRow> = Record<string, Record<string, Row>>

export type FieldYearMeta = {
  days: number
  reports: number
  annualized: boolean
  status: string | null
  begin: string | null
  end: string | null
  /** Utilization only: other campuses combined into this facility-year. */
  campuses?: string[]
}

export type FieldsFile = {
  fields: string[]
  meta: Record<string, Record<string, FieldYearMeta>>
  values: Record<string, Record<string, (number | null)[]>>
}

export type FieldUnit =
  | "usd"
  | "count"
  | "days"
  | "hours"
  | "pct"
  | "beds"
  | "fte"
  | "minutes"
  | "text"
  | "date"
  | "code"

export type DictionarySection = {
  id: string
  title: string
  summary: string
  drivers: string[]
  caution?: string
}

export type DictionaryField = {
  code: string
  section: string
  hcaiLabel: string
  label: string
  summary: string
  unit: FieldUnit
  drivers?: string[]
  caution?: string
  payer?: string
}

export type MetricUnit = "ratio" | "days" | "pct" | "count" | "share" | "usd"

export type DictionaryMetric = {
  id: string
  /** null: documented in Translate but not offered as a benchmark metric. */
  category: MetricCategory | null
  label: string
  unit: MetricUnit
  /** Decimal places for display (default 0 for counts/days). */
  decimals?: number
  summary: string
  formula: string
  inputs: string[]
  higherIsBetter: boolean | null
  drivers: string[]
  caution?: string
  /** Set on a payer-specific version of a metric (the Benchmark "Payer view"). */
  lens?: PayerLens
  /** The all-payer metric this one stands in for under its lens, if any. */
  allPayer?: string
  /** Modeled rather than reported (e.g. Medicare cost allocated from charges); flagged in the UI. */
  estimate?: boolean
}

/** Payer views a metric can be narrowed to. */
export type PayerLens = "medicare"

export type Dictionary = {
  dataset: DatasetId
  source: string
  sections: DictionarySection[]
  fields: DictionaryField[]
  metrics: DictionaryMetric[]
  payerGroups: { id: PayerGroup; label: string; includes: string[] }[]
}

export type Manifest = {
  id: DatasetId
  title: string
  sourcePage: string
  years: number[]
  sources: { year: number; name: string; url: string; preliminary?: boolean }[]
  generatedAt: string
  notes: string[]
}
