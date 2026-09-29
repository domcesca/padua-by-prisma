import type { ChartKind, GroupBy, HospitalSet, ReportSpec } from "./spec"

// Starting points for Reports (V7.5): each sets the measures, how they're compared and over what period, for a
// purpose an administrator actually has. Picking one only fills in the report's settings; everything stays editable,
// and the report runs on the same data and rules as one built by hand.

export type ReportTemplateId = "board" | "quality" | "trend" | "peers" | "custom"

export type ReportTemplate = {
  id: ReportTemplateId
  label: string
  /** What it's for, in one line. */
  purpose: string
  metrics: string[]
  groupBy: GroupBy
  chart: ChartKind
  hospitals: HospitalSet
  /** Latest N years for a chart over time; null = the latest year (snapshots) or every year. */
  last: number | null
}

export const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: "board",
    label: "Board performance snapshot",
    purpose: "Margin, cash, occupancy and star rating against the peer group, latest year.",
    metrics: ["operatingMargin", "daysCashOnHand", "occupancy", "overallStar"],
    groupBy: "peerGroup",
    chart: "bar",
    hospitals: "peers",
    last: null,
  },
  {
    id: "quality",
    label: "Quality trend",
    purpose: "Readmissions, patient rating, infections and safety over the last five years.",
    metrics: ["readmHospitalWide", "hcahpsRating", "clabsiSir", "psi90"],
    groupBy: "peerGroup",
    chart: "line",
    hospitals: "peers",
    last: 5,
  },
  {
    id: "trend",
    label: "Financial and utilization trend",
    purpose: "Margin, cost per case, occupancy and length of stay over five years, with the peer median.",
    metrics: ["operatingMargin", "expensePerAdjDischarge", "occupancy", "alos"],
    groupBy: "year",
    chart: "line",
    hospitals: "peers",
    last: 5,
  },
  {
    id: "peers",
    label: "Peer comparison",
    purpose: "The hospital ranked among its peers on margin, cost per case, occupancy and patient rating.",
    metrics: ["operatingMargin", "expensePerAdjDischarge", "occupancy", "hcahpsRating"],
    groupBy: "facility",
    chart: "bar",
    hospitals: "peers",
    last: null,
  },
  {
    id: "custom",
    label: "Custom",
    purpose: "Start blank and pick everything yourself.",
    metrics: [],
    groupBy: "year",
    chart: "line",
    hospitals: "peers",
    last: null,
  },
]

export const TEMPLATE_BY_ID = Object.fromEntries(REPORT_TEMPLATES.map((t) => [t.id, t])) as Record<ReportTemplateId, ReportTemplate>

export const parseTemplateId = (v: string | null | undefined): ReportTemplateId | null =>
  v && v in TEMPLATE_BY_ID ? (v as ReportTemplateId) : null

/** A template's settings on top of a spec (the hospital, peer group and hospitals added side by side stay). */
export function applyTemplate(spec: ReportSpec, t: ReportTemplate, validMetricIds?: Set<string>): ReportSpec {
  return {
    ...spec,
    metrics: t.metrics.filter((m) => !validMetricIds || validMetricIds.has(m)),
    groupBy: t.groupBy,
    chart: t.chart,
    hospitals: t.hospitals,
    year: null,
    last: t.last,
  }
}

/** The template a spec still matches exactly, if any (so the chooser can show it as current). */
export function matchingTemplate(spec: ReportSpec): ReportTemplateId | null {
  const t = REPORT_TEMPLATES.find(
    (t) =>
      t.id !== "custom" &&
      t.metrics.length === spec.metrics.length &&
      t.metrics.every((m, i) => spec.metrics[i] === m) &&
      t.groupBy === spec.groupBy &&
      t.chart === spec.chart &&
      (t.groupBy !== "facility" || t.hospitals === spec.hospitals) &&
      t.last === spec.last &&
      spec.year == null
  )
  return t?.id ?? (spec.metrics.length === 0 ? "custom" : null)
}
