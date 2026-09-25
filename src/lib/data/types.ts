// Shapes of the processed files written by the Python ETL (etl/hcai_etl).
// Keep in sync with etl/hcai_etl/datasets/{hafd_selected,hau}.py.

/** HCAI's own datasets: facility directories and raw fields (Translate) come from these. */
export type HcaiDatasetId = "hafd-selected" | "hau"

/** Output folder / id of each ETL dataset under data/processed. The non-HCAI ones map onto HCAI facility numbers. */
export type DatasetId = HcaiDatasetId | "case-mix-index" | "cdph-hai" | "cms-care-compare"

/** What the user picks on the home page; each metric belongs to one. */
export type MetricCategory = "financial" | "utilization" | "quality"

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

/** Context for one published value (quality data): its period, significance, and caveats. */
export type PointDetail = {
  /** Measurement period, e.g. "Jul 2022–Jun 2025", when it isn't the calendar year. */
  period?: string
  /** Statistically better / no different / worse than the metric's comparison point (see comparedTo). */
  compared?: "better" | "same" | "worse"
  /** 95% confidence interval. */
  ci?: [number, number]
  /** Cases or surveys behind the value. */
  n?: number
  observed?: number
  predicted?: number
  /** Why the value is missing or should be read with care (source footnotes, partial years). */
  note?: string
}

/** Any dataset's metrics row: metric key -> value, plus coverage flags. */
export type MetricsRow = Record<string, unknown> & {
  days?: number
  annualized: boolean
  status: string | null
  /** Quality datasets: per-metric detail. */
  detail?: Record<string, PointDetail>
}

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

/** number: a plain decimal (SIRs, rates, minutes, stars); unitLabel says what it counts. */
export type MetricUnit = "ratio" | "days" | "pct" | "count" | "share" | "usd" | "number"

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
  /** Sub-heading within a category (quality: Readmissions, Infections, ...). */
  group?: string
  /** Unit wording for "number" metrics, e.g. "per 1,000 central-line days". */
  unitLabel?: string
  /** A value worth a reference line, e.g. 1 for ratios to expected (SIR, PSI 90). */
  reference?: number
  /** What `PointDetail.compared` is relative to, e.g. "the national rate". */
  comparedTo?: string
  /** A metric shown alongside this one on the same card (an infection SIR's raw rate). */
  companion?: string
  /** Set on a companion: the metric whose card it appears on. */
  companionOf?: string
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
  sources: { year?: number; name: string; url: string; preliminary?: boolean }[]
  generatedAt: string
  notes: string[]
  /** Care Compare: the usual measurement period per metric and year. */
  periods?: Record<string, Record<string, string>>
  /** Care Compare: hospitals CMS reports together with another under one CCN. */
  sharedReporting?: Record<string, { ccn: string; reportedWith: string; reportedWithName: string }>
}

// -- county context (data/processed/{dhcs-medi-cal,acs-county}) ------------------

/** data/processed/dhcs-medi-cal/counties.json: Medi-Cal certified eligibles (annual = monthly average). */
export type MediCalCounty = {
  years: Record<string, { eligibles: number; dual: number | null; months: number; preliminary: boolean }>
  latest: { month: string; eligibles: number; dual: number | null; preliminary: boolean }
}

/** data/processed/acs-county/counties.json: Census ACS 5-year estimates. Coverage percents overlap. */
export type AcsCounty = {
  fips: string
  population: number | null
  medianHouseholdIncome: number | null
  medianAge: number | null
  pctAge65Plus: number | null
  pctBelowPoverty: number | null
  pctUninsured: number | null
  pctPrivate: number | null
  pctMedicare: number | null
  pctMedicaid: number | null
}

/** Context for the county a hospital is in. Either source may be missing (not yet loaded). */
export type CommunityContext = {
  county: string
  acs: (AcsCounty & { vintage: string }) | null
  mediCal: (MediCalCounty["latest"] & { year: number; annual: MediCalCounty["years"][string] | null }) | null
}
