import type { Direction, Standing, Trend } from "@/lib/favorability"
import type { QualityFlag } from "@/lib/status"
import { FAMILY_ORDER, MAX_PRIMARY, MAX_PRIMARY_PER_TYPE, MAX_SECONDARY, type ProgramId, type SignalType } from "./families"

// The Opportunity Finder's scoring: a weighted, transparent formula, no model. Pure functions, client-safe, so the
// methodology drawer can show exactly what the server did.
//
//   Score = 100 × Severity × Persistence × Weight × Confidence   (rounded to one decimal)
//
// Severity (0–1): the average of how deep into the unfavorable quarter of peers the value sits, and how far it is
//   from the peer median in interquartile ranges (capped at 3). Penalties: the readmissions payment cut ÷ the 3%
//   cap; 1 when the hospital-acquired-condition penalty applies.
// Persistence: 1.0 unfavorable in each of the last 3 values, 0.9 in 2, 0.8 in only the latest; +0.1 if worsening
//   (up to 1.0). A measure whose windows span several years overlaps itself from one release to the next, so it
//   (and each penalty, scored on a multi-year window) takes a flat 0.9.
// Weight: the family tier in families.ts (1.0 / 0.8 / 0.6).
// Confidence (0–1): the product of the factors below; High ≥ 0.8, Medium ≥ 0.6, Low below.
//
// Dollar figures (penalties only) are evidence, never part of the score.

/** Fewest peers with a value for a metric to be scored. */
export const MIN_SCORED_PEERS = 5

/**
 * Lowest score a finding needs to be primary. From the statewide calibration run (scripts/calibrate_findings.py): 20
 * drops the weakest quarter of findings, which sit barely inside the unfavorable quarter of peers (median severity
 * 0.26). Reviewed and confirmed for V7.0.
 */
export const MIN_PRIMARY_SCORE = 20

export type ConfidenceLevel = "high" | "medium" | "low"

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = { high: "High", medium: "Medium", low: "Low" }

export const confidenceLevel = (c: number): ConfidenceLevel => (c >= 0.8 ? "high" : c >= 0.6 ? "medium" : "low")

/** One factor of the formula as the methodology drawer shows it: its value and the rule that set it. */
export type Factor = { label: string; value: number; rule: string }

export const round1 = (n: number) => Math.round(n * 10) / 10
const round3 = (n: number) => Math.round(n * 1000) / 1000

// -- Severity ---------------------------------------------------------------------------------------------------------

export type SeverityResult = { value: number; depth: number; gap: number; rule: string }

/**
 * @param percentile share (0–1) of peers the value is above, as the benchmark computes it
 */
export function peerSeverity(
  direction: Exclude<Direction, "context">,
  percentile: number,
  value: number,
  median: number,
  p25: number,
  p75: number
): SeverityResult {
  // q: the percentile counted from the unfavorable end, so q < 0.25 is the unfavorable quarter either way.
  const q = direction === "higher" ? percentile : 1 - percentile
  const depth = Math.max(0, Math.min(1, (0.25 - q) / 0.25))
  const iqr = p75 - p25
  const worse = direction === "higher" ? value < median : value > median
  const gap = !worse ? 0 : iqr > 0 ? Math.min(Math.abs(value - median) / iqr, 3) / 3 : depth
  const pctBad = Math.round(q * 100)
  return {
    value: round3((depth + gap) / 2),
    depth: round3(depth),
    gap: round3(gap),
    rule:
      `Depth ${round3(depth)}: ${pctBad}% of peers are further on the unfavorable side, (0.25 − ${round3(q)}) ÷ 0.25. ` +
      `Gap ${round3(gap)}: ${iqr > 0 ? `distance from the peer median in interquartile ranges, capped at 3, ÷ 3` : "no spread among peers, so the gap equals the depth"}. ` +
      `Severity is their average.`,
  }
}

export function hrrpSeverity(reduction: number, cap: number): SeverityResult {
  const v = round3(Math.min(1, reduction / cap))
  return { value: v, depth: v, gap: v, rule: `The readmissions payment cut (${(reduction * 100).toFixed(2)}%) ÷ the program's ${(cap * 100).toFixed(0)}% cap.` }
}

export const HAC_SEVERITY: SeverityResult = {
  value: 1,
  depth: 1,
  gap: 1,
  rule: "The hospital-acquired-condition penalty applies (worst-performing quarter nationally): full severity.",
}

// -- Persistence ------------------------------------------------------------------------------------------------------

export type PersistenceResult = { value: number; rule: string }

/**
 * @param unfavorable for the hospital's last values (up to 3, oldest first), whether each stood unfavorable
 * @param rolling the measure's window spans several years, so consecutive values overlap
 */
export function persistence(unfavorable: boolean[], trendWord: Trend | null, rolling: boolean): PersistenceResult {
  if (rolling) {
    return { value: 0.9, rule: "Multi-year measurement window: consecutive releases share most of their data, so persistence is a flat 0.9." }
  }
  const last = unfavorable.slice(-3)
  const count = last.filter(Boolean).length
  const base = count >= 3 ? 1 : count === 2 ? 0.9 : 0.8
  const bonus = trendWord === "worsening" ? 0.1 : 0
  const value = round1(Math.min(1, base + bonus))
  const years = `Unfavorable in ${count} of the last ${last.length} value${last.length === 1 ? "" : "s"}: ${base}`
  return { value, rule: bonus && value > base ? `${years}, +0.1 for a worsening trend.` : `${years}.` }
}

export const PROGRAM_PERSISTENCE: PersistenceResult = {
  value: 0.9,
  rule: "CMS scores penalties on a multi-year performance window, so persistence is a flat 0.9.",
}

// -- Confidence -------------------------------------------------------------------------------------------------------

export function peersFactor(n: number): Factor {
  const value = n >= 20 ? 1 : n >= 10 ? 0.9 : 0.75
  return { label: "Peers with a value", value, rule: `${n} peers: 20 or more ×1.0, 10–19 ×0.9, 5–9 ×0.75 (fewer than ${MIN_SCORED_PEERS} not scored).` }
}

export function freshnessFactor(behind: number, latestYear: number, sourceYear: number): Factor {
  return behind === 0
    ? { label: "Freshness", value: 1, rule: "The hospital's value is from the source's latest period." }
    : { label: "Freshness", value: 0.8, rule: `Stale: the hospital's latest value is from ${latestYear}; the source has ${sourceYear} (×0.8; two or more periods behind is not scored).` }
}

export const FLAG_FACTOR: Partial<Record<QualityFlag, number>> = {
  provisional: 0.85,
  "partial-period": 0.85,
  "matched-record": 0.9,
}

export const UNAUDITED_FACTOR = 0.95

export function significanceFactor(compared: "better" | "same" | "worse", comparedTo: string): Factor {
  return compared === "worse"
    ? { label: "Source's own verdict", value: 1, rule: `The source rates this worse than ${comparedTo}.` }
    : {
        label: "Source's own verdict",
        value: 0.7,
        rule: `The source rates this ${compared === "same" ? "no different from" : "better than"} ${comparedTo}, so the gap with peers may be chance (×0.7).`,
      }
}

export const SMALL_SAMPLE = 25

export function sampleFactor(n: number): Factor {
  return { label: "Cases", value: 0.8, rule: `Only ${n} cases or surveys behind the value (fewer than ${SMALL_SAMPLE}: ×0.8).` }
}

export const confidenceOf = (factors: Factor[]) => round3(factors.reduce((p, f) => p * f.value, 1))

// -- Score ------------------------------------------------------------------------------------------------------------

export const scoreOf = (severity: number, persistence: number, weight: number, confidence: number) =>
  round1(100 * severity * persistence * weight * confidence)

// -- Findings ---------------------------------------------------------------------------------------------------------

/** One value in a finding's evidence, with where it stands. */
export type EvidencePoint = {
  metric: string
  label: string
  value: number
  /** The period it covers: "2024", "Jul 2021–Jun 2024". */
  period: string
  median: number | null
  p25: number | null
  p75: number | null
  n: number
  percentile: number | null
  standing: Standing | null
  trend: Trend | null
  /** "Worse than the national rate", where the source rates it. */
  compared: string | null
  /** Display strings, formatted as the metric cards format them. */
  text: { value: string; median: string | null; p25: string | null; p75: string | null }
  /** The hospital's previous value, for the trend's words: "from 4.1% in 2023". */
  prior: { text: string; period: string; rising: boolean } | null
}

export type StatusInfo = {
  through: string | null
  periodType: string
  published: string | null
  processed: string | null
  audit: string | null
  flags: QualityFlag[]
  flagDetail: Partial<Record<QualityFlag, string>>
}

/** A penalty condition or measure behind a program candidate. */
export type ProgramItem = {
  key: string
  label: string
  /** "ERR 1.110 vs peer median 1.010", "SIR 1.649 (z 1.99)". */
  detail: string
  /** Prefill for Propose: readmission-rate points, or infection cut in percent, to reach the peer median. */
  gapToMedian: number | null
}

export type Candidate = {
  kind: "peer" | "verdict" | "program"
  /** Metric id, or the program id for a penalty. */
  id: string
  label: string
  program?: ProgramId
  severity: SeverityResult
  persistence: PersistenceResult
  weight: number
  confidence: number
  factors: Factor[]
  score: number
  evidence: EvidencePoint | null
  /** Penalty: estimated dollars a year, and what they're based on. */
  dollars: { amount: number; basis: string } | null
  items?: ProgramItem[]
  status: StatusInfo
}

export type Finding = {
  /** facilityId:family — stable across data refreshes. */
  id: string
  family: string
  label: string
  type: SignalType
  score: number
  confidence: number
  level: ConfidenceLevel
  /** The best-scoring candidate: the finding's headline. */
  lead: Candidate
  /** Every candidate, lead first. */
  candidates: Candidate[]
  /** The family's other metrics, for context (not candidates). */
  context: EvidencePoint[]
  dollars: { amount: number; basis: string } | null
  nextAction: string
  propose: { href: string; module: string; prefilled: boolean } | null
  /** Why it is primary or secondary: the selection rule that placed it. */
  placement?: string
}

/** Higher score first; ties go to higher confidence, then a dollar figure, then persistence, then family order. */
export function compareFindings(a: Finding, b: Finding) {
  return (
    b.score - a.score ||
    b.confidence - a.confidence ||
    Number(!!b.dollars) - Number(!!a.dollars) ||
    b.lead.persistence.value - a.lead.persistence.value ||
    (FAMILY_ORDER.get(a.family) ?? 99) - (FAMILY_ORDER.get(b.family) ?? 99)
  )
}

export type Selection = { primary: Finding[]; secondary: Finding[]; overflow: Finding[] }

/**
 * The top 5 + 5. Primary: in score order, Medium confidence or better, at least `minPrimary`, and at most 2 per
 * signal type; a finding that misses any of these moves to secondary instead of disappearing. Secondary: the next 5
 * by score, any confidence. The rest is overflow, counted but not ranked.
 */
export function selectFindings(findings: Finding[], minPrimary = MIN_PRIMARY_SCORE): Selection {
  const sorted = [...findings].sort(compareFindings)
  const primary: Finding[] = []
  const rest: Finding[] = []
  const perType = new Map<SignalType, number>()
  for (const f of sorted) {
    const typeCount = perType.get(f.type) ?? 0
    let reason: string | null = null
    if (primary.length >= MAX_PRIMARY) reason = `the ${MAX_PRIMARY} primary places are taken by higher scores`
    else if (f.score < minPrimary) reason = `its score is below the primary minimum of ${minPrimary}`
    else if (f.level === "low") reason = "its confidence is Low (primary needs Medium or High)"
    else if (typeCount >= MAX_PRIMARY_PER_TYPE) reason = `${MAX_PRIMARY_PER_TYPE} primary findings of this type already rank higher`
    if (reason) {
      rest.push({ ...f, placement: `Secondary: ${reason}.` })
    } else {
      perType.set(f.type, typeCount + 1)
      primary.push({ ...f, placement: `Primary: #${primary.length + 1} by score among findings that qualify.` })
    }
  }
  return { primary, secondary: rest.slice(0, MAX_SECONDARY), overflow: rest.slice(MAX_SECONDARY) }
}
