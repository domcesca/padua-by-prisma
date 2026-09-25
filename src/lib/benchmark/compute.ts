import "server-only"

import { applyPayerView, CATEGORY_BY_ID, type MetricDef, type PayerView } from "@/lib/data/datasets"
import { getCommunityContext, getFacilities, getManifest, getMetricCatalog, getMetrics, getPublishedYears } from "@/lib/data/store"
import type { CommunityContext, DatasetId, Facility, MetricCategory, MetricsFile, PayerGroup, PayerMix, PointDetail } from "@/lib/data/types"
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
  /** Whether the source published this metric for any hospital this year (false: not yet, or skipped). */
  published: boolean
  /** Period, significance, and caveats for this hospital's value (quality data). */
  detail?: PointDetail
}

export type PayerMixComparison = {
  year: number
  revenue: { facility: PayerMix | null; peers: PayerMix | null; n: number }
  days: { facility: PayerMix | null; peers: PayerMix | null; n: number }
}

/** The hospital's latest value of a headline metric, for the summary card. */
export type Snapshot = { value: number; year: number } | null

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
  /** metric id -> one point per year of that metric's dataset (companions included). */
  series: Record<string, SeriesPoint[]>
  /** Latest acute length of stay, average daily census, and case mix index, whatever the topic. */
  snapshot: { alos: Snapshot; adc: Snapshot; caseMixIndex: Snapshot }
  /** The hospital's county: Census demographics and Medi-Cal enrollment. Context, not a benchmark. */
  community: CommunityContext | null
  /** Caveats about this hospital's data in this category (e.g. reported together with another hospital). */
  notes: string[]
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
  const [file, manifest, published] = await Promise.all([
    getMetrics(metric.dataset),
    getManifest(metric.dataset),
    getPublishedYears(metric),
  ])
  return manifest.years.filter((y) => since == null || y >= since).map((year) => {
    const values = peerIds
      .map((id) => metricValue(file, id, year, metric.id))
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b)
    const row = facilityId ? file[facilityId]?.[year] : undefined
    const value = facilityId ? metricValue(file, facilityId, year, metric.id) : null
    const period = manifest.periods?.[metric.id]?.[year]
    const own = row?.detail?.[metric.id]
    const detail = own || period ? { ...(period ? { period } : {}), ...own } : undefined
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
      published: published.has(year),
      ...(detail ? { detail } : {}),
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

  // The Medicare lens applies to financial and utilization metrics only.
  const lens = category === "quality" ? "all" : payer
  const wanted = applyPayerView(metricIds?.length ? metricIds : CATEGORY_BY_ID[category].defaultMetrics, lens, catalog)
  const metrics = wanted
    .map((id) => catalog.find((m) => m.id === id))
    .filter((m): m is MetricDef => !!m && m.unit !== "share")
  const companions = metrics
    .map((m) => (m.companion ? catalog.find((c) => c.id === m.companion) : undefined))
    .filter((m): m is MetricDef => !!m)

  const series: Record<string, SeriesPoint[]> = {}
  await Promise.all(
    [...metrics, ...companions].map(async (m) => {
      series[m.id] = await metricSeries(m, facility.id, peerIds, since)
    })
  )

  return {
    facility,
    category,
    payer: lens,
    metrics: metrics.map((m) => m.id),
    notes: category === "quality" ? await qualityNotes(facility.id) : [],
    community: await getCommunityContext(facility.county),
    snapshot: {
      alos: await latestValue("hau", "alos", facility.id),
      adc: await latestValue("hau", "adc", facility.id),
      caseMixIndex: await latestValue("case-mix-index", "caseMixIndex", facility.id),
    },
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

async function latestValue(dataset: DatasetId, key: string, facilityId: string): Promise<Snapshot> {
  const file = await getMetrics(dataset)
  const years = Object.keys(file[facilityId] ?? {}).map(Number).sort((a, b) => b - a)
  for (const year of years) {
    const value = metricValue(file, facilityId, year, key)
    if (value != null) return { value, year }
  }
  return null
}

/** Hospitals whose CMS measures are published under another hospital's Medicare number. */
async function qualityNotes(facilityId: string): Promise<string[]> {
  const shared = (await getManifest("cms-care-compare")).sharedReporting?.[facilityId]
  if (!shared) return []
  return [
    `CMS certifies this hospital together with ${shared.reportedWithName} under one Medicare provider number (CCN ${shared.ccn}). Years without a Care Compare value of its own are included in ${shared.reportedWithName}’s combined result. Infection data from CDPH is this hospital’s own.`,
  ]
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
