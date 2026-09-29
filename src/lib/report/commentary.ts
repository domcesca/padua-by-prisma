import { lowerLabel } from "@/lib/correlate/spec"
import type { MetricDef } from "@/lib/data/datasets"
import { directionOf, metricStanding, STANDING_LABEL, trend, TREND_LABEL, type Standing, type Trend } from "@/lib/favorability"
import { formatMetric } from "@/lib/format"
import type { ReportPanel } from "./spec"

// One plain-language line per Reports chart (V7.5), for the printout and the CSV: what the chart says, in the words the
// rest of the app already uses. Over time, the latest value and its change from the year before as a card's trend
// ("improving from 1.2% in 2023"); ranked, the standing label and rank (the chart's RankLine); against peers, where the
// value sits among the group's percentiles. Nothing here is a new calculation: every number is on the chart.

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)

export function ordinalWord(n: number) {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

/** The chosen hospital's place among the hospitals in a ranked chart, as RankLine and the commentary word it. */
export function rankOf(panel: ReportPanel, metricId: string) {
  const ranked = panel.rows.filter((r) => num(r.value) != null)
  const focusRow = ranked.find((r) => r.role === "focus")
  if (!focusRow) return null
  const value = focusRow.value as number
  const rank = ranked.indexOf(focusRow) + 1
  const others = ranked.filter((r) => r.role !== "focus").map((r) => r.value as number)
  const below = others.filter((v) => v < value).length + others.filter((v) => v === value).length / 2
  const standing = metricStanding(metricId, others.length ? below / others.length : null, others.length)
  // Counted from the end the value is nearer, for a metric with a favorable direction ("3rd lowest", not "10th highest"
  // of 12), as rankText words percentiles; a context metric keeps counting from the top.
  const fromBottom = ranked.length - rank + 1
  const position =
    rank === 1
      ? "highest"
      : rank === ranked.length
        ? "lowest"
        : directionOf(metricId) !== "context" && fromBottom < rank
          ? `${ordinalWord(fromBottom)} lowest`
          : `${ordinalWord(rank)} highest`
  return { value, rank, count: ranked.length, position, standing }
}

/** The latest value over time and its change from the year before, as the by-year summary line shows it. */
export function latestChange(panel: ReportPanel, metric: MetricDef) {
  const focus = panel.series.find((s) => s.role === "focus")
  const peer = panel.series.find((s) => s.role === "peer")
  if (!focus) return null
  const withValue = panel.rows.filter((r) => num(r[focus.key]) != null)
  const latest = withValue.at(-1)
  if (!latest) return null
  const prior = withValue.at(-2) ?? null
  const value = latest[focus.key] as number
  const previous = prior ? (prior[focus.key] as number) : null
  const t: Trend | null =
    previous != null ? trend(directionOf(metric.id), previous, value, formatMetric(metric, previous) === formatMetric(metric, value)) : null
  return {
    name: focus.label,
    year: latest.label,
    value,
    prior: prior && previous != null ? { year: prior.label, value: previous } : null,
    trend: t,
    median: peer ? num(latest[peer.key]) : null,
  }
}

const standingPhrase = (s: Standing | null) => (s && s !== "fewPeers" ? ` (${STANDING_LABEL[s].toLowerCase()})` : "")

/** One sentence for a chart; null when the chosen hospital has nothing to say it about. */
export function panelCommentary(panel: ReportPanel, metric: MetricDef, facilityName: string): string {
  const label = metric.label
  const f = (v: number) => formatMetric(metric, v)

  if (panel.rowKind === "year") {
    const c = latestChange(panel, metric)
    if (!c) return `${facilityName} has no ${lowerLabel(label)} reported for these years.`
    let s = `${label} was ${f(c.value)} in ${c.year}`
    if (c.prior && c.trend) {
      s += c.trend === "unchanged" ? `, unchanged from ${c.prior.year}` : `, ${TREND_LABEL[c.trend].toLowerCase()} from ${f(c.prior.value)} in ${c.prior.year}`
    }
    if (c.median != null) s += `; the peer median was ${f(c.median)}`
    return `${s}.`
  }

  if (panel.rowKind === "facility") {
    const r = rankOf(panel, metric.id)
    if (!r) return `${facilityName} didn’t report ${lowerLabel(label)} for ${panel.year}.`
    return `At ${f(r.value)} in ${panel.year}, ${facilityName} was ${r.position} of ${r.count} hospitals charted${standingPhrase(r.standing)}.`
  }

  // "stat": the hospital against the peer group's 25th, 50th and 75th percentiles.
  const at = (key: string) => num(panel.rows.find((r) => r.key === key)?.value)
  const value = at("focus")
  const [p25, med, p75] = [at("p25"), at("median"), at("p75")]
  if (value == null) return `${facilityName} didn’t report ${lowerLabel(label)} for ${panel.year}.`
  if (med == null || p25 == null || p75 == null) return `${label} was ${f(value)} in ${panel.year}; too few peers reported to compare.`
  const where =
    value > p75
      ? `above the peer group’s top quarter (75th percentile ${f(p75)})`
      : value < p25
        ? `below the peer group’s bottom quarter (25th percentile ${f(p25)})`
        : f(value) === f(med)
          ? `at the peer median of ${f(med)}`
          : `${value > med ? "above" : "below"} the peer median of ${f(med)}, within the middle half (${f(p25)}–${f(p75)})`
  return `${label} was ${f(value)} in ${panel.year}, ${where}.`
}
