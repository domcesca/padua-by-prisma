// A report is a small, fully declarative config: which metrics, which chart,
// how to group. The Build page edits one through controls; the server
// validates and runs it (./run.ts). Anything that can produce a ReportSpec —
// a saved report, a shared link, or later a natural-language front end —
// gets the same charts without touching the rendering code.

export type ChartKind = "bar" | "line" | "table"

/**
 * year      — one line/bar series per hospital across years
 * facility  — hospitals side by side for one year
 * peerGroup — the hospital against its peer group's median and middle 50%
 */
export type GroupBy = "year" | "facility" | "peerGroup"

/** For groupBy "facility": which hospitals appear next to the focus hospital. */
export type HospitalSet = "peers" | "picked"

export type ReportSpec = {
  facilityId: string | null
  /** Catalog metric ids; each gets its own panel (never two scales on one axis). */
  metrics: string[]
  chart: ChartKind
  groupBy: GroupBy
  /** Extra hospitals to compare (groupBy "year", or "facility" with hospitals = "picked"). */
  compare: string[]
  hospitals: HospitalSet
  peers: "similar" | "statewide"
  /** Snapshot year for "facility" and bar/table "peerGroup"; null = latest with data. */
  year: number | null
}

export const MAX_METRICS = 4
export const MAX_COMPARE = 4
/** Most hospitals drawn in a "facility" chart from a peer group. */
export const MAX_PEER_BARS = 20

export const DEFAULT_SPEC: ReportSpec = {
  facilityId: null,
  metrics: [],
  chart: "line",
  groupBy: "year",
  compare: [],
  hospitals: "peers",
  peers: "similar",
  year: null,
}

/** Line charts need an ordered x-axis; hospitals side by side can't be a line. */
export const chartAllowed = (chart: ChartKind, groupBy: GroupBy) => !(chart === "line" && groupBy === "facility")

type ParamSource = { get(name: string): string | null }

const list = (v: string | null) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [])

export function parseSpec(params: ParamSource, validMetricIds?: Set<string>): ReportSpec {
  const chart = params.get("chart")
  const group = params.get("group")
  const year = Number.parseInt(params.get("year") ?? "", 10)
  const spec: ReportSpec = {
    facilityId: params.get("facility") || null,
    metrics: list(params.get("metrics"))
      .filter((m) => !validMetricIds || validMetricIds.has(m))
      .slice(0, MAX_METRICS),
    chart: chart === "bar" || chart === "table" || chart === "line" ? chart : DEFAULT_SPEC.chart,
    groupBy: group === "facility" || group === "peerGroup" || group === "year" ? group : DEFAULT_SPEC.groupBy,
    compare: [...new Set(list(params.get("compare")))].slice(0, MAX_COMPARE),
    hospitals: params.get("hospitals") === "picked" ? "picked" : "peers",
    peers: params.get("peers") === "statewide" ? "statewide" : "similar",
    year: Number.isFinite(year) && year > 1990 ? year : null,
  }
  if (!chartAllowed(spec.chart, spec.groupBy)) spec.chart = "bar"
  return spec
}

export function specToParams(spec: ReportSpec) {
  const p = new URLSearchParams()
  if (spec.facilityId) p.set("facility", spec.facilityId)
  if (spec.metrics.length) p.set("metrics", spec.metrics.join(","))
  p.set("chart", spec.chart)
  p.set("group", spec.groupBy)
  if (spec.compare.length) p.set("compare", spec.compare.join(","))
  if (spec.groupBy === "facility" && spec.hospitals === "picked") p.set("hospitals", "picked")
  if (spec.peers === "statewide") p.set("peers", "statewide")
  if (spec.year != null) p.set("year", String(spec.year))
  return p
}

// -- results ----------------------------------------------------------------------

export type SeriesRole = "focus" | "compare" | "peer" | "state"

export type ReportSeries = { key: string; label: string; role: SeriesRole; facilityId?: string }

/** One metric's result: a small table the chart and the table view both read. */
export type ReportPanel = {
  metricId: string
  /** What each row is: a year, a hospital, or a statistic. */
  rowKind: "year" | "facility" | "stat"
  series: ReportSeries[]
  rows: ({ key: string; label: string; role?: SeriesRole } & Record<string, number | string | null | undefined>)[]
  /** The single year shown, for snapshot groupings. */
  year: number | null
  note: string | null
}

export type ReportResult = {
  spec: ReportSpec
  title: string
  subtitle: string
  panels: ReportPanel[]
  peerGroup: { description: string; count: number } | null
}
