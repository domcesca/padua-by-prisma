import "server-only"

import { metricValue } from "@/lib/benchmark/compute"
import { DEFAULT_FILTERS } from "@/lib/benchmark/filters"
import { resolvePeerGroup } from "@/lib/benchmark/peers"
import { isTrendMetric, type MetricDef } from "@/lib/data/datasets"
import { getFacilities, getManifest, getMetricCatalog, getMetrics } from "@/lib/data/store"
import type { DatasetId } from "@/lib/data/types"
import { lowerLabel, MIN_POINTS, type CorrelatePoint, type CorrelateResult, type CorrelateSpec } from "./spec"

type RunError = { error: string; status: number }

/** How each source counts a year, for the pairing caveat. */
const YEAR_KIND: Record<DatasetId, string> = {
  "hafd-selected": "the hospital's fiscal year",
  hau: "the calendar year",
  "case-mix-index": "the federal fiscal year (October–September)",
  "cms-care-compare": "a CMS measurement period of one to three years",
  "cdph-hai": "the calendar year",
}

/** Pearson correlation and least-squares line; null when there's no spread to correlate. */
export function fit(points: { x: number; y: number }[]) {
  const n = points.length
  if (n < MIN_POINTS) return null
  const mx = points.reduce((s, p) => s + p.x, 0) / n
  const my = points.reduce((s, p) => s + p.y, 0) / n
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (const p of points) {
    sxx += (p.x - mx) ** 2
    syy += (p.y - my) ** 2
    sxy += (p.x - mx) * (p.y - my)
  }
  if (sxx === 0 || syy === 0) return null
  const r = sxy / Math.sqrt(sxx * syy)
  const slope = sxy / sxx
  return { n, r, r2: r * r, slope, intercept: my - slope * mx, rho: spearman(points) }
}

/** Average ranks (1-based), ties sharing the mean of their positions. */
function ranks(values: number[]) {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0])
  const out = new Array<number>(values.length)
  for (let i = 0; i < order.length; ) {
    let j = i
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++
    for (let k = i; k <= j; k++) out[order[k][1]] = (i + j) / 2 + 1
    i = j + 1
  }
  return out
}

/** Spearman's rank correlation: Pearson r of the ranks, so one extreme hospital can't dominate. */
function spearman(points: { x: number; y: number }[]) {
  const rx = ranks(points.map((p) => p.x))
  const ry = ranks(points.map((p) => p.y))
  const n = points.length
  const m = (n + 1) / 2
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    sxy += (rx[i] - m) * (ry[i] - m)
    sxx += (rx[i] - m) ** 2
    syy += (ry[i] - m) ** 2
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0
}

export async function runCorrelate(spec: CorrelateSpec): Promise<CorrelateResult | RunError> {
  const [facilities, catalog] = await Promise.all([getFacilities(), getMetricCatalog()])
  const focus = facilities.find((f) => f.id === spec.facilityId)
  if (!focus) return { error: "Choose a hospital.", status: 400 }
  const find = (id: string) => catalog.find((m): m is MetricDef => m.id === id && isTrendMetric(m))
  const mx = find(spec.x)
  const my = find(spec.y)
  if (!mx || !my || mx.id === my.id) return { error: "Choose two different metrics.", status: 400 }

  const group = resolvePeerGroup(focus, facilities, { ...DEFAULT_FILTERS, mode: spec.peers })
  const hospitals = [focus, ...group.peers]
  const [fx, fy, manX, manY] = await Promise.all([getMetrics(mx.dataset), getMetrics(my.dataset), getManifest(mx.dataset), getManifest(my.dataset)])

  const pointsFor = (year: number): CorrelatePoint[] =>
    hospitals.flatMap((h) => {
      const x = metricValue(fx, h.id, year, mx.id)
      const y = metricValue(fy, h.id, year, my.id)
      return x != null && y != null ? [{ id: h.id, name: h.name, x, y, focus: h.id === focus.id }] : []
    })

  const shared = manX.years.filter((y) => manY.years.includes(y))
  const years = shared
    .map((year) => ({ year, n: pointsFor(year).length }))
    .filter((y) => y.n >= MIN_POINTS)
    .sort((a, b) => b.year - a.year)
  if (!years.length) {
    return { error: `Fewer than ${MIN_POINTS} hospitals in this group report both measures in the same year.`, status: 422 }
  }
  // Default: the newest year with close to the best coverage, so a thin just-published year doesn't win.
  const best = Math.max(...years.map((y) => y.n))
  const year =
    spec.year != null && years.some((y) => y.year === spec.year)
      ? spec.year
      : years.find((y) => y.n >= 0.8 * best)!.year

  const points = pointsFor(year)
  const notes: string[] = []
  const kinds = [YEAR_KIND[mx.dataset], YEAR_KIND[my.dataset]]
  if (kinds[0] !== kinds[1]) {
    notes.push(
      `${mx.label} covers ${kinds[0]} and ${lowerLabel(my.label)} covers ${kinds[1]}; each ${year} value is the period ending in ${year}, so they overlap but don't line up exactly.`
    )
  } else if (mx.dataset === "cms-care-compare") {
    notes.push(`Care Compare measurement periods span one to three years; ${year} values are the periods ending in ${year}.`)
  }

  return {
    spec: { ...spec, year: spec.year != null && spec.year === year ? year : null },
    facilityName: focus.name,
    year,
    years,
    points,
    missing: hospitals.length - points.length,
    focusReported: points.some((p) => p.focus),
    stats: fit(points),
    peerGroup: { description: group.description, count: group.peers.length },
    notes,
  }
}
