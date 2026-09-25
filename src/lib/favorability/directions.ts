// Which way is favorable, per metric: the one place Padua decides whether a hospital above its peers is doing well.
// Every comparison label (Favorable, Unfavorable, Similar to peers, Direction depends on strategy) reads this.
//
//   higher  — higher is generally favorable (margins, cash, patient experience, process compliance)
//   lower   — lower is generally favorable (unit costs, infections, readmissions, mortality, ED delays)
//   context — neither: it depends on the hospital's strategy, mission, or case mix (volumes, length of stay,
//             occupancy, case mix index, payer mix). Labeled "Direction depends on strategy", never judged.
//
// To change a metric's direction, edit its line here; nothing else needs to change. A metric not listed is treated
// as context (never judged). scripts/check-directions.mts (npm run check:directions) checks this list against the ETL dictionaries'
// higherIsBetter, so the two can't drift apart silently.

export type Direction = "higher" | "lower" | "context"

export const DIRECTIONS: Record<string, Direction> = {
  // -- Financial (HCAI annual financial data) ------------------------------------------------------------
  operatingMargin: "higher",
  daysCashOnHand: "higher",
  netPatientRevenue: "context",
  totalOperatingExpense: "context",
  expensePerAdjDischarge: "lower",
  revenuePerAdjDischarge: "higher",
  payerMix: "context",
  medicareMargin: "higher",
  medicareRevenuePerAdjDischarge: "higher",
  medicareCostPerAdjDischarge: "lower",
  medicareNetRevenue: "context",
  medicareAdvantageShare: "context",

  // -- Utilization (HCAI utilization report; also unit and service-line views, which share these ids) -------
  licensedBeds: "context",
  occupancy: "context",
  inpatientDays: "context",
  discharges: "context",
  alos: "context",
  adc: "context",
  edVisits: "context",
  edAdmitRate: "context",
  edHighAcuityShare: "context",
  edLwbsRate: "lower",
  edVisitsPerStation: "context",
  diversionHours: "lower",
  ipSurgeries: "context",
  opSurgeries: "context",
  cathProcedures: "context",
  outpatientVisits: "context",
  medicareDischarges: "context",
  medicareInpatientDays: "context",
  medicareAlos: "context",
  medicareOutpatientVisits: "context",
  caseMixIndex: "context",
  /** Medicare specialty view: cases, estimated payment, and share by MDC. */
  specialtyCases: "context",

  // -- Quality (CMS Care Compare, CDPH infections) --------------------------------------------------------
  clabsiSir: "lower",
  clabsiRate: "lower",
  cdiSir: "lower",
  cdiRate: "lower",
  mrsaSir: "lower",
  mrsaRate: "lower",
  vreRate: "lower",
  readmHospitalWide: "lower",
  readmHybrid: "lower",
  readmHf: "lower",
  readmPn: "lower",
  readmAmi: "lower",
  readmCopd: "lower",
  readmHipKnee: "lower",
  mortHybrid: "lower",
  mortHf: "lower",
  mortPn: "lower",
  mortAmi: "lower",
  mortCopd: "lower",
  mortStroke: "lower",
  psi90: "lower",
  hcahpsStar: "higher",
  hcahpsRating: "higher",
  hcahpsRecommend: "higher",
  edTimeToDeparture: "lower",
  sepsisBundle: "higher",
  overallStar: "higher",
}

/** Why a context metric isn't judged, where one sentence helps (shown with the label). */
export const CONTEXT_REASONS: Record<string, string> = {
  caseMixIndex: "A higher case mix index means sicker, costlier patients, which can reflect a tertiary mission rather than better or worse performance.",
  alos: "Shorter stays can mean efficiency or early discharge; longer stays can mean sicker patients. It depends on case mix and strategy.",
  medicareAlos: "Shorter stays can mean efficiency or early discharge; longer stays can mean sicker patients. It depends on case mix and strategy.",
  occupancy: "High occupancy uses capacity well but can mean crowding; low occupancy can mean spare capacity or unstaffed beds.",
  payerMix: "Payer mix reflects the community and mission as much as strategy.",
}

export const directionOf = (metricId: string): Direction => DIRECTIONS[metricId] ?? "context"
