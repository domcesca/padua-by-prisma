// Types shared by the cost-savings module's server loader and its editor.

export type SavingsData = {
  /** This hospital's average operating cost per adjusted patient day, from its HCAI annual financial report. */
  costPerDay: {
    year: number
    value: number
    operatingExpense: number
    patientDays: number
    /** Patient days scaled up by gross charges ÷ inpatient charges, to count outpatient work. */
    adjustedPatientDays: number
    /** Share of patient days in long-term care units (skilled nursing, sub-acute, intermediate care). */
    longTermCareShare: number
  } | null
  /** The same figure across the hospital's Benchmark peer group (leaving out peers with big long-term care units). */
  peers: { description: string; count: number; median: number } | null
  sourcePage: string
}

/**
 * Above this share of long-term care days, the average cost of a day mixes in much cheaper
 * skilled-nursing days and understates an acute day, so it isn't pre-filled.
 */
export const MAX_LONG_TERM_CARE_SHARE = 0.1
