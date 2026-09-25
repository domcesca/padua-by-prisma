import type { Facility } from "@/lib/data/types"
import {
  bedBandFor,
  bedsLabel,
  EMPTY_FILTERS,
  OWNERSHIP_LABEL,
  ownershipGroup,
  type PeerFilters,
} from "./filters"

// Peer-group resolution. "Similar hospitals" is a geographic + characteristic
// proxy: same county (or nearest hospitals by straight-line distance), same
// bed-size band, same ownership type. It is NOT a service area — a true
// primary/secondary service area needs patient-origin (ZIP-level discharge)
// data, which HCAI releases only through a formal data request.

/** Fewest peers a "similar hospitals" group may have before it widens. */
export const MIN_PEERS = 5

export type PeerGroup = {
  /** Filters actually applied (for "similar", the ones chosen automatically). */
  filters: PeerFilters
  /** One line describing who's in the group, e.g. "Nonprofit hospitals with 100–299 beds in Fresno County". */
  description: string
  /** Why "similar" had to widen, if it did. */
  note: string | null
}

export function milesBetween(a: { latitude: number | null; longitude: number | null }, b: typeof a) {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return null
  const rad = Math.PI / 180
  const dLat = (b.latitude - a.latitude) * rad
  const dLng = (b.longitude - a.longitude) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2
  return 3958.8 * 2 * Math.asin(Math.sqrt(h))
}

export function matchesFilters(f: Facility, filters: PeerFilters, origin: Facility) {
  if (!filters.includeNonComparable && f.hospitalType !== "Comparable") return false
  // Compare like with like: a general acute hospital is benchmarked against
  // general acute hospitals, a children's hospital against children's, etc.
  if (origin.typeOfCare && f.typeOfCare !== origin.typeOfCare) return false
  if (filters.counties.length && (!f.county || !filters.counties.includes(f.county))) return false
  if (filters.radiusMiles != null) {
    const d = milesBetween(origin, f)
    if (d == null || d > filters.radiusMiles) return false
  }
  if (filters.ownership.length && !filters.ownership.includes(f.ownership)) return false
  const beds = f.licensedBeds ?? null
  if (filters.bedsMin != null && (beds == null || beds < filters.bedsMin)) return false
  if (filters.bedsMax != null && (beds == null || beds > filters.bedsMax)) return false
  switch (filters.teaching) {
    case "teaching":
      return f.teaching
    case "rural":
      return f.rural
    case "neither":
      return !f.teaching && !f.rural
    default:
      return true
  }
}

const lastYear = (f: Facility) => Math.max(f.financialYears.at(-1) ?? 0, f.utilizationYears.at(-1) ?? 0)

/** Hospitals that reported in either of the two latest years (closed hospitals drop out). */
function activeFacilities(all: Facility[]) {
  const latest = Math.max(...all.map(lastYear))
  return all.filter((f) => lastYear(f) >= latest - 1)
}

const peersFor = (facility: Facility, all: Facility[], filters: PeerFilters) =>
  all.filter((f) => f.id !== facility.id && matchesFilters(f, filters, facility))

/** Candidate groups for "similar", narrowest first. */
function similarCandidates(facility: Facility, includeNonComparable: boolean): PeerFilters[] {
  const band = bedBandFor(facility.licensedBeds)
  const beds = band ? { bedsMin: band.min, bedsMax: band.max } : {}
  const own = { ownership: ownershipGroup(facility.ownership) }
  const county = facility.county ? { counties: [facility.county] } : null
  const located = facility.latitude != null && facility.longitude != null
  const make = (patch: Partial<PeerFilters>): PeerFilters => ({
    mode: "similar",
    ...EMPTY_FILTERS,
    includeNonComparable,
    ...patch,
  })
  const near = (radiusMiles: number, extra: Partial<PeerFilters>) => (located ? [make({ radiusMiles, ...extra })] : [])
  // Stay local before matching ownership from farther away: a hospital's
  // market is its neighbors, whoever owns them.
  return [
    ...(county ? [make({ ...county, ...beds, ...own })] : []),
    ...near(25, { ...beds, ...own }),
    ...(county ? [make({ ...county, ...beds })] : []),
    ...near(50, { ...beds, ...own }),
    ...near(50, beds),
    ...near(100, { ...beds, ...own }),
    ...near(100, beds),
    make({ ...beds, ...own }),
    make(beds),
    make({}),
  ]
}

/** "Nonprofit general acute hospitals with 100–299 beds in Fresno County" (or "1 … hospital" with a count). */
export function describeFilters(f: PeerFilters, facility: Facility, count?: number) {
  const own =
    f.ownership.length === 0
      ? null
      : f.ownership.length === 1
        ? OWNERSHIP_LABEL[f.ownership[0]].toLowerCase()
        : f.ownership.every((o) => ["government", "state", "other"].includes(o))
          ? "public"
          : `${f.ownership.length} ownership types of`
  const kind = facility.typeOfCare?.toLowerCase() === "general" ? "general acute" : facility.typeOfCare?.toLowerCase()
  const bedLabel = bedsLabel(f.bedsMin, f.bedsMax)
  const beds = bedLabel ? bedLabel.charAt(0).toLowerCase() + bedLabel.slice(1) : null
  const where =
    f.radiusMiles != null
      ? `within ${f.radiusMiles} miles`
      : f.counties.length === 1
        ? `in ${f.counties[0]} County`
        : f.counties.length > 1
          ? `in ${f.counties.length} counties`
          : "statewide"
  const noun = count === 1 ? "hospital" : "hospitals"
  const who = [count == null ? null : count === 0 ? "no" : String(count), own, kind, noun].filter(Boolean).join(" ")
  const teaching =
    f.teaching === "teaching" ? ", teaching only" : f.teaching === "rural" ? ", small & rural only" : f.teaching === "neither" ? ", excluding teaching and rural" : ""
  const text = `${who}${beds ? ` with ${beds}` : ""} ${where}${teaching}`
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** The peer group a Benchmark request actually uses. */
export function resolvePeerGroup(facility: Facility, everyone: Facility[], requested: PeerFilters): PeerGroup & { peers: Facility[] } {
  const all = activeFacilities(everyone)
  if (requested.mode === "statewide") {
    const filters: PeerFilters = { mode: "statewide", ...EMPTY_FILTERS, includeNonComparable: requested.includeNonComparable }
    return { filters, peers: peersFor(facility, all, filters), description: describeFilters(filters, facility), note: null }
  }
  if (requested.mode === "custom") {
    return {
      filters: requested,
      peers: peersFor(facility, all, requested),
      description: describeFilters(requested, facility),
      note: null,
    }
  }

  const candidates = similarCandidates(facility, requested.includeNonComparable)
  const first = { filters: candidates[0], peers: peersFor(facility, all, candidates[0]) }
  let chosen = first
  for (const filters of candidates) {
    const peers = peersFor(facility, all, filters)
    chosen = { filters, peers }
    if (peers.length >= MIN_PEERS) break
  }
  const widened = chosen.filters !== first.filters
  return {
    ...chosen,
    description: describeFilters(chosen.filters, facility),
    note: widened
      ? `There ${first.peers.length === 1 ? "is" : "are"} ${describeFilters(first.filters, facility, first.peers.length).replace(/^./, (c) => c.toLowerCase())}, so the group widens to reach at least ${MIN_PEERS}.`
      : null,
  }
}
