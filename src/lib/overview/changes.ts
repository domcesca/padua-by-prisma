import type { SeriesPoint } from "@/lib/benchmark/compute"
import type { MetricDef } from "@/lib/data/datasets"
import { directionOf, metricStanding, trend, type Standing, type Trend } from "@/lib/favorability"
import { formatMetric } from "@/lib/format"

// The Overview's "What changed": a metric whose standing against peers, or whose trend, is different in its latest
// period from the period before. Nothing new is measured: the standing is the one each Compare card leads with
// (metricStanding: outside the middle half of peers on the favorable or unfavorable side), and the trend is the
// card's "Improving / Worsening from X in Y" (trend(), unchanged when the two values round to the same display).
// A metric counts as changed when either label differs between the two periods, and only between these labels:
//
//   standing — into or out of Unfavorable, or into or out of Favorable (Similar ↔ Favorable, Unfavorable ↔ Similar, …)
//   trend    — Worsening now and not in the period before (newly Worsening: what Guided mode always shows)
//
// Trend flips the other way (Improving after a Worsening year) aren't counted: across the 451 reporting hospitals
// year-to-year values often see-saw, and counting both directions of trend flips put a median 5 of ~8 measures per
// hospital in "changed". Moves up a band (out of Unfavorable, into Favorable) are counted, as improvements.
// Context metrics ("Direction depends on strategy") have neither label, so they never appear.

export type MetricChange = {
  metric: MetricDef
  /** The latest period and the one before it, as the cards word them ("2024", "Jul 2022–Jun 2025"). */
  period: string
  priorPeriod: string
  value: string
  /** The value in the period before, formatted. */
  priorValue: string
  /** Whether the value went up (for the trend arrow). */
  rising: boolean
  standing: { now: Standing; before: Standing } | null
  trend: { now: Trend; before: Trend | null } | null
  /** A step the wrong way (newly Unfavorable, out of Favorable, newly Worsening); otherwise a move up a band. */
  worse: boolean
}

export type ChangeScan = {
  changes: MetricChange[]
  /** Metrics that had two periods to compare, and each topic's latest and prior period, for the "no changes" line. */
  checked: number
  periods: { latest: string; prior: string }[]
}

/** A point's period for use mid-sentence, as the metric cards word it. */
export function periodOf(p: SeriesPoint) {
  const period = p.detail?.period
  if (!period) return String(p.year)
  const release = period.match(/^Published (.+)$/)
  return release ? `the ${release[1]} release` : period
}

const RANK: Record<Standing, number> = { favorable: 2, similar: 1, unfavorable: 0, depends: -1, fewPeers: -1 }
const judged = (s: Standing | null): s is "favorable" | "similar" | "unfavorable" => s === "favorable" || s === "similar" || s === "unfavorable"

function trendOf(metric: MetricDef, from: SeriesPoint | undefined, to: SeriesPoint | undefined): Trend | null {
  if (from?.value == null || to?.value == null) return null
  return trend(directionOf(metric.id), from.value, to.value, formatMetric(metric, from.value) === formatMetric(metric, to.value))
}

/** One metric's change between its latest published period with a value and the one before, or null. */
export function changeOf(metric: MetricDef, allPoints: SeriesPoint[]): MetricChange | "unchanged" | null {
  if (directionOf(metric.id) === "context") return null
  // As the cards do: trailing years the source hasn't published are left off.
  const lastPublished = allPoints.findLastIndex((p) => p.published)
  const withValue = (lastPublished >= 0 ? allPoints.slice(0, lastPublished + 1) : []).filter((p) => p.value != null)
  const [before2, before, latest] = [withValue.at(-3), withValue.at(-2), withValue.at(-1)]
  if (!latest || !before) return null

  const sNow = metricStanding(metric.id, latest.percentile, latest.n)
  const sBefore = metricStanding(metric.id, before.percentile, before.n)
  const standingMoved = judged(sNow) && judged(sBefore) && sNow !== sBefore

  const tNow = trendOf(metric, before, latest)
  const tBefore = trendOf(metric, before2, before)
  const trendMoved = tNow === "worsening" && tBefore !== "worsening"

  if (!standingMoved && !trendMoved) return "unchanged"
  return {
    metric,
    period: periodOf(latest),
    priorPeriod: periodOf(before),
    value: formatMetric(metric, latest.value),
    priorValue: formatMetric(metric, before.value),
    rising: latest.value! > before.value!,
    standing: standingMoved ? { now: sNow!, before: sBefore! } : null,
    trend: trendMoved ? { now: tNow!, before: tBefore } : null,
    worse: standingMoved ? RANK[sNow!] < RANK[sBefore!] : tNow === "worsening",
  }
}

/** Every change across a topic's metrics, steps the wrong way first. */
export function scanChanges(metrics: MetricDef[], series: Record<string, SeriesPoint[]>): ChangeScan {
  const changes: MetricChange[] = []
  const periods = new Map<string, { latest: string; prior: string }>()
  let checked = 0
  for (const m of metrics) {
    const points = series[m.id]
    if (!points) continue
    const c = changeOf(m, points)
    if (c == null) continue
    checked++
    if (c !== "unchanged") changes.push(c)
    const withValue = points.filter((p, i) => p.value != null && i <= points.findLastIndex((q) => q.published))
    const latest = withValue.at(-1)
    const prior = withValue.at(-2)
    if (latest && prior) {
      const key = `${periodOf(latest)}|${periodOf(prior)}`
      if (!periods.has(key)) periods.set(key, { latest: periodOf(latest), prior: periodOf(prior) })
    }
  }
  // Wrong-way steps first, standing moves before trend-only ones; otherwise the topic's own order.
  const weight = (c: MetricChange) => (c.worse ? 0 : 2) + (c.standing ? 0 : 1)
  changes.sort((a, b) => weight(a) - weight(b))
  return { changes, checked, periods: [...periods.values()] }
}
