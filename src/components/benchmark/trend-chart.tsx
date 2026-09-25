"use client"

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import type { SeriesPoint } from "@/lib/benchmark/compute"
import type { DictionaryMetric } from "@/lib/data/types"
import { formatMetric } from "@/lib/format"
import { niceTicks } from "@/lib/ticks"

type Row = SeriesPoint & { band: [number, number] | null }

// Colors come from theme tokens so light/dark switch without re-rendering.
const HOSPITAL = "var(--chart-1)"
const PEER = "var(--chart-2)"
const BAND = "var(--chart-2)"

/** Volumes and rates read best from zero; margins and unit costs read best zoomed in. */
function includesZero(metric: DictionaryMetric) {
  if (metric.id === "operatingMargin") return false
  return metric.unit === "count" || metric.unit === "pct" || metric.unit === "ratio" || metric.unit === "number"
}

export function TrendChart({ metric, points }: { metric: DictionaryMetric; points: SeriesPoint[] }) {
  const data: Row[] = points.map((p) => ({
    ...p,
    band: p.p25 != null && p.p75 != null ? [p.p25, p.p75] : null,
  }))
  // Star ratings live on a fixed 1–5 scale.
  const ticks = metric.unitLabel?.startsWith("stars") ? [0, 1, 2, 3, 4, 5] : niceTicks(
    [...points.flatMap((p) => [p.value, p.median, p.p25, p.p75]), metric.reference].filter((v): v is number => v != null),
    includesZero(metric)
  )
  const showZero = ticks[0] < 0 && ticks.at(-1)! > 0

  return (
    <div className="h-48 w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="year"
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickMargin={8}
            interval="preserveStartEnd"
          />
          <YAxis
            width={44}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickFormatter={(v: number) => formatMetric(metric, v, true)}
            ticks={ticks}
            domain={[ticks[0], ticks.at(-1)!]}
            allowDataOverflow
          />
          {showZero && <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />}
          {metric.reference != null && (
            <ReferenceLine
              y={metric.reference}
              stroke="var(--muted-foreground)"
              strokeOpacity={0.6}
              strokeDasharray="3 3"
              label={{ value: "Expected", position: "insideTopRight", fontSize: 10, fill: "var(--muted-foreground)" }}
            />
          )}
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.4, strokeWidth: 1 }}
            content={({ active, payload }) => <ChartTooltip active={active} payload={payload} metric={metric} />}
            isAnimationActive={false}
          />
          <Area
            dataKey="band"
            stroke="none"
            fill={BAND}
            fillOpacity={0.14}
            isAnimationActive
            animationDuration={250}
            activeDot={false}
            connectNulls
          />
          <Line
            dataKey="median"
            stroke={PEER}
            strokeWidth={2}
            dot={false}
            activeDot={false}
            strokeLinecap="round"
            connectNulls
            animationDuration={250}
          />
          <Line
            dataKey="value"
            stroke={HOSPITAL}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={{ r: 4, fill: HOSPITAL, stroke: "var(--card)", strokeWidth: 2 }}
            activeDot={{ r: 5.5, fill: HOSPITAL, stroke: "var(--card)", strokeWidth: 2 }}
            connectNulls={false}
            animationDuration={250}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function ChartTooltip({
  active,
  payload,
  metric,
}: {
  active?: boolean
  payload?: readonly { payload?: unknown }[]
  metric: DictionaryMetric
}) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload as Row | undefined
  if (!row) return null
  return (
    <div className="min-w-48 glass-strong rounded-xl px-3 py-2.5 text-xs">
      <p className="mb-1.5 font-medium">{row.detail?.period ?? row.year}</p>
      <dl className="space-y-1">
        <TooltipRow swatch={<span className="size-2 rounded-full bg-(--chart-1)" />} label="This hospital">
          {formatMetric(metric, row.value)}
        </TooltipRow>
        <TooltipRow swatch={<span className="h-0.5 w-2.5 rounded-full bg-(--chart-2)" />} label="Peer median">
          {formatMetric(metric, row.median)}
        </TooltipRow>
        <TooltipRow swatch={<span className="size-2.5 rounded-sm bg-(--chart-2)/25" />} label="Middle 50%">
          {row.p25 != null ? `${formatMetric(metric, row.p25)} – ${formatMetric(metric, row.p75)}` : "—"}
        </TooltipRow>
      </dl>
      <p className="mt-2 text-muted-foreground">
        {row.n} peer{row.n === 1 ? "" : "s"} reporting
        {row.annualized && " · annualized"}
        {row.status === "In Process" && " · not yet audited"}
      </p>
    </div>
  )
}

function TooltipRow({ swatch, label, children }: { swatch: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex w-2.5 justify-center">{swatch}</span>
      <dt className="flex-1 text-muted-foreground">{label}</dt>
      <dd className="num font-medium">{children}</dd>
    </div>
  )
}

export function TrendLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="relative flex h-2 w-4 items-center">
          <span className="h-0.5 w-full rounded-full bg-(--chart-1)" />
          <span className="absolute left-1/2 size-2 -translate-x-1/2 rounded-full bg-(--chart-1)" />
        </span>
        This hospital
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-4 rounded-full bg-(--chart-2)" />
        Peer median
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-4 rounded-sm bg-(--chart-2)/25" />
        Middle 50% of peers
      </span>
    </div>
  )
}
