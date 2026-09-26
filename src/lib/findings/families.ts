// The Opportunity Finder's configuration: which metrics make up each finding family, how much each counts, what to
// suggest next, and which Propose module a family hands off to. Client-safe; lib/findings/compute.ts reads it.
//
// A finding is one family. Its candidates (a metric standing Unfavorable against peers, a metric the source rates
// worse than its benchmark, or a CMS penalty) are scored with lib/findings/score.ts; the best one leads the finding
// and the rest are its evidence. However many candidates a family has, it is one finding and takes one slot.
//
// Only metrics with a favorable direction (lib/favorability/directions.ts) can be candidates: context metrics
// (volumes, length of stay, occupancy, case mix) are never judged, so they never create a finding.
//
// To re-weight a metric or rewrite a next action, edit its line here; nothing else needs to change.

export type SignalType = "financial" | "quality" | "operational"

export const SIGNAL_TYPE_LABEL: Record<SignalType, string> = {
  financial: "Financial",
  quality: "Quality",
  operational: "Operational",
}

/** Most primary findings of one signal type, so one kind of gap can't fill the list. */
export const MAX_PRIMARY_PER_TYPE = 2
export const MAX_PRIMARY = 5
export const MAX_SECONDARY = 5
/** How many primary findings Home shows. */
export const HOME_COUNT = 3

/** Where a family's finding hands off to Propose. */
export type ProposeHandoff = "penalty-readm" | "penalty-hai" | "savings"

/** A CMS penalty program, scored as a candidate of the family it belongs to. */
export type ProgramId = "hrrp" | "hac"

export type FamilyMember = {
  metric: string
  /** Weight tier: 1.0, 0.8 or 0.6. */
  weight: number
  /** Shown as evidence only, never a candidate (raw infection rates beside their risk-adjusted ratio). */
  evidenceOnly?: boolean
}

export type Family = {
  id: string
  label: string
  type: SignalType
  members: FamilyMember[]
  programs?: { id: ProgramId; weight: number }[]
  /** What to review next. Suggests where to look, never a clinical conclusion. */
  nextAction: string
  propose?: ProposeHandoff
}

const W1 = 1
const W2 = 0.8
const W3 = 0.6

export const FAMILIES: Family[] = [
  {
    id: "marginLiquidity",
    label: "Margin & liquidity",
    type: "financial",
    members: [
      { metric: "operatingMargin", weight: W1 },
      { metric: "daysCashOnHand", weight: W1 },
    ],
    nextAction: "Review the operating statement against peers line by line: which revenue or expense lines explain the gap, and whether it is one year or a pattern.",
  },
  {
    id: "costPerCase",
    label: "Cost per case",
    type: "financial",
    members: [
      { metric: "expensePerAdjDischarge", weight: W2 },
      { metric: "medicareCostPerAdjDischarge", weight: W2 },
    ],
    nextAction: "Break cost per adjusted discharge into labor, supplies and purchased services, and check whether case mix explains part of the gap before targeting savings.",
    propose: "savings",
  },
  {
    id: "revenuePerCase",
    label: "Revenue per case",
    type: "financial",
    members: [
      { metric: "revenuePerAdjDischarge", weight: W3 },
      { metric: "medicareRevenuePerAdjDischarge", weight: W3 },
      { metric: "medicareMargin", weight: W3 },
    ],
    nextAction: "Compare payer mix and case mix with peers, then review contract rates, documentation and coding, and denials for the payers that drive the gap.",
  },
  {
    id: "readmissions",
    label: "Readmissions",
    type: "quality",
    members: [
      { metric: "readmHospitalWide", weight: W2 },
      { metric: "readmHybrid", weight: W2 },
      { metric: "readmHf", weight: W2 },
      { metric: "readmPn", weight: W2 },
      { metric: "readmAmi", weight: W2 },
      { metric: "readmCopd", weight: W2 },
      { metric: "readmHipKnee", weight: W2 },
    ],
    programs: [{ id: "hrrp", weight: W1 }],
    nextAction: "Review readmissions for the conditions listed by discharge destination and follow-up timing, and check which conditions drive the Medicare penalty.",
    propose: "penalty-readm",
  },
  {
    id: "infectionsSafety",
    label: "Infections & patient safety",
    type: "quality",
    members: [
      { metric: "clabsiSir", weight: W2 },
      { metric: "cdiSir", weight: W2 },
      { metric: "mrsaSir", weight: W2 },
      { metric: "psi90", weight: W1 },
      { metric: "clabsiRate", weight: W2, evidenceOnly: true },
      { metric: "cdiRate", weight: W2, evidenceOnly: true },
      { metric: "mrsaRate", weight: W2, evidenceOnly: true },
      { metric: "vreRate", weight: W2, evidenceOnly: true },
    ],
    programs: [{ id: "hac", weight: W1 }],
    nextAction: "Review the infection and safety measures listed with infection prevention and quality staff: units, device days, and prevention bundle compliance.",
    propose: "penalty-hai",
  },
  {
    id: "mortality",
    label: "Mortality",
    type: "quality",
    members: [
      { metric: "mortHybrid", weight: W1 },
      { metric: "mortHf", weight: W1 },
      { metric: "mortPn", weight: W1 },
      { metric: "mortAmi", weight: W1 },
      { metric: "mortCopd", weight: W1 },
      { metric: "mortStroke", weight: W1 },
    ],
    nextAction: "Refer the conditions listed to clinical quality review, starting with case review of deaths and whether documentation reflects how sick patients were.",
  },
  {
    id: "patientExperience",
    label: "Patient experience",
    type: "quality",
    members: [
      { metric: "hcahpsStar", weight: W3 },
      { metric: "hcahpsRating", weight: W3 },
      { metric: "hcahpsRecommend", weight: W3 },
      { metric: "overallStar", weight: W3 },
    ],
    nextAction: "Review the survey's individual questions (communication, responsiveness, discharge information) to find which ones pull the ratings down.",
  },
  {
    id: "edThroughput",
    label: "ED throughput",
    type: "operational",
    members: [
      { metric: "edLwbsRate", weight: W2 },
      { metric: "edTimeToDeparture", weight: W2 },
      { metric: "diversionHours", weight: W3 },
    ],
    nextAction: "Review ED flow by hour of day: arrival-to-provider time, boarding of admitted patients, and staffing against arrival patterns.",
  },
]

export const FAMILY_BY_ID = new Map(FAMILIES.map((f) => [f.id, f]))

/** The family a metric belongs to, for "Related signal" links on metric cards. */
export const FAMILY_OF_METRIC = new Map(FAMILIES.flatMap((f) => f.members.map((m) => [m.metric, f.id] as const)))

/** Families in their fixed order: the last tie-breaker. */
export const FAMILY_ORDER = new Map(FAMILIES.map((f, i) => [f.id, i]))

export const PROGRAM_LABEL: Record<ProgramId, string> = {
  hrrp: "Hospital Readmissions Reduction Program penalty",
  hac: "Hospital-Acquired Condition Reduction Program penalty",
}

/** HRRP conditions and the Care Compare readmission rate for each, where there is one. */
export const HRRP_METRIC: Record<string, string | null> = {
  ami: "readmAmi",
  hf: "readmHf",
  pn: "readmPn",
  copd: "readmCopd",
  cabg: null,
  hipKnee: "readmHipKnee",
}
