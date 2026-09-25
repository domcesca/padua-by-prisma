import type { Ownership } from "@/lib/data/types"

// Peer-group filters, shared by the Benchmark UI, the API route, and the URL.

export type TeachingFilter = "any" | "teaching" | "rural" | "neither"

export type PeerFilters = {
  counties: string[]
  ownership: Ownership[]
  bedsMin: number | null
  bedsMax: number | null
  teaching: TeachingFilter
  /** Include hospitals HCAI marks non-comparable (Kaiser, PHF, State, LTC emphasis). */
  includeNonComparable: boolean
}

export const DEFAULT_FILTERS: PeerFilters = {
  counties: [],
  ownership: [],
  bedsMin: null,
  bedsMax: null,
  teaching: "any",
  includeNonComparable: false,
}

export const OWNERSHIP_OPTIONS: { value: Ownership; label: string }[] = [
  { value: "nonprofit", label: "Nonprofit" },
  { value: "investor", label: "Investor-owned" },
  { value: "district", label: "District" },
  { value: "government", label: "County / City" },
  { value: "state", label: "State" },
]

export const OWNERSHIP_LABEL: Record<Ownership, string> = {
  nonprofit: "Nonprofit",
  investor: "Investor-owned",
  district: "District",
  government: "County / City",
  state: "State",
  other: "Other",
}

export const BED_PRESETS: { label: string; min: number | null; max: number | null }[] = [
  { label: "Any size", min: null, max: null },
  { label: "Under 100", min: null, max: 99 },
  { label: "100–199", min: 100, max: 199 },
  { label: "200–349", min: 200, max: 349 },
  { label: "350+", min: 350, max: null },
]

const OWNERSHIP_VALUES = new Set(OWNERSHIP_OPTIONS.map((o) => o.value))
const TEACHING_VALUES = new Set<TeachingFilter>(["any", "teaching", "rural", "neither"])

type ParamSource = { get(name: string): string | null }

function intOrNull(value: string | null) {
  if (value == null || value === "") return null
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function list(value: string | null) {
  return value ? value.split(",").map((s) => s.trim()).filter(Boolean) : []
}

export function parseFilters(params: ParamSource): PeerFilters {
  const teaching = params.get("teaching") as TeachingFilter | null
  return {
    counties: list(params.get("county")),
    ownership: list(params.get("ownership")).filter((o): o is Ownership => OWNERSHIP_VALUES.has(o as Ownership)),
    bedsMin: intOrNull(params.get("bedsMin")),
    bedsMax: intOrNull(params.get("bedsMax")),
    teaching: teaching && TEACHING_VALUES.has(teaching) ? teaching : "any",
    includeNonComparable: params.get("all") === "1",
  }
}

/** Serialize only non-default values so URLs stay short and shareable. */
export function filtersToParams(filters: PeerFilters, params = new URLSearchParams()) {
  const set = (key: string, value: string | null) => (value ? params.set(key, value) : params.delete(key))
  set("county", filters.counties.join(","))
  set("ownership", filters.ownership.join(","))
  set("bedsMin", filters.bedsMin != null ? String(filters.bedsMin) : null)
  set("bedsMax", filters.bedsMax != null ? String(filters.bedsMax) : null)
  set("teaching", filters.teaching !== "any" ? filters.teaching : null)
  set("all", filters.includeNonComparable ? "1" : null)
  return params
}

export function isDefaultFilters(f: PeerFilters) {
  return (
    f.counties.length === 0 &&
    f.ownership.length === 0 &&
    f.bedsMin == null &&
    f.bedsMax == null &&
    f.teaching === "any" &&
    !f.includeNonComparable
  )
}
