import "server-only"

import {
  applyPayerView,
  CATEGORY_BY_ID,
  supportsUnits,
  UNIT_DEFAULT_METRICS,
  UNIT_METRICS,
  type MetricDef,
  type PayerView,
} from "@/lib/data/datasets"
import { getSourceStatus, type SourceStatus } from "@/lib/data/freshness"
import { getCommunityContext, getFacilities, getFacilityUnits, getManifest, getMetricCatalog, getMetrics, getPublishedYears } from "@/lib/data/store"
import type { CommunityContext, DatasetId, Facility, FacilityUnit, MetricCategory, MetricsFile, PayerGroup, PayerMix, PointDetail } from "@/lib/data/types"
import type { PeerFilters } from "./filters"
import { milesBetween, resolvePeerGroup } from "./peers"
import { computeServiceLines, getFacilityLines, lineSource, type FacilityLine, type ServiceLineRollup } from "@/lib/service-lines/compute"
import { isCombined, SERVICE_LINE_BY_ID } from "@/lib/service-lines/lines"
import { getUnitInfo, lineMetricDef, unitMetricDef, unitSource, type UnitSource } from "./units"

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
  /** HCAI's audit status on the hospital's report that year. */
  status: string | null
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
  /** Bed classifications this hospital has had licensed beds in (the unit picker's options). */
  units: FacilityUnit[]
  /** The unit shown, when narrowed to one: its unit-specific metric definitions and how many peers have it. */
  unit: (FacilityUnit & { peersWithUnit: { year: number; count: number }; definitions: Record<string, MetricDef> }) | null
  /** Service lines of more than one classification this hospital has had (the picker's options). */
  lines: FacilityLine[]
  /** The service line shown, when narrowed to one: as for a unit. */
  line: (FacilityLine & { peersWithUnit: { year: number; count: number }; definitions: Record<string, MetricDef> }) | null
  /** Every service line with its classifications, when a service line is asked for ("all" or one). */
  serviceLines: ServiceLineRollup | null
  /** Latest acute length of stay, average daily census, and case mix index, whatever the topic. */
  snapshot: { alos: Snapshot; adc: Snapshot; caseMixIndex: Snapshot }
  /** The hospital's county: Census demographics and Medi-Cal enrollment. Context, not a benchmark. */
  community: CommunityContext | null
  /** Caveats about this hospital's data in this category (e.g. reported together with another hospital). */
  notes: string[]
  payerMix: PayerMixComparison | null
  /** Per source shown: publication and processing dates, provisional years, and this hospital's record match (status lines). */
  sources: Partial<Record<DatasetId, SourceStatus>>
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
  since: number | null = null,
  /** Values from somewhere other than the metric's dataset (a unit's slice of utilization). */
  source?: UnitSource
): Promise<SeriesPoint[]> {
  const [file, manifest, published] = await Promise.all([
    source?.file ?? getMetrics(metric.dataset),
    getManifest(metric.dataset),
    source?.published ?? getPublishedYears(metric),
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
  unit: unitId = null,
  line: lineId = null,
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
  /** Bed classification to narrow utilization to (all payers only); null = whole hospital. */
  unit?: string | null
  /** Service line: "all" for the side-by-side table, or one line to narrow utilization to (all payers only). */
  line?: string | null
}): Promise<BenchmarkResult | null> {
  const [facilities, catalog] = await Promise.all([getFacilities(), getMetricCatalog()])
  const facility = facilities.find((f) => f.id === facilityId)
  if (!facility) return null

  const group = resolvePeerGroup(facility, facilities, filters)
  const peers = group.peers
  const peerIds = peers.map((p) => p.id)

  const [units, allLines] = await Promise.all([getFacilityUnits(facility.id), supportsUnits(category) ? getFacilityLines(facility.id) : []])
  const lines = allLines.filter((l) => isCombined(SERVICE_LINE_BY_ID.get(l.id)!))
  // Line view: a line of several classifications this hospital has; a one-classification line is that unit's view.
  const line = supportsUnits(category) ? (lines.find((l) => l.id === lineId) ?? null) : null
  // Unit view: utilization only, all payers only, and only a unit this hospital has.
  const unit = !line && supportsUnits(category) && units.some((u) => u.id === unitId) ? await getUnitInfo(unitId) : null
  const lineUnits = line ? (await Promise.all(line.units.map((id) => getUnitInfo(id)))).filter((u) => !!u) : []
  // The Medicare lens applies to financial and utilization metrics only.
  const lens = category === "quality" || unit || lineId ? "all" : payer
  let metrics: MetricDef[]
  let source: UnitSource | undefined
  if (unit || line) {
    const chosen = (metricIds ?? []).filter((id) => UNIT_METRICS.includes(id))
    metrics = (chosen.length ? chosen : UNIT_DEFAULT_METRICS)
      .map((id) => catalog.find((m) => m.id === id && m.dataset === "hau"))
      .filter((m): m is MetricDef => !!m)
      .map((m) => (line ? lineMetricDef(m, line, lineUnits) : unitMetricDef(m, unit!)))
    source = line ? await lineSource(line.id) : await unitSource(unit!.id)
  } else {
    metrics = applyPayerView(metricIds?.length ? metricIds : CATEGORY_BY_ID[category].defaultMetrics, lens, catalog)
      .map((id) => catalog.find((m) => m.id === id))
      .filter((m): m is MetricDef => !!m && m.unit !== "share")
  }
  const companions = metrics
    .map((m) => (m.companion ? catalog.find((c) => c.id === m.companion) : undefined))
    .filter((m): m is MetricDef => !!m)

  const series: Record<string, SeriesPoint[]> = {}
  await Promise.all(
    [...metrics, ...companions].map(async (m) => {
      series[m.id] = await metricSeries(m, facility.id, peerIds, since, source)
    })
  )

  return {
    facility,
    category,
    payer: lens,
    metrics: metrics.map((m) => m.id),
    units,
    unit: unit
      ? {
          ...units.find((u) => u.id === unit.id)!,
          peersWithUnit: peersWithUnit(source!, peerIds),
          definitions: Object.fromEntries(metrics.map((m) => [m.id, m])),
        }
      : null,
    lines,
    line: line
      ? { ...line, peersWithUnit: peersWithUnit(source!, peerIds), definitions: Object.fromEntries(metrics.map((m) => [m.id, m])) }
      : null,
    serviceLines: supportsUnits(category) && (line || lineId === "all") ? await computeServiceLines({ facilityId: facility.id, filters }) : null,
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
    sources: Object.fromEntries(
      await Promise.all(
        [...new Set([...metrics, ...companions].map((m) => m.dataset).concat(category === "financial" ? ["hafd-selected"] : []))].map(
          async (d) => [d, await getSourceStatus(d, facility.id)] as const
        )
      )
    ),
  }
}

/** Peers with this unit in the latest year any hospital reported it. */
function peersWithUnit(source: UnitSource, peerIds: string[]) {
  const year = Math.max(...source.published)
  return { year, count: peerIds.filter((id) => source.file[id]?.[year]).length }
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
  return { year, status: own[year]?.status ?? null, revenue: pick("payerMixRevenue"), days: pick("payerMixDays") }
}
