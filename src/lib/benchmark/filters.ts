import type { Ownership } from "@/lib/data/types"

// Peer-group filters, shared by the Benchmark UI, the API route, and the URL.

export type TeachingFilter = "any" | "teaching" | "rural" | "neither"

/**
 * similar   — picked automatically from the hospital's location, size, and ownership (default)
 * statewide — every comparable California hospital of the same type of care
 * custom    — whatever the filters below say
 */
export type PeerMode = "similar" | "statewide" | "custom"

export type PeerFilters = {
  mode: PeerMode
  counties: string[]
  /** Straight-line miles from the selected hospital. */
  radiusMiles: number | null
  ownership: Ownership[]
  bedsMin: number | null
  bedsMax: number | null
  teaching: TeachingFilter
  /** Include hospitals HCAI marks non-comparable (Kaiser, PHF, State, LTC emphasis). */
  includeNonComparable: boolean
}

export const EMPTY_FILTERS: Omit<PeerFilters, "mode" | "includeNonComparable"> = {
  counties: [],
  radiusMiles: null,
  ownership: [],
  bedsMin: null,
  bedsMax: null,
  teaching: "any",
}

export const DEFAULT_FILTERS: PeerFilters = { mode: "similar", ...EMPTY_FILTERS, includeNonComparable: false }

export const OWNERSHIP_OPTIONS: { value: Ownership; label: string }[] = [
  { value: "nonprofit", label: "Nonprofit" },
  { value: "investor", label: "Investor-owned" },
  { value: "district", label: "District" },
  { value: "government", label: "County / City / UC" },
  { value: "state", label: "State" },
  { value: "other", label: "Other" },
]

export const OWNERSHIP_LABEL: Record<Ownership, string> = {
  nonprofit: "Nonprofit",
  investor: "Investor-owned",
  district: "District",
  government: "County / City / UC",
  state: "State",
  other: "Other",
}

/** The three bed-size bands the default peer group matches on. */
export const BED_BANDS: { label: string; min: number | null; max: number | null }[] = [
  { label: "Under 100", min: null, max: 99 },
  { label: "100–299", min: 100, max: 299 },
  { label: "300+", min: 300, max: null },
]

export const BED_PRESETS: { label: string; min: number | null; max: number | null }[] = [
  { label: "Any size", min: null, max: null },
  ...BED_BANDS,
]

export const RADIUS_OPTIONS = [10, 25, 50, 100] as const

const OWNERSHIP_VALUES = new Set(OWNERSHIP_OPTIONS.map((o) => o.value))
const TEACHING_VALUES = new Set<TeachingFilter>(["any", "teaching", "rural", "neither"])
const FILTER_KEYS = ["county", "within", "ownership", "bedsMin", "bedsMax", "teaching"]

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
  const peers = params.get("peers")
  // Links from V1 carry filters without ?peers=; treat those as custom.
  const mode: PeerMode =
    peers === "statewide" || peers === "custom"
      ? peers
      : FILTER_KEYS.some((k) => params.get(k))
        ? "custom"
        : "similar"
  return {
    mode,
    counties: list(params.get("county")),
    radiusMiles: intOrNull(params.get("within")),
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
  const custom = filters.mode === "custom"
  set("peers", filters.mode === "similar" ? null : filters.mode)
  set("county", custom ? filters.counties.join(",") : null)
  set("within", custom && filters.radiusMiles != null ? String(filters.radiusMiles) : null)
  set("ownership", custom ? filters.ownership.join(",") : null)
  set("bedsMin", custom && filters.bedsMin != null ? String(filters.bedsMin) : null)
  set("bedsMax", custom && filters.bedsMax != null ? String(filters.bedsMax) : null)
  set("teaching", custom && filters.teaching !== "any" ? filters.teaching : null)
  set("all", filters.includeNonComparable ? "1" : null)
  return params
}

export function isDefaultFilters(f: PeerFilters) {
  return f.mode === "similar" && !f.includeNonComparable
}

export function bedBandFor(beds: number | null) {
  if (beds == null) return null
  return BED_BANDS.find((b) => (b.min == null || beds >= b.min) && (b.max == null || beds <= b.max)) ?? null
}

/**
 * Ownership types matched by the default peer group: nonprofit, district, and
 * investor-owned match their own type; public and other owners match each other.
 */
export function ownershipGroup(o: Ownership): Ownership[] {
  return o === "nonprofit" || o === "district" || o === "investor" ? [o] : ["government", "state", "other"]
}

export function bedsLabel(min: number | null, max: number | null) {
  if (min == null && max == null) return null
  const preset = BED_PRESETS.find((p) => p.min === min && p.max === max)
  if (preset) return `${preset.label} beds`
  if (min != null && max != null) return `${min}–${max} beds`
  return min != null ? `${min}+ beds` : `Up to ${max} beds`
}
