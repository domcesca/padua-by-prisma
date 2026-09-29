import type { Facility, FieldYearMeta, PayerGroup, PointDetail } from "../data/types.ts"

// The shape /api/report/[id] returns (V7.5.5): one hospital's two HCAI annual reports (fields, measures and the annual
// report's own measures by year), its HCAI case mix index, and a separately labeled addendum from CMS and CDPH. One
// hospital only: no peer figure of any kind.

export type ReportYear = {
  year: number
  meta: FieldYearMeta
  /** Every numeric field HCAI publishes for the year, by field code. */
  fields: Record<string, number | null>
  /** The dataset's documented measures (Data definitions' key measures), as the metrics file has them. */
  measures: Record<string, number | null>
  /** The annual report's own measures (lib/annual-report/calcs.ts). */
  calcs: Record<string, number | Record<PayerGroup, number | null> | null>
}

/** Occupancy and length of stay in one bed classification, one calendar year. */
export type BedTypeYear = {
  id: string
  label: string
  licensedBeds: number | null
  occupancy: number | null
  alos: number | null
  discharges: number | null
  inpatientDays: number | null
}

export type QualityPoint = {
  year: number
  value: number
  detail: PointDetail | null
}
export type QualityMeasure = {
  id: string
  label: string
  unit: "pct" | "number"
  decimals?: number
  comparedTo: string | null
  points: QualityPoint[]
}

export type SourceNote = {
  id: string
  label: string
  sourcePage: string
  periodType: string
  years: number[]
  processed: string
}

export type AnnualReportData = {
  facility: Facility
  /** From the utilization report's profile (page 1), where the hospital files one. */
  profile: {
    parentOrganization: string | null
    principalService: string | null
  }
  financial: ReportYear[]
  utilization: ReportYear[]
  /** Utilization report page 3, per bed classification, by calendar year. */
  bedTypes: Record<string, BedTypeYear[]>
  /** HCAI's case mix index (federal fiscal years). */
  caseMix: { year: number; value: number }[]
  /** Not part of HCAI's filing: CMS Care Compare and CDPH infection data, shown as a labeled addendum. */
  addendum: {
    measures: QualityMeasure[]
    /** CMS reports this hospital under another's Medicare number. */
    sharedWith: string | null
  }
  sources: SourceNote[]
}
