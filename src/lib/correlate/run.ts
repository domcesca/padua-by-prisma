import "server-only"

import { metricValue } from "@/lib/benchmark/compute"
import { resolvePeerGroup } from "@/lib/benchmark/peers"
import { isTrendMetric, type MetricDef } from "@/lib/data/datasets"
import { getSourceStatus } from "@/lib/data/freshness"
import { getFacilities, getManifest, getMetricCatalog, getMetrics } from "@/lib/data/store"
import type { DatasetId } from "@/lib/data/types"
import {
  CONFOUNDER_MAX_R,
  CONFOUNDER_MIN_R,
  describeR,
  lowerLabel,
  MIN_POINTS,
  ROBUST_DELTA,
  SMALL_SAMPLE,
  type Confounder,
  type CorrelatePoint,
  type CorrelateResult,
  type CorrelateSpec,
} from "./spec"

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

/**
 * The outlier recheck: refit without each hospital in turn and keep the one whose removal moves r the most. Its effect
 * counts as meaningful when the plain-language reading changes (e.g. "Moderate positive" to "Weak positive") and r moves
 * by ROBUST_DELTA or more, so a nudge across a boundary (0.31 to 0.29) isn't flagged.
 */
export function outlierRecheck(points: CorrelatePoint[], r: number): CorrelateResult["robustness"] {
  if (points.length < MIN_POINTS + 1) return null
  let best: { i: number; r: number; rho: number } | null = null
  points.forEach((_, i) => {
    const f = fit(points.filter((_, j) => j !== i))
    if (f && (!best || Math.abs(f.r - r) > Math.abs(best.r - r))) best = { i, r: f.r, rho: f.rho }
  })
  if (!best) return null
  const { i, r: without, rho } = best as { i: number; r: number; rho: number }
  const p = points[i]
  return {
    without: { id: p.id, name: p.name, x: p.x, y: p.y, focus: p.focus },
    r: without,
    rho,
    changes: describeR(without) !== describeR(r) && Math.abs(without - r) >= ROBUST_DELTA,
  }
}

/**
 * Candidate third factors: the structural things that most often sit behind two hospital measures moving together —
 * size, volume, case mix, how full and how long, and who pays. Each is tested against this peer group's own data; only
 * those that move with both measures are suggested.
 */
const CONFOUNDER_CANDIDATES: { id: string; label?: string; dataset: DatasetId; get: (row: Record<string, unknown> | undefined) => number | null }[] = [
  ...(["licensedBeds", "discharges", "occupancy", "alos"] as const).map((id) => ({ id, dataset: "hau" as const, get: numberAt(id) })),
  { id: "caseMixIndex", dataset: "case-mix-index", get: numberAt("caseMixIndex") },
  { id: "medicareShare", label: "Medicare share of gross charges", dataset: "hafd-selected", get: payerShare("medicare") },
  { id: "mediCalShare", label: "Medi-Cal share of gross charges", dataset: "hafd-selected", get: payerShare("medical") },
]

function numberAt(key: string) {
  return (row: Record<string, unknown> | undefined) => {
    const v = row?.[key]
    return typeof v === "number" && Number.isFinite(v) ? v : null
  }
}

/** A payer group's share of gross patient revenue, as Compare's payer-mix card shows it. */
function payerShare(group: string) {
  return (row: Record<string, unknown> | undefined) => {
    const mix = row?.payerMixRevenue as Record<string, unknown> | undefined
    const v = mix?.[group]
    return typeof v === "number" && Number.isFinite(v) ? v : null
  }
}

async function suggestConfounders(
  points: CorrelatePoint[],
  year: number,
  exclude: string[],
  labelOf: (id: string) => string | undefined
): Promise<Confounder[]> {
  const out: Confounder[] = []
  for (const c of CONFOUNDER_CANDIDATES) {
    if (exclude.includes(c.id)) continue
    const file = await getMetrics(c.dataset)
    const triples = points.flatMap((p) => {
      const z = c.get(file[p.id]?.[year] as Record<string, unknown> | undefined)
      return z != null ? [{ x: p.x, y: p.y, z }] : []
    })
    if (triples.length < SMALL_SAMPLE) continue
    const xy = fit(triples)
    const xz = fit(triples.map((t) => ({ x: t.x, y: t.z })))
    const yz = fit(triples.map((t) => ({ x: t.y, y: t.z })))
    if (!xy || !xz || !yz) continue
    const [rx, ry] = [xz.r, yz.r]
    if (Math.abs(rx) < CONFOUNDER_MIN_R || Math.abs(ry) < CONFOUNDER_MIN_R) continue
    if (Math.abs(rx) > CONFOUNDER_MAX_R || Math.abs(ry) > CONFOUNDER_MAX_R) continue
    const partial = (xy.r - rx * ry) / Math.sqrt((1 - rx * rx) * (1 - ry * ry))
    out.push({ id: c.id, label: c.label ?? labelOf(c.id) ?? c.id, n: triples.length, rx, ry, rxy: xy.r, partial })
  }
  return out.sort((a, b) => Math.abs(b.rx * b.ry) - Math.abs(a.rx * a.ry)).slice(0, 3)
}

export async function runCorrelate(spec: CorrelateSpec): Promise<CorrelateResult | RunError> {
  const [facilities, catalog] = await Promise.all([getFacilities(), getMetricCatalog()])
  const focus = facilities.find((f) => f.id === spec.facilityId)
  if (!focus) return { error: "Choose a hospital.", status: 400 }
  const find = (id: string) => catalog.find((m): m is MetricDef => m.id === id && isTrendMetric(m))
  const mx = find(spec.x)
  const my = find(spec.y)
  if (!mx || !my || mx.id === my.id) return { error: "Choose two different metrics.", status: 400 }

  const group = resolvePeerGroup(focus, facilities, spec.peers)
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
  const stats = fit(points)
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
    stats,
    peerGroup: { description: group.description, count: group.peers.length, note: group.note, filters: group.filters },
    notes,
    sources: { x: await getSourceStatus(mx.dataset, focus.id), y: await getSourceStatus(my.dataset, focus.id) },
    latestYears: { x: manX.years.at(-1)!, y: manY.years.at(-1)! },
    robustness: stats ? outlierRecheck(points, stats.r) : null,
    confounders: stats ? await suggestConfounders(points, year, [mx.id, my.id], (id) => catalog.find((m) => m.id === id)?.label) : [],
  }
}
