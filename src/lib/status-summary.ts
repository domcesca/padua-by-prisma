import type { SeriesPoint } from "@/lib/benchmark/compute"
import { DATASETS, type MetricDef } from "@/lib/data/datasets"
import type { SourceStatus } from "@/lib/data/freshness"
import { auditLabel, type QualityFlag } from "@/lib/status"

// The context bar's condensed data status: the same fields and flags a metric card's status line derives (data through,
// period type, published, processed, audit, quality flags), worked out for one series.

export type StatusSummary = {
  through: string | null
  periodType: string
  published: string | null
  processed: string | null
  audit: string | null
  note?: string | null
  flags: QualityFlag[]
  flagDetail: Partial<Record<QualityFlag, string>>
}

const periodOf = (p: SeriesPoint) => {
  const period = p.detail?.period
  if (!period) return String(p.year)
  const release = period.match(/^Published (.+)$/)
  return release ? `the ${release[1]} release` : period
}

export function seriesStatus(meta: MetricDef, points: SeriesPoint[], source: SourceStatus | undefined, note?: string | null): StatusSummary {
  const lastPublished = points.findLastIndex((p) => p.published)
  const shown = lastPublished >= 0 ? points.slice(0, lastPublished + 1) : []
  const latest = [...shown].reverse().find((p) => p.value != null)
  const lastYear = shown.at(-1)?.year
  const flags: QualityFlag[] = []
  const stale = !!latest && lastYear != null && latest.year < lastYear
  if (!latest) flags.push("unavailable")
  if (stale) flags.push("stale")
  if (latest && source?.provisional.includes(latest.year)) flags.push("provisional")
  if (latest?.annualized) flags.push("partial-period")
  if (source?.matched) flags.push("matched-record")
  const publishedOn = latest && source?.published[latest.year]
  return {
    through: latest ? periodOf(latest) : null,
    periodType: DATASETS[meta.dataset].periodType,
    published: publishedOn ? `Published ${publishedOn}` : source?.sourceUpdated ? `Source updated ${source.sourceUpdated}` : null,
    processed: source ? `Processed ${source.processed}` : null,
    audit: meta.dataset === "hafd-selected" ? auditLabel(latest?.status) : null,
    note: note ?? null,
    flags,
    flagDetail: {
      ...(stale ? { stale: `The latest value is from ${latest!.year}; the source has data through ${lastYear}.` } : {}),
      ...(source?.matched ? { "matched-record": source.matched } : {}),
    },
  }
}
