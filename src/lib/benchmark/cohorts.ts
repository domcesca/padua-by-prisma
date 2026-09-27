import { bedBandFor, DEFAULT_FILTERS, EMPTY_FILTERS, ownershipGroup, type PeerFilters } from "./filters"

// Peer-group presets: named shortcuts onto the existing peer filters (filters.ts), filled in from the hospital's own
// characteristics. Picking one sets the same filters a person could set by hand; nothing new is filtered on.
//
//   Similar hospitals        — the default: nearby, same size band and ownership, widening until at least 5
//   Local market             — every comparable hospital within 25 miles, whatever its size or owner
//   Similar operating model  — same ownership type, size band, and teaching/rural status, anywhere in California
//   Academic centers         — teaching hospitals statewide
//   Statewide                — every comparable California hospital of the same type of care

export type CohortId = "similar" | "local" | "operating" | "academic" | "statewide"

/** What a preset needs to know about the hospital. */
export type CohortFacility = {
  licensedBeds: number | null
  ownership: PeerFilters["ownership"][number]
  teaching: boolean
  rural: boolean
}

export const COHORTS: { id: CohortId; label: string; description: string }[] = [
  { id: "similar", label: "Similar hospitals", description: "Nearby, same size band and ownership; widens until there are at least 5." },
  { id: "local", label: "Local market", description: "Every comparable hospital within 25 miles, whatever its size or owner." },
  { id: "operating", label: "Similar operating model", description: "Same ownership type, size band, and teaching or rural status, anywhere in California." },
  { id: "academic", label: "Academic centers", description: "Teaching hospitals statewide." },
  { id: "statewide", label: "Statewide", description: "Every comparable California hospital of the same type of care." },
]

export const COHORT_BY_ID = new Map(COHORTS.map((c) => [c.id, c]))

export const LOCAL_MARKET_MILES = 25

/** The filters a preset stands for, for this hospital. `includeNonComparable` carries over from the current filters. */
export function cohortFilters(id: CohortId, facility: CohortFacility | null, includeNonComparable = false): PeerFilters {
  const base = { ...EMPTY_FILTERS, includeNonComparable }
  switch (id) {
    case "similar":
      return { ...DEFAULT_FILTERS, includeNonComparable }
    case "statewide":
      return { mode: "statewide", ...base }
    case "local":
      return { mode: "custom", ...base, radiusMiles: LOCAL_MARKET_MILES }
    case "academic":
      return { mode: "custom", ...base, teaching: "teaching" }
    case "operating": {
      const band = facility ? bedBandFor(facility.licensedBeds) : null
      return {
        mode: "custom",
        ...base,
        ownership: facility ? ownershipGroup(facility.ownership) : [],
        bedsMin: band?.min ?? null,
        bedsMax: band?.max ?? null,
        teaching: !facility ? "any" : facility.teaching ? "teaching" : facility.rural ? "rural" : "neither",
      }
    }
  }
}

const key = (f: PeerFilters) =>
  JSON.stringify([
    f.mode,
    [...f.counties].sort(),
    f.radiusMiles,
    [...f.ownership].sort(),
    f.bedsMin,
    f.bedsMax,
    f.teaching,
  ])

/** Which preset the requested filters are, or null for a hand-made group. */
export function cohortOf(filters: PeerFilters, facility: CohortFacility | null): CohortId | null {
  if (filters.mode === "similar") return "similar"
  if (filters.mode === "statewide") return "statewide"
  const k = key(filters)
  for (const c of COHORTS) if (key(cohortFilters(c.id, facility, filters.includeNonComparable)) === k) return c.id
  return null
}
