import { directionOf, type Direction } from "./directions"

// Padua's comparison vocabulary, shared by every tool. A comparison with peers leads with one of four labels, and the
// percentile and peer median follow as the evidence; a change over time says "improving" or "worsening" in words,
// never by color or arrow alone.
//
//   Favorable / Unfavorable — outside the middle half of the peer group (above the 75th or below the 25th
//                             percentile), on the side the metric's direction (directions.ts) calls favorable or not.
//   Similar to peers        — within the middle half (25th–75th percentile), the band the trend charts shade.
//   Direction depends on strategy — a context metric (volume, length of stay, case mix): never judged.
//
// Fewer than MIN_PEERS peers with a value is too few to judge; the rank still shows.

export { directionOf, type Direction } from "./directions"

export const MIN_PEERS = 3

export type Standing = "favorable" | "unfavorable" | "similar" | "depends" | "fewPeers"

export const STANDING_LABEL: Record<Standing, string> = {
  favorable: "Favorable",
  unfavorable: "Unfavorable",
  similar: "Similar to peers",
  depends: "Direction depends on strategy",
  fewPeers: "Too few peers to judge",
}

/** Short forms for tight table cells; same meaning. */
export const STANDING_SHORT: Record<Standing, string> = {
  favorable: "Favorable",
  unfavorable: "Unfavorable",
  similar: "Similar",
  depends: "Depends on strategy",
  fewPeers: "Too few peers",
}

/**
 * Where a value stands against its peers.
 * @param percentile share (0–1) of peers the value is above (ties count half), as the benchmark computes it
 * @param peers peers with a value
 */
export function standing(direction: Direction, percentile: number | null | undefined, peers: number): Standing | null {
  if (percentile == null || peers === 0) return null
  if (direction === "context") return "depends"
  if (peers < MIN_PEERS) return "fewPeers"
  if (percentile >= 0.25 && percentile <= 0.75) return "similar"
  const above = percentile > 0.75
  return above === (direction === "higher") ? "favorable" : "unfavorable"
}

export const metricStanding = (metricId: string, percentile: number | null | undefined, peers: number) =>
  standing(directionOf(metricId), percentile, peers)

/** "Higher than 91% of 22 peers" — the evidence under a standing label. */
export function rankText(percentile: number, peers: number, noun = "peers") {
  const pct = Math.round(percentile * 100)
  if (pct >= 100) return `Highest of ${peers} ${noun}`
  if (pct <= 0) return `Lowest of ${peers} ${noun}`
  if (pct >= 45 && pct <= 55) return `About the median of ${peers} ${noun}`
  return `Higher than ${pct}% of ${peers} ${noun}`
}

export type Trend = "improving" | "worsening" | "unchanged" | "up" | "down"

export const TREND_LABEL: Record<Trend, string> = {
  improving: "Improving",
  worsening: "Worsening",
  unchanged: "Unchanged",
  up: "Up",
  down: "Down",
}

/**
 * A change between two values: improving or worsening for a metric with a favorable direction, just up or down for
 * a context metric. `same` says whether the two round to the same displayed value (then it's unchanged).
 */
export function trend(direction: Direction, from: number, to: number, same: boolean): Trend {
  if (same || from === to) return "unchanged"
  const up = to > from
  if (direction === "context") return up ? "up" : "down"
  return up === (direction === "higher") ? "improving" : "worsening"
}

/** Color tone for a standing or trend: favorable and unfavorable mean the same colors everywhere. */
export type Tone = "favorable" | "unfavorable" | "neutral"

export const toneOf = (s: Standing | Trend | null): Tone =>
  s === "favorable" || s === "improving" ? "favorable" : s === "unfavorable" || s === "worsening" ? "unfavorable" : "neutral"
