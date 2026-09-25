// Types shared by the reimbursement module's server loader and its editor.

import type { HospitalWageIndex, LaborSplit } from "./wage-index"

export type DrgOption = {
  code: string
  label: string
  weight: number
  type: "MED" | "SURG" | null
  mdc: string | null
  mdcName: string
  /** Geometric mean length of stay, days. */
  gmlos: number | null
  /** Plain-language search terms (search-terms.ts). */
  terms: string[]
  /** The subset of terms this DRG is the first match for. */
  leadTerms: string[]
}

export type ReimbursementData = {
  fiscalYear: number
  effective: string
  sourcePage: string
  /** National operating standardized amount (Table 1A, full update). */
  rate: number
  rateBasis: string
  capitalRate: number
  /** The standardized amount's labor-related and non-labor parts (Tables 1A/1B), for Advanced mode's wage index. */
  laborSplit: { above: LaborSplit; atMost: LaborSplit }
  /** This hospital's FY IPPS wage index, or null when CMS has none (hospitals not paid under IPPS). */
  wageIndex: HospitalWageIndex | null
  drgs: DrgOption[]
  /** This hospital's Medicare fee-for-service cases per DRG, or null when CMS has none for it. */
  baseline: {
    year: number
    cases: Record<string, number>
    sourcePage: string
    /** Set when CMS reports this hospital under another hospital's Medicare number. */
    reportedWithName: string | null
  } | null
  /** The same counts across the hospital's Benchmark peer group. */
  peers: {
    description: string
    /** Peers with any Medicare inpatient data. */
    count: number
    /** Per DRG: how many peers had 11+ cases, and their median. */
    cases: Record<string, { reporting: number; median: number }>
  } | null
}

/** Estimated national-average Medicare operating payment for one case in a DRG. */
export const estimatedPayment = (weight: number, rate: number) => Math.round(weight * rate)
