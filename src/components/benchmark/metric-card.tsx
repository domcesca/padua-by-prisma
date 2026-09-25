"use client"

import { useState } from "react"

import type { SeriesPoint } from "@/lib/benchmark/compute"
import type { DictionaryMetric } from "@/lib/data/types"
import { formatMetric } from "@/lib/format"
import { cn } from "@/lib/utils"
import { MetricInfo } from "./metric-info"
import { TrendChart } from "./trend-chart"

function takeaway(point: SeriesPoint | undefined, metric: string) {
  if (!point || point.value == null) return null
  if (point.percentile == null || point.n === 0) return "No peers reported this year."
  const pct = Math.round(point.percentile * 100)
  const median = formatMetric(metric, point.median)
  if (pct >= 45 && pct <= 55) return `About the same as the peer median (${median}).`
  return `Higher than ${pct}% of ${point.n} peers. Peer median ${median}.`
}

export function MetricCard({ meta, points }: { meta: DictionaryMetric; points: SeriesPoint[] }) {
  const [view, setView] = useState<"chart" | "table">("chart")
  const latest = [...points].reverse().find((p) => p.value != null)
  const lastYear = points.at(-1)?.year
  const stale = latest && lastYear != null && latest.year < lastYear

  return (
    <section
      aria-labelledby={`metric-${meta.id}`}
      className="fade-up flex flex-col rounded-2xl bg-card p-5 shadow-card"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h2 id={`metric-${meta.id}`} className="text-[13px] font-medium text-muted-foreground">
            {meta.label}
          </h2>
          <MetricInfo metric={meta} />
        </div>
        <ViewToggle value={view} onChange={setView} label={meta.label} />
      </header>

      <div className="mt-1.5 flex items-baseline gap-2">
        <p className="num text-[28px] leading-tight font-semibold tracking-tight">
          {formatMetric(meta.id, latest?.value)}
        </p>
        {latest && (
          <p className="text-xs text-tertiary-foreground">
            {latest.year}
            {stale && " · latest report"}
          </p>
        )}
      </div>
      <p className="mt-0.5 min-h-5 text-[13px] text-muted-foreground">
        {takeaway(latest, meta.id) ?? "No data reported."}
      </p>

      <div className="mt-4 flex-1">
        {view === "chart" ? (
          <TrendChart metric={meta.id} points={points} />
        ) : (
          <MetricTable metric={meta.id} points={points} />
        )}
        {/* Screen readers always get the table, whichever view is showing. */}
        {view === "chart" && (
          <div className="sr-only">
            <MetricTable metric={meta.id} points={points} />
          </div>
        )}
      </div>
    </section>
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
    <div role="radiogroup" aria-label={`${label} view`} className="flex rounded-md bg-muted p-0.5">
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

function MetricTable({ metric, points }: { metric: string; points: SeriesPoint[] }) {
  return (
    <div className="h-48 overflow-auto">
      <table className="num w-full text-left text-xs">
        <thead className="sticky top-0 bg-card text-muted-foreground">
          <tr className="border-b border-border">
            <th className="py-1.5 font-medium">Year</th>
            <th className="py-1.5 text-right font-medium">Hospital</th>
            <th className="py-1.5 text-right font-medium">Peer median</th>
            <th className="py-1.5 text-right font-medium">Middle 50%</th>
            <th className="py-1.5 text-right font-medium">Peers</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.year} className="border-b border-border last:border-0">
              <td className="py-1.5">
                {p.year}
                {p.annualized && <span title="Annualized from a partial-year report"> *</span>}
              </td>
              <td className="py-1.5 text-right font-medium">{formatMetric(metric, p.value)}</td>
              <td className="py-1.5 text-right">{formatMetric(metric, p.median)}</td>
              <td className="py-1.5 text-right text-muted-foreground">
                {p.p25 != null ? `${formatMetric(metric, p.p25, true)}–${formatMetric(metric, p.p75, true)}` : "—"}
              </td>
              <td className="py-1.5 text-right text-muted-foreground">{p.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
