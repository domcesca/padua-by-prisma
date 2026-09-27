import { MIN_SCORED_PEERS, peersFactor } from "@/lib/findings/score"
import type { PeerFilters } from "./filters"

// How much to trust a comparison with this peer group: Strong fit / Broad comparison / Limited sample. The size half
// reuses the Opportunity Finder's peer-count factor (lib/findings/score.ts: 20+ ×1.0, 10–19 ×0.9, 5–9 ×0.75, fewer than
// 5 not scored); the match half counts which of the hospital's characteristics the group is matched on.
//
//   Limited sample    — fewer than 5 peers, or a closely matched group of 5–9 (the ×0.75 size factor)
//   Broad comparison  — matched on fewer than two characteristics (statewide, teaching-only, a wide radius alone)
//   Strong fit        — matched on two or more characteristics, with 10 or more peers
//
// The characteristics: local geography (a county or 50 miles or less), size band, ownership, teaching/rural status.
// Type of care (general acute, children's, …) always matches, so it isn't counted.

export type PeerFitLevel = "strong" | "broad" | "limited"

export const PEER_FIT_LABEL: Record<PeerFitLevel, string> = {
  strong: "Strong fit",
  broad: "Broad comparison",
  limited: "Limited sample",
}

/** Characteristics the (applied) filters match on, in words. */
export function matchedTraits(f: PeerFilters): string[] {
  const out: string[] = []
  if (f.counties.length || (f.radiusMiles != null && f.radiusMiles <= 50)) out.push("location")
  if (f.bedsMin != null || f.bedsMax != null) out.push("size")
  if (f.ownership.length) out.push("ownership")
  if (f.teaching !== "any") out.push(f.teaching === "rural" ? "rural status" : "teaching status")
  return out
}

const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`)

/**
 * @param applied the filters the peer group was actually built with (for "similar", the ones chosen automatically)
 * @param count hospitals in the group, the hospital itself excluded
 */
export function peerFit(applied: PeerFilters, count: number): { level: PeerFitLevel; label: string; reason: string } {
  const traits = matchedTraits(applied)
  const size = peersFactor(count)
  const matched = traits.length ? `matched on ${list(traits)}` : "matched on type of care only"
  const n = `${count} peer${count === 1 ? "" : "s"}`
  let level: PeerFitLevel
  let reason: string
  if (count < MIN_SCORED_PEERS) {
    level = "limited"
    reason = `${n}, ${matched}. Fewer than ${MIN_SCORED_PEERS} is too few to rank findings; read comparisons as rough.`
  } else if (traits.length < 2) {
    level = "broad"
    reason = `${n}, ${matched}. A wide group: differences may reflect size, market, or mission rather than performance.`
  } else if (size.value < 0.9) {
    level = "limited"
    reason = `${n}, ${matched}. A close match, but under 10 hospitals, so one unusual peer moves the median.`
  } else {
    level = "strong"
    reason = `${n}, ${matched}.`
  }
  return { level, label: PEER_FIT_LABEL[level], reason }
}
