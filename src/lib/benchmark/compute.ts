import "server-only"

import { applyPayerView, CATEGORY_BY_ID, type MetricDef, type PayerView } from "@/lib/data/datasets"
import { getFacilities, getManifest, getMetricCatalog, getMetrics } from "@/lib/data/store"
import type { Facility, MetricCategory, MetricsFile, PayerGroup, PayerMix } from "@/lib/data/types"
import type { PeerFilters } from "./filters"
import { milesBetween, resolvePeerGroup } from "./peers"

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

export type PeerSummary = { id: string; name: string; county: string | null; beds: number | null; distance?: number | null }

export type BenchmarkResult = {
  facility: Facility
  category: MetricCategory
  payer: PayerView
  /** Metric ids shown, in order, after the payer view is applied (keys of `series`). */
  metrics: string[]
  /** Filters actually applied; for "similar" these are the ones chosen automatically. */
  filters: PeerFilters
  peerGroup: { description: string; note: string | null }
  peers: PeerSummary[]
  /** metric id -> one point per year of that metric's dataset. */
  series: Record<string, SeriesPoint[]>
  payerMix: PayerMixComparison | null
}

const PAYER_GROUPS: PayerGroup[] = ["medicare", "medical", "commercial", "indigent", "other"]

export function quantile(sorted: number[], q: number) {
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

/** A metric's numeric value for one facility-year, or null. */
export function metricValue(file: MetricsFile, facilityId: string, year: number, key: string): number | null {
  const v = file[facilityId]?.[year]?.[key]
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

/** Hospital vs peer distribution for one metric across its dataset's years. */
export async function metricSeries(
  metric: MetricDef,
  facilityId: string | null,
  peerIds: string[],
  since: number | null = null
): Promise<SeriesPoint[]> {
  const [file, manifest] = await Promise.all([getMetrics(metric.dataset), getManifest(metric.dataset)])
  return manifest.years.filter((y) => since == null || y >= since).map((year) => {
    const values = peerIds
      .map((id) => metricValue(file, id, year, metric.id))
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b)
    const row = facilityId ? file[facilityId]?.[year] : undefined
    const value = facilityId ? metricValue(file, facilityId, year, metric.id) : null
    return {
      year,
      value,
      median: quantile(values, 0.5),
      p25: quantile(values, 0.25),
      p75: quantile(values, 0.75),
      n: values.length,
      percentile: value != null ? percentileRank(values, value) : null,
      annualized: row?.annualized ?? false,
      status: row?.status ?? null,
    }
  })
}

export async function computeBenchmark({
  facilityId,
  filters,
  category,
  metricIds,
  since = null,
  payer = "all",
}: {
  facilityId: string
  filters: PeerFilters
  category: MetricCategory
  /** Metrics to compute; defaults to the category's defaults. */
  metricIds?: string[]
  /** Payer lens applied to metricIds (see applyPayerView). */
  payer?: PayerView
  /** First year to include. */
  since?: number | null
}): Promise<BenchmarkResult | null> {
  const [facilities, catalog] = await Promise.all([getFacilities(), getMetricCatalog()])
  const facility = facilities.find((f) => f.id === facilityId)
  if (!facility) return null

  const group = resolvePeerGroup(facility, facilities, filters)
  const peers = group.peers
  const peerIds = peers.map((p) => p.id)

  const wanted = applyPayerView(metricIds?.length ? metricIds : CATEGORY_BY_ID[category].defaultMetrics, payer, catalog)
  const metrics = wanted
    .map((id) => catalog.find((m) => m.id === id))
    .filter((m): m is MetricDef => !!m && m.unit !== "share")

  const series: Record<string, SeriesPoint[]> = {}
  await Promise.all(
    metrics.map(async (m) => {
      series[m.id] = await metricSeries(m, facility.id, peerIds, since)
    })
  )

  return {
    facility,
    category,
    payer,
    metrics: metrics.map((m) => m.id),
    filters: group.filters,
    peerGroup: { description: group.description, note: group.note },
    peers: peers
      .map((p) => {
        const miles = milesBetween(facility, p)
        return { id: p.id, name: p.name, county: p.county, beds: p.licensedBeds, distance: miles != null ? Math.round(miles) : null }
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    series,
    payerMix: category === "financial" ? await payerMix(facility.id, peerIds) : null,
  }
}

/** Payer mix for the latest year this hospital reported financials. */
async function payerMix(facilityId: string, peerIds: string[]): Promise<PayerMixComparison | null> {
  const [file, manifest] = await Promise.all([getMetrics("hafd-selected"), getManifest("hafd-selected")])
  const own = file[facilityId] ?? {}
  const year = [...manifest.years].reverse().find((y) => own[y])
  if (year == null) return null
  const pick = (key: "payerMixRevenue" | "payerMixDays") => {
    const peerMixes = peerIds.map((id) => file[id]?.[year]?.[key] as PayerMix | null | undefined).filter((m): m is PayerMix => !!m)
    return { facility: (own[year]?.[key] as PayerMix | null) ?? null, peers: averageMix(peerMixes), n: peerMixes.length }
  }
  return { year, revenue: pick("payerMixRevenue"), days: pick("payerMixDays") }
}
