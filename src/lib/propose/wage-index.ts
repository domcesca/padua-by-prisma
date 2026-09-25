// Advanced mode's wage index adjustment, shared by the reimbursement modules' loaders and editors.
//
// CMS splits a DRG or APC payment into a labor-related share, multiplied by the hospital's area wage index, and a
// non-labor share, which isn't. Standard mode uses the flat national rate; with the adjustment on, a hospital's
// payment is worked out the way CMS does it:
//   * IPPS (inpatient): relative weight × (labor-related amount × wage index + non-labor amount), with Table 1A's
//     split above a wage index of 1 and Table 1B's at or below it.
//   * OPPS (outpatient): national rate × (60% × wage index + 40%).
// The wage index is the hospital's own, from CMS's rule files (etl cms-wage-index): FY IPPS Table 2 for inpatient,
// the CY OPPS Hospital Impact File for outpatient.

export type LaborSplit = { laborRelated: number; nonlaborRelated: number }

/** A hospital's wage index for one payment system, with where it came from. */
export type HospitalWageIndex = {
  /** The hospital's name in Padua, for "wage-index-adjusted for …". */
  hospital: string
  value: number
  /** "FY 2027" or "CY 2026". */
  year: string
  ccn: string
  /** The CMS file, e.g. "FY 2027 IPPS Final Rule, Table 2 (wage index by CCN)". */
  table: string
  sourcePage: string
  /** Set when CMS pays this hospital under another hospital's Medicare number. */
  reportedWithName: string | null
}

/** Wage-adjusted IPPS operating payment for a DRG weight. */
export function ippsWagePayment(weight: number, split: { above: LaborSplit; atMost: LaborSplit }, wageIndex: number) {
  const s = wageIndex > 1 ? split.above : split.atMost
  return Math.round(weight * (s.laborRelated * wageIndex + s.nonlaborRelated))
}

/** Wage-adjusted OPPS payment for a national rate. */
export const oppsWageRate = (rate: number, laborShare: number, wageIndex: number) =>
  Math.round(rate * (laborShare * wageIndex + (1 - laborShare)) * 100) / 100

/** The labor share in force for an IPPS wage index, as a percent. */
export const ippsLaborShare = (split: { above: LaborSplit; atMost: LaborSplit }, wageIndex: number) => {
  const s = wageIndex > 1 ? split.above : split.atMost
  return Math.round((s.laborRelated / (s.laborRelated + s.nonlaborRelated)) * 1000) / 10
}
