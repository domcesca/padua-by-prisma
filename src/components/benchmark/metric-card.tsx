"use client"

import { useState } from "react"

import type { SeriesPoint } from "@/lib/benchmark/compute"
import type { MetricDef } from "@/lib/data/datasets"
import type { DictionaryMetric, PointDetail } from "@/lib/data/types"
import { formatMetric } from "@/lib/format"
import { cn } from "@/lib/utils"
import { MetricInfo } from "./metric-info"
import { TrendChart } from "./trend-chart"

function takeaway(point: SeriesPoint | undefined, metric: DictionaryMetric) {
  if (!point || point.value == null) return null
  if (point.percentile == null || point.n === 0) return "No peers reported this year."
  const pct = Math.round(point.percentile * 100)
  const median = formatMetric(metric, point.median)
  if (pct >= 45 && pct <= 55) return `About the same as the peer median (${median}).`
  if (pct >= 100) return `Highest of ${point.n} peers. Peer median ${median}.`
  if (pct <= 0) return `Lowest of ${point.n} peers. Peer median ${median}.`
  return `Higher than ${pct}% of ${point.n} peers. Peer median ${median}.`
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
}: {
  meta: MetricDef
  points: SeriesPoint[]
  /** Short qualifiers shown under the title, e.g. "All payers" or "Fiscal years". */
  tags?: string[]
  /** A related measure shown on the same card (an infection SIR's raw rate). */
  companion?: { meta: MetricDef; points: SeriesPoint[] }
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
            <li key={t} className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-muted-foreground dark:bg-white/8">
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
            <p className="text-xs text-tertiary-foreground">
              {latest.year}
              {latest.detail?.period && ` · ${latest.detail.period}`}
              {stale && " · latest report"}
            </p>
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
          <p className="mt-0.5 min-h-5 text-[13px] text-muted-foreground">{takeaway(latest, meta) ?? "No data reported."}</p>
          {latest.detail?.note && <p className="mt-0.5 text-xs leading-relaxed text-tertiary-foreground">{latest.detail.note}</p>}

          <div className="mt-4 flex-1">
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
          {notYet.length > 0 && (
            <p className="mt-2 text-xs text-tertiary-foreground">{yearList(notYet)}: not yet reported.</p>
          )}
        </>
      )}
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
            "rounded px-2 py-0.5 text-[11px] font-medium capitalize transition-colors duration-150",
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
            <th className="py-1.5 font-medium">{hasPeriods ? "Period" : "Year"}</th>
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
