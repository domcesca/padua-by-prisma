// Shapes of the processed files written by the Python ETL (etl/hcai_etl).
// Keep in sync with etl/hcai_etl/datasets/hafd_selected.py.

export type Ownership = "nonprofit" | "investor" | "district" | "government" | "state" | "other"

export type Facility = {
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

/** facilityId -> year -> metrics */
export type MetricsFile = Record<string, Record<string, FacilityYearMetrics>>

export type FieldYearMeta = {
  days: number
  reports: number
  annualized: boolean
  status: string | null
  begin: string | null
  end: string | null
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

export type DictionaryMetric = {
  id: string
  label: string
  unit: "ratio" | "days" | "pct" | "count" | "share"
  summary: string
  formula: string
  inputs: string[]
  higherIsBetter: boolean | null
  drivers: string[]
  caution?: string
}

export type Dictionary = {
  dataset: string
  source: string
  sections: DictionarySection[]
  fields: DictionaryField[]
  metrics: DictionaryMetric[]
  payerGroups: { id: PayerGroup; label: string; includes: string[] }[]
}

export type Manifest = {
  id: string
  title: string
  sourcePage: string
  years: number[]
  sources: { year: number; name: string; url: string }[]
  generatedAt: string
  notes: string[]
}
