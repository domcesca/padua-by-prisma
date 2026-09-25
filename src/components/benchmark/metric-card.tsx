"use client"

import { ArrowRight } from "lucide-react"
import { useState } from "react"

import { StandingBadge, TrendText } from "@/components/shell/standing"
import { StatusLine } from "@/components/shell/status-line"
import type { SeriesPoint } from "@/lib/benchmark/compute"
import { DATASETS, type MetricDef } from "@/lib/data/datasets"
import type { SourceStatus } from "@/lib/data/freshness"
import type { DictionaryMetric, PointDetail } from "@/lib/data/types"
import { CONTEXT_REASONS } from "@/lib/favorability/directions"
import { directionOf, metricStanding, rankText, trend } from "@/lib/favorability"
import { formatMetric } from "@/lib/format"
import { auditLabel, type QualityFlag } from "@/lib/status"
import { cn } from "@/lib/utils"
import { MetricInfo } from "./metric-info"
import { TrendChart } from "./trend-chart"

/** A point's period for use mid-sentence: star ratings carry a release ("Published Aug 2026") rather than a period. */
function periodOf(p: SeriesPoint) {
  const period = p.detail?.period
  if (!period) return String(p.year)
  const release = period.match(/^Published (.+)$/)
  return release ? `the ${release[1]} release` : period
}

/** The standing label first, then the rank and peer median as its evidence. */
function Comparison({ point, metric }: { point: SeriesPoint; metric: DictionaryMetric }) {
  if (point.percentile == null || point.n === 0) {
    return <p className="mt-1 text-[13px] text-muted-foreground">No peers reported this year, so there&apos;s nothing to compare with.</p>
  }
  const standing = metricStanding(metric.id, point.percentile, point.n)!
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
      <StandingBadge standing={standing} title={standing === "depends" ? CONTEXT_REASONS[metric.id] : undefined} />
      <p className="text-[13px] text-muted-foreground">
        {rankText(point.percentile, point.n)}. Peer median {formatMetric(metric, point.median)}.
      </p>
    </div>
  )
}

/** The change from the hospital's previous value, in words: "Improving from 4.1% in 2023". */
function Change({ points, latest, metric }: { points: SeriesPoint[]; latest: SeriesPoint; metric: DictionaryMetric }) {
  const prior = points.filter((p) => p.year < latest.year && p.value != null).at(-1)
  if (!prior || prior.value == null || latest.value == null) return null
  const same = formatMetric(metric, prior.value) === formatMetric(metric, latest.value)
  const t = trend(directionOf(metric.id), prior.value, latest.value, same)
  return (
    <TrendText trend={t} rising={latest.value > prior.value} className="mt-1">
      from {formatMetric(metric, prior.value)} in {periodOf(prior)}
    </TrendText>
  )
}

/** "Better than the national rate" / "Fewer infections than predicted" / ... */
function comparedText(metric: DictionaryMetric, detail: PointDetail | undefined) {
  if (!detail?.compared || !metric.comparedTo) return null
  if (metric.comparedTo === "predicted") {
    return { better: "Fewer infections than predicted", same: "No different from predicted", worse: "More infections than predicted" }[detail.compared]
  }
  const verb = { better: "Better than", same: "No different from", worse: "Worse than" }[detail.compared]
  return `${verb} ${metric.comparedTo}`
}

const yearList = (years: number[]) =>
  years.length > 2 ? `${years[0]}–${years.at(-1)}` : years.join(" and ")

export function MetricCard({
  meta,
  points: allPoints,
  tags = [],
  companion,
  source,
  related,
}: {
  meta: MetricDef
  points: SeriesPoint[]
  /** Short qualifiers shown under the title, e.g. "All payers" or "Fiscal years". */
  tags?: string[]
  /** A related measure shown on the same card (an infection SIR's raw rate). */
  companion?: { meta: MetricDef; points: SeriesPoint[] }
  /** The source's publication and processing dates and this hospital's record match, for the status line. */
  source?: SourceStatus
  /** The key finding that covers this metric: "Key finding 2 · Readmissions", opening its methodology. */
  related?: { label: string; onOpen: (opener: HTMLElement) => void }
}) {
  const [view, setView] = useState<"chart" | "table">("chart")

  // Trailing years the source hasn't published yet are left off the chart and named instead.
  const lastPublished = allPoints.findLastIndex((p) => p.published)
  const points = lastPublished >= 0 ? allPoints.slice(0, lastPublished + 1) : []
  const notYet = allPoints.slice(lastPublished + 1).map((p) => p.year)

  const latest = [...points].reverse().find((p) => p.value != null)
  const lastYear = points.at(-1)?.year
  const stale = latest && lastYear != null && latest.year < lastYear
  const companionLatest = latest && companion?.points.find((p) => p.year === latest.year)
  const compared = comparedText(meta, latest?.detail)
  // Why the hospital has no value: the most recent note the source gave.
  const missingReason = [...points].reverse().find((p) => p.value == null && p.detail?.note)?.detail?.note

  const flags: QualityFlag[] = []
  if (!latest) flags.push("unavailable")
  if (stale) flags.push("stale")
  if (latest && source?.provisional.includes(latest.year)) flags.push("provisional")
  if (latest?.annualized) flags.push("partial-period")
  if (source?.matched) flags.push("matched-record")
  const publishedOn = latest && source?.published[latest.year]
  const status = (
    <StatusLine
      className="mt-auto border-t border-border pt-2.5"
      through={latest ? periodOf(latest) : null}
      periodType={DATASETS[meta.dataset].periodType}
      published={publishedOn ? `Published ${publishedOn}` : source?.sourceUpdated ? `Source updated ${source.sourceUpdated}` : null}
      processed={source ? `Processed ${source.processed}` : null}
      audit={meta.dataset === "hafd-selected" ? auditLabel(latest?.status) : null}
      note={notYet.length ? `${yearList(notYet)} not yet published` : null}
      flags={flags}
      flagDetail={{
        stale: latest && lastYear != null ? `The latest value here is from ${latest.year}; the source has data through ${lastYear}.` : undefined,
        "matched-record": source?.matched ?? undefined,
      }}
    />
  )

  return (
    <section aria-labelledby={`metric-${meta.id}`} className="widget fade-up flex flex-col p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h2 id={`metric-${meta.id}`} className="text-[13px] font-medium text-muted-foreground">
            {meta.label}
          </h2>
          <MetricInfo metric={meta} />
        </div>
        {latest && <ViewToggle value={view} onChange={setView} label={meta.label} />}
      </header>
      {tags.length > 0 && (
        <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="About this measure">
          {tags.map((t) => (
            <li key={t} className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-muted-foreground dark:bg-white/8">
              {t}
            </li>
          ))}
        </ul>
      )}

      {!latest ? (
        <NotReported
          published={points.length > 0}
          reason={missingReason}
          notYet={notYet}
          peersReported={points.some((p) => p.n > 0)}
        />
      ) : (
        <>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
            <p className="num text-[28px] leading-tight font-semibold tracking-tight">{formatMetric(meta, latest.value)}</p>
            {meta.unitLabel && <p className="text-xs text-muted-foreground">{meta.unitLabel}</p>}
            <p className="text-xs text-tertiary-foreground">{latest.detail?.period ?? latest.year}</p>
          </div>
          {(compared || latest.detail?.ci) && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {compared}
              {compared && latest.detail?.ci && " · "}
              {latest.detail?.ci && `95% CI ${formatMetric(meta, latest.detail.ci[0])}–${formatMetric(meta, latest.detail.ci[1])}`}
            </p>
          )}
          {companion && companionLatest?.value != null && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {companion.meta.label}:{" "}
              <span className="num font-medium text-foreground">{formatMetric(companion.meta, companionLatest.value)}</span>{" "}
              {companion.meta.unitLabel}
            </p>
          )}
          <Comparison point={latest} metric={meta} />
          <Change points={points} latest={latest} metric={meta} />
          {latest.detail?.note && <p className="mt-0.5 text-xs leading-relaxed text-tertiary-foreground">{latest.detail.note}</p>}

          <div className="mt-4">
            {view === "chart" ? (
              <TrendChart metric={meta} points={points} />
            ) : (
              <MetricTable metric={meta} points={points} companion={companion} />
            )}
            {/* Screen readers always get the table, whichever view is showing. */}
            {view === "chart" && (
              <div className="sr-only">
                <MetricTable metric={meta} points={points} companion={companion} />
              </div>
            )}
          </div>
        </>
      )}
      {related && (
        <button
          type="button"
          onClick={(e) => related.onOpen(e.currentTarget)}
          className="mt-3 inline-flex items-center gap-1 self-start rounded text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="text-muted-foreground">Related signal:</span> {related.label}
          <ArrowRight className="size-3" aria-hidden />
        </button>
      )}
      <div className="mt-3 flex flex-1 flex-col">{status}</div>
    </section>
  )
}

/** Shown instead of an empty chart when the hospital has no value to plot. */
function NotReported({
  published,
  reason,
  notYet,
  peersReported,
}: {
  published: boolean
  reason?: string
  notYet: number[]
  peersReported: boolean
}) {
  return (
    <div className="mt-3 flex flex-1 flex-col justify-center rounded-xl bg-black/4 px-4 py-6 text-center dark:bg-white/6">
      <p className="text-[15px] font-semibold tracking-tight">{published ? "Not reported for this hospital" : "Not yet reported"}</p>
      <p className="mx-auto mt-1 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
        {!published
          ? `The source hasn’t published this measure for ${notYet.length ? yearList(notYet) : "these years"}.`
          : (reason ??
            (peersReported
              ? "Other hospitals reported it, but there’s no value for this one. Hospitals that don’t treat enough eligible patients aren’t scored."
              : "No value was published for this hospital."))}
      </p>
    </div>
  )
}

function ViewToggle({
  value,
  onChange,
  label,
}: {
  value: "chart" | "table"
  onChange: (v: "chart" | "table") => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={`${label} view`} className="flex rounded-md bg-black/5 p-0.5 dark:bg-white/8">
      {(["chart", "table"] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "rounded px-2 py-0.5 text-xs font-medium capitalize transition-colors duration-150",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            value === v ? "bg-card text-foreground shadow-sm dark:bg-white/15" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {v}
        </button>
      ))}
    </div>
  )
}

function MetricTable({
  metric,
  points,
  companion,
}: {
  metric: DictionaryMetric
  points: SeriesPoint[]
  companion?: { meta: MetricDef; points: SeriesPoint[] }
}) {
  const hasPeriods = points.some((p) => p.detail?.period)
  return (
    <div className="h-48 overflow-auto">
      <table className="num w-full text-left text-xs">
        <thead className="sticky top-0 bg-card text-muted-foreground">
          <tr className="border-b border-border">
            <th className="py-1.5 font-medium">{hasPeriods ? "Measurement period" : "Year"}</th>
            <th className="py-1.5 text-right font-medium">Hospital</th>
            {companion && <th className="py-1.5 text-right font-medium">Rate</th>}
            <th className="py-1.5 text-right font-medium">Peer median</th>
            <th className="py-1.5 text-right font-medium">Middle 50%</th>
            <th className="py-1.5 text-right font-medium">Peers</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.year} className="border-b border-border last:border-0">
              <td className="py-1.5">
                {p.detail?.period ?? p.year}
                {p.annualized && <span title="Annualized from a partial-year report"> *</span>}
              </td>
              {p.published ? (
                <>
                  <td className="py-1.5 text-right font-medium">{formatMetric(metric, p.value)}</td>
                  {companion && (
                    <td className="py-1.5 text-right">
                      {formatMetric(companion.meta, companion.points.find((c) => c.year === p.year)?.value)}
                    </td>
                  )}
                  <td className="py-1.5 text-right">{formatMetric(metric, p.median)}</td>
                  <td className="py-1.5 text-right text-muted-foreground">
                    {p.p25 != null ? `${formatMetric(metric, p.p25, true)}–${formatMetric(metric, p.p75, true)}` : "—"}
                  </td>
                  <td className="py-1.5 text-right text-muted-foreground">{p.n}</td>
                </>
              ) : (
                <td colSpan={companion ? 5 : 4} className="py-1.5 text-right text-muted-foreground">
                  Not published this year
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
