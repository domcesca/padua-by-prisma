import "server-only"

import { getFacilities, getManifest, getMetrics } from "@/lib/data/hafd"
import type { Facility, FacilityYearMetrics, PayerGroup, PayerMix } from "@/lib/data/types"
import type { PeerFilters } from "./filters"

export const TREND_METRICS = ["operatingMargin", "daysCashOnHand", "occupancy", "edVisits"] as const
export type TrendMetric = (typeof TREND_METRICS)[number]

export type SeriesPoint = {
  year: number
  value: number | null
  median: number | null
  p25: number | null
  p75: number | null
  /** Peers with a value this year. */
  n: number
  /** Share of peers (0–1) this hospital is above. Null when there's no value or peers. */
  percentile: number | null
  annualized: boolean
  status: string | null
}

export type PayerMixComparison = {
  year: number
  revenue: { facility: PayerMix | null; peers: PayerMix | null; n: number }
  days: { facility: PayerMix | null; peers: PayerMix | null; n: number }
}

export type BenchmarkResult = {
  facility: Facility
  filters: PeerFilters
  years: number[]
  peers: { id: string; name: string; county: string | null; beds: number | null }[]
  series: Record<TrendMetric, SeriesPoint[]>
  payerMix: PayerMixComparison | null
}

const PAYER_GROUPS: PayerGroup[] = ["medicare", "medical", "commercial", "indigent", "other"]

export function matchesFilters(f: Facility, filters: PeerFilters, typeOfCare: string | null) {
  if (!filters.includeNonComparable && f.hospitalType !== "Comparable") return false
  // Compare like with like: a general acute hospital is benchmarked against
  // general acute hospitals, a children's hospital against children's, etc.
  if (typeOfCare && f.typeOfCare !== typeOfCare) return false
  if (filters.counties.length && (!f.county || !filters.counties.includes(f.county))) return false
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

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return null
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

function percentileRank(sorted: number[], value: number) {
  if (!sorted.length) return null
  let below = 0
  let equal = 0
  for (const v of sorted) {
    if (v < value) below++
    else if (v === value) equal++
  }
  return (below + equal / 2) / sorted.length
}

function averageMix(mixes: PayerMix[]): PayerMix | null {
  if (!mixes.length) return null
  const out = {} as PayerMix
  for (const g of PAYER_GROUPS) out[g] = mixes.reduce((sum, m) => sum + (m[g] ?? 0), 0) / mixes.length
  return out
}

export async function computeBenchmark(facilityId: string, filters: PeerFilters): Promise<BenchmarkResult | null> {
  const [facilities, metrics, manifest] = await Promise.all([getFacilities(), getMetrics(), getManifest()])
  const facility = facilities.find((f) => f.id === facilityId)
  if (!facility) return null

  const peers = facilities.filter((f) => f.id !== facility.id && matchesFilters(f, filters, facility.typeOfCare))
  const years = manifest.years
  const own = metrics[facility.id] ?? {}

  const series = {} as Record<TrendMetric, SeriesPoint[]>
  for (const metric of TREND_METRICS) {
    series[metric] = years.map((year) => {
      const values = peers
        .map((p) => metrics[p.id]?.[year]?.[metric])
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
        .sort((a, b) => a - b)
      const mine: FacilityYearMetrics | undefined = own[year]
      const value = typeof mine?.[metric] === "number" ? (mine[metric] as number) : null
      return {
        year,
        value,
        median: quantile(values, 0.5),
        p25: quantile(values, 0.25),
        p75: quantile(values, 0.75),
        n: values.length,
        percentile: value != null ? percentileRank(values, value) : null,
        annualized: mine?.annualized ?? false,
        status: mine?.status ?? null,
      }
    })
  }

  // Payer mix for the latest year this hospital reported.
  const latestYear = [...years].reverse().find((y) => own[y])
  let payerMix: PayerMixComparison | null = null
  if (latestYear != null) {
    const pick = (key: "payerMixRevenue" | "payerMixDays") => {
      const peerMixes = peers.map((p) => metrics[p.id]?.[latestYear]?.[key]).filter((m): m is PayerMix => !!m)
      return { facility: own[latestYear]?.[key] ?? null, peers: averageMix(peerMixes), n: peerMixes.length }
    }
    payerMix = { year: latestYear, revenue: pick("payerMixRevenue"), days: pick("payerMixDays") }
  }

  return {
    facility,
    filters,
    years,
    peers: peers
      .map((p) => ({ id: p.id, name: p.name, county: p.county, beds: p.licensedBeds }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    series,
    payerMix,
  }
}
