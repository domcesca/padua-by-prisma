// Types shared by the outpatient reimbursement module's server loader and its editor.

import type { HospitalWageIndex } from "./wage-index"

export type ApcOption = {
  code: string
  /** CMS's APC title, e.g. "Level 3 Imaging without Contrast". */
  title: string
  /** OPPS status indicator (J1 comprehensive, S/T procedures, V visits, …). */
  si: string
  /** National unadjusted OPPS payment rate, dollars per service. */
  rate: number
  group: string
  /** Plain-language search terms (search-terms.ts). */
  terms: string[]
  leadTerms: string[]
}

export type OutpatientData = {
  calendarYear: number
  /** The Addendum A quarterly update used, e.g. "July 2026". */
  quarter: string
  sourcePage: string
  conversionFactor: number | null
  /** OPPS's labor-related share (0.6), for Advanced mode's wage index. */
  laborShare: number
  /** This hospital's CY OPPS wage index, or null when CMS has none. */
  wageIndex: HospitalWageIndex | null
  apcs: ApcOption[]
  /** APCs CMS publishes per-hospital counts for (comprehensive APCs only). */
  baselineApcs: string[]
  /** This hospital's Medicare fee-for-service outpatient services per comprehensive APC, or null when CMS has none. */
  baseline: {
    year: number
    services: Record<string, number>
    sourcePage: string
    reportedWithName: string | null
  } | null
  peers: {
    description: string
    count: number
    services: Record<string, { reporting: number; median: number }>
  } | null
}

export type RevenueScope = "facility" | "professional" | "both"
