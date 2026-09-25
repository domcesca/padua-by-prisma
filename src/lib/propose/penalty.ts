// Types and math for the avoided-penalty module, shared by its server loader and its editor.
// Pure functions: the editor re-runs CMS's formulas on the hospital's own published components
// as the proposer types.
//
// HRRP (Hospital Readmissions Reduction Program): payment reduction =
//   min(3%, neutrality modifier × Σ over conditions with 25+ eligible discharges of
//        DRG payment ratio × max(0, ERR − peer group median ERR)),
// applied to base operating DRG payments. A condition's ERR is predicted ÷ expected readmission
// rate; a cut of x points in the readmission rate is modeled as the predicted rate falling by x
// (ERR × (predicted − x) ÷ predicted), with the peer medians and modifier held where they are.
//
// HAC (Hospital-Acquired Condition) Reduction Program: Total HAC Score = the average of the
// hospital's Winsorized z-scores; above the national cutoff (worst quartile), operating payments
// are cut 1%. An x% cut in an infection's count is modeled as its SIR falling x%.
//
// Both programs score a performance period that ends well before the payment year, so an
// improvement starting in year 1 reaches the penalty years later and phases in as the rolling
// window fills with improved months. `phaseIn` works that out from the published periods.

export const HRRP_CONDITIONS = [
  { key: "ami", label: "Heart attack (AMI)" },
  { key: "hf", label: "Heart failure" },
  { key: "pn", label: "Pneumonia" },
  { key: "copd", label: "COPD" },
  { key: "cabg", label: "Bypass surgery (CABG)" },
  { key: "hipKnee", label: "Hip/knee replacement" },
] as const
export type HrrpConditionKey = (typeof HRRP_CONDITIONS)[number]["key"]

export const HAC_MEASURES = [
  { key: "clabsi", label: "Central line bloodstream infections (CLABSI)" },
  { key: "cauti", label: "Catheter urinary tract infections (CAUTI)" },
  { key: "ssi", label: "Surgical site infections (SSI: colon, hysterectomy)" },
  { key: "mrsa", label: "MRSA bloodstream infections" },
  { key: "cdi", label: "C. diff infections (CDI)" },
] as const
export type HaiKey = (typeof HAC_MEASURES)[number]["key"]
/** PSI 90 is in the Total HAC Score but isn't an infection; it's held as published. */
export type HacMeasureKey = HaiKey | "psi90"

export type HrrpCondition = {
  discharges: number | null
  err: number
  peerMedian: number | null
  paymentRatio: number | null
  /** Risk-adjusted readmission rates, percent. Null when CMS doesn't report them (too few cases). */
  predicted: number | null
  expected: number | null
  readmissions: number | null
}

export type Period = { start: string; end: string }

export type PenaltyData = {
  /** Set when CMS reports this hospital under another hospital's Medicare number. */
  reportedWithName: string | null
  hrrp: {
    fiscalYear: number
    period: Period
    minDischarges: number
    cap: number
    sourcePage: string
    /** This hospital's standing, or null when it isn't in the program. */
    hospital: {
      reduction: number
      peerGroup: number | null
      neutralityModifier: number
      conditions: Partial<Record<HrrpConditionKey, HrrpCondition>>
    } | null
  }
  hac: {
    fiscalYear: number
    periods: { psi90: Period; hai: Period }
    reduction: number
    cutoff: number
    measures: Record<HacMeasureKey, { mean: number; sd: number; low: number; high: number }>
    sourcePage: string
    hospital: {
      measures: Partial<Record<HacMeasureKey, { value: number | null; z: number }>>
      totalScore: number | null
      penalized: boolean | null
    } | null
  }
  /** Estimated Medicare fee-for-service payments the penalties apply to. */
  payments: {
    fiscalYear: number
    sourcePage: string
    hospital: {
      cases: number
      caseMixIndex: number
      wageIndex: number
      /** Base operating DRG payments (the HRRP base). */
      baseOperating: number
      /** Plus IME, DSH, and outlier payments (the HAC base). */
      operating: number
    } | null
  }
}

// -- HRRP -----------------------------------------------------------------------

/** Readmission-rate cuts in percentage points, by condition. */
export type ReadmissionCuts = Partial<Record<HrrpConditionKey, number>>

/** The ERR after a cut of `points` (scaled by `share`, the part of the window it covers). */
export function adjustedErr(c: HrrpCondition, points: number, share = 1) {
  if (!points || !c.predicted) return c.err
  return (c.err * Math.max(0, c.predicted - points * share)) / c.predicted
}

/** A condition only counts with enough discharges and published components. */
export const hrrpCounts = (c: HrrpCondition, minDischarges: number) =>
  c.discharges != null && c.discharges >= minDischarges && c.peerMedian != null && c.paymentRatio != null

/** Payment reduction (0 to cap) after the cuts, `share` of the way through the performance window. */
export function hrrpReduction(data: PenaltyData["hrrp"], cuts: ReadmissionCuts, share = 1) {
  const h = data.hospital
  if (!h) return 0
  let sum = 0
  for (const { key } of HRRP_CONDITIONS) {
    const c = h.conditions[key]
    if (!c || !hrrpCounts(c, data.minDischarges)) continue
    sum += c.paymentRatio! * Math.max(0, adjustedErr(c, cuts[key] ?? 0, share) - c.peerMedian!)
  }
  return Math.min(data.cap, sum * h.neutralityModifier)
}

// -- HAC ------------------------------------------------------------------------

/** Infection cuts in percent, by measure. */
export type InfectionCuts = Partial<Record<HaiKey, number>>

/** Total HAC Score after the cuts. Changed measures move by the difference in recomputed z-score. */
export function hacScore(data: PenaltyData["hac"], cuts: InfectionCuts, share = 1) {
  const h = data.hospital
  if (!h || h.totalScore == null) return null
  const zs: number[] = []
  for (const [key, m] of Object.entries(h.measures) as [HacMeasureKey, { value: number | null; z: number }][]) {
    const cut = key === "psi90" ? 0 : ((cuts[key] ?? 0) / 100) * share
    if (!cut || m.value == null) {
      zs.push(m.z)
      continue
    }
    const p = data.measures[key]
    const z = (x: number) => (Math.min(p.high, Math.max(p.low, x)) - p.mean) / p.sd
    zs.push(m.z + z(m.value * (1 - Math.min(1, cut))) - z(m.value))
  }
  return zs.length ? zs.reduce((a, b) => a + b, 0) / zs.length : null
}

export const hacPenalized = (data: PenaltyData["hac"], score: number | null) => score != null && score > data.cutoff

// -- Timing ---------------------------------------------------------------------

const monthIndex = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number)
  // The month after the period's last day, so a period ending June 30 ends at "July".
  return y * 12 + (m - 1) + (d > 27 ? 1 : 0)
}

/**
 * For proposal years 1..life, the share of the program's performance window that falls after the
 * improvement starts (assumed: the start of year 1, taken as the start of a federal fiscal year).
 * `period` is the published window for `fiscalYear`; later years shift it a year at a time.
 */
export function phaseIn(period: Period, fiscalYear: number, life: number) {
  const fyStart = (fiscalYear - 1) * 12 + 9 // October 1 of the year before
  const end = monthIndex(period.end)
  const start = monthIndex(period.start) - (period.start.endsWith("-01") ? 0 : 1)
  const length = end - start
  const lead = fyStart - end // months between the window's end and its payment year
  return Array.from({ length: life }, (_, i) => Math.min(1, Math.max(0, 12 * i - lead) / length))
}

export type PenaltyYear = { year: number; hrrpShare: number; haiShare: number; hrrp: number; hac: number }

/** Avoided penalty dollars for each proposal year, with how far each program has phased in. */
export function avoidedByYear(data: PenaltyData, readm: ReadmissionCuts, hai: InfectionCuts, life: number): PenaltyYear[] {
  const pay = data.payments.hospital
  const hrrpShares = phaseIn(data.hrrp.period, data.hrrp.fiscalYear, life)
  const haiShares = phaseIn(data.hac.periods.hai, data.hac.fiscalYear, life)
  const hrrpNow = hrrpReduction(data.hrrp, readm, 0)
  const hacNow = data.hac.hospital?.penalized ?? false
  return hrrpShares.map((hrrpShare, i) => {
    const haiShare = haiShares[i]
    const hrrp = pay ? (hrrpNow - hrrpReduction(data.hrrp, readm, hrrpShare)) * pay.baseOperating : 0
    const hac = pay && hacNow && !hacPenalized(data.hac, hacScore(data.hac, hai, haiShare)) ? data.hac.reduction * pay.operating : 0
    return { year: i + 1, hrrpShare, haiShare, hrrp, hac }
  })
}
