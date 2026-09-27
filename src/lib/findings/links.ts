import { CATEGORY_BY_ID, type MetricDef } from "@/lib/data/datasets"
import { rankText, type Standing } from "@/lib/favorability"
import { formatUsd } from "@/lib/format"
import type { Finding } from "./score"

// Client-safe helpers the findings panels share: the words a finding leads with, and where it links.

/** The standing a finding's badge shows: its lead metric's, or Unfavorable for a CMS penalty. */
export function findingStanding(f: Finding): Standing {
  return f.lead.evidence?.standing ?? "unfavorable"
}

const approx = (n: number) => `about ${formatUsd(n, { compact: true })} a year`

/** One line of evidence under a finding's title. */
export function headlineOf(f: Finding): string {
  const lead = f.lead
  if (lead.program === "hrrp") {
    const n = lead.items?.length ?? 0
    const cut = (lead.severity.value * 3).toFixed(2)
    return `Medicare readmissions penalty: payments cut ${cut}%${lead.dollars ? ` (${approx(lead.dollars.amount)})` : ""}; ${n} condition${n === 1 ? "" : "s"} above the CMS peer median.`
  }
  if (lead.program === "hac") {
    return `Hospital-acquired-condition penalty: Medicare payments cut 1%${lead.dollars ? ` (${approx(lead.dollars.amount)})` : ""}.`
  }
  const e = lead.evidence!
  const rank = e.percentile != null ? rankText(e.percentile, e.n) : null
  if (lead.kind === "verdict") return `${e.label} ${e.text.value} (${e.period}): ${e.compared ?? "worse than its benchmark"}.`
  return `${e.label} ${e.text.value} (${e.period}) vs peer median ${e.text.median}.${rank ? ` ${rank}.` : ""}`
}

/**
 * Benchmark opened on the finding's lead metric, with its methodology drawer open: the lead's topic, the Medicare
 * view for a Medicare metric, and the metric added to the topic's defaults if it isn't one.
 */
export function benchmarkHref(f: Finding, facilityId: string, metaById: Record<string, MetricDef>, peers?: URLSearchParams) {
  const p = new URLSearchParams(peers)
  p.set("facility", facilityId)
  const meta = f.lead.evidence ? metaById[f.lead.evidence.metric] : null
  const category = meta?.category ?? "quality"
  if (category !== "financial") p.set("view", category)
  if (meta) {
    const base = meta.lens && meta.allPayer ? meta.allPayer : meta.id
    const defaults = CATEGORY_BY_ID[category].defaultMetrics
    if (!defaults.includes(base)) p.set("metrics", [...defaults, base].join(","))
    if (meta.lens) p.set("payer", meta.lens)
  }
  p.set("finding", f.family)
  return `/benchmark?${p}`
}
