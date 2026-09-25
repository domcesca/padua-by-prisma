// Correlate: two catalog metrics plotted against each other across a hospital's
// peer group. Like Build's ReportSpec, the whole view is a small declarative
// config that lives in the URL; the server validates and runs it (./run.ts).

import type { SourceStatus } from "@/lib/data/freshness"

export type CorrelateSpec = {
  facilityId: string | null
  /** Catalog metric id on the horizontal axis. */
  x: string
  /** Catalog metric id on the vertical axis. */
  y: string
  peers: "similar" | "statewide"
  /** Year the two metrics are paired on; null = the latest year most peers report both. */
  year: number | null
}

/** Below this many hospitals the result carries a small-sample warning. */
export const SMALL_SAMPLE = 8
/** Fewer hospitals than this and no correlation is computed. */
export const MIN_POINTS = 3

// Case mix against cost per adjusted discharge: the classic "are we expensive or just sicker?" question.
export const DEFAULT_X = "caseMixIndex"
export const DEFAULT_Y = "expensePerAdjDischarge"

type ParamSource = { get(name: string): string | null }

export function parseCorrelateSpec(params: ParamSource, validMetricIds: Set<string>): CorrelateSpec {
  const pick = (v: string | null, fallback: string) => (v && validMetricIds.has(v) ? v : fallback)
  const x = pick(params.get("x"), DEFAULT_X)
  let y = pick(params.get("y"), DEFAULT_Y)
  if (x === y) y = x === DEFAULT_Y ? DEFAULT_X : DEFAULT_Y
  const year = Number.parseInt(params.get("year") ?? "", 10)
  return {
    facilityId: params.get("facility") || null,
    x,
    y,
    peers: params.get("peers") === "statewide" ? "statewide" : "similar",
    year: Number.isFinite(year) && year > 1990 ? year : null,
  }
}

export function correlateSpecToParams(spec: CorrelateSpec) {
  const p = new URLSearchParams()
  if (spec.facilityId) p.set("facility", spec.facilityId)
  p.set("x", spec.x)
  p.set("y", spec.y)
  if (spec.peers === "statewide") p.set("peers", "statewide")
  if (spec.year != null) p.set("year", String(spec.year))
  return p
}

// -- results ----------------------------------------------------------------------

export type CorrelatePoint = { id: string; name: string; x: number; y: number; focus: boolean }

export type CorrelateResult = {
  spec: CorrelateSpec
  facilityName: string
  /** The year actually shown. */
  year: number
  /** Years with at least MIN_POINTS hospitals reporting both, newest first, with how many. */
  years: { year: number; n: number }[]
  points: CorrelatePoint[]
  /** Hospitals in the group (focus included) missing one or both values this year. */
  missing: number
  /** Whether the chosen hospital has both values this year. */
  focusReported: boolean
  /** Pearson r, r², and least-squares fit y = slope·x + intercept; null below MIN_POINTS or with no spread. */
  stats: { n: number; r: number; r2: number; slope: number; intercept: number; /** Spearman rank correlation. */ rho: number } | null
  peerGroup: { description: string; count: number }
  /** Caveats about pairing years of different kinds (fiscal vs calendar, multi-year periods). */
  notes: string[]
  /** Status line per axis: the source's dates, provisional years, and the chosen hospital's record match. */
  sources: { x: SourceStatus; y: SourceStatus }
  /** Newest year each axis's source has for any hospital. */
  latestYears: { x: number; y: number }
}

/**
 * A metric label for mid-sentence use: "Case mix index" -> "case mix index", but acronyms
 * ("ED visits", "CLABSI rate") and proper nouns ("Medicare margin") keep their capitals.
 */
export function lowerLabel(label: string) {
  if (!/^[A-Z][a-z]/.test(label) || /^(Medicare|Medi-Cal|California|CMS)\b/.test(label)) return label
  return label.charAt(0).toLowerCase() + label.slice(1)
}

/** "Strong negative" etc., by the usual rules of thumb for |r|. */
export function describeR(r: number) {
  const a = Math.abs(r)
  const strength = a < 0.1 ? "No" : a < 0.3 ? "Weak" : a < 0.5 ? "Moderate" : a < 0.7 ? "Strong" : "Very strong"
  if (strength === "No") return "No linear relationship"
  return `${strength} ${r > 0 ? "positive" : "negative"} relationship`
}
