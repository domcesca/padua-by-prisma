"use client"

import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts"

import type { CorrelatePoint, CorrelateResult } from "@/lib/correlate/spec"
import type { MetricDef } from "@/lib/data/datasets"
import { formatMetric } from "@/lib/format"
import { niceTicks } from "@/lib/ticks"
import { cn } from "@/lib/utils"

const axisTick = { fontSize: 11, fill: "var(--muted-foreground)" }

type DotProps = { cx?: number; cy?: number; payload?: CorrelatePoint }

// Peers are gray context; the chosen hospital takes the first series color, larger, with a
// surface ring so it stays visible where dots overlap.
function PeerDot({ cx = 0, cy = 0 }: DotProps) {
  return <circle cx={cx} cy={cy} r={4.5} fill="var(--chart-2)" fillOpacity={0.7} stroke="var(--card)" strokeWidth={1.5} />
}
function FocusDot({ cx = 0, cy = 0 }: DotProps) {
  return <circle cx={cx} cy={cy} r={6.5} fill="var(--series-1)" stroke="var(--card)" strokeWidth={2} />
}

export function ScatterPlot({
  points,
  x,
  y,
  stats,
}: {
  points: CorrelatePoint[]
  x: MetricDef
  y: MetricDef
  stats: CorrelateResult["stats"]
}) {
  const xTicks = niceTicks(points.map((p) => p.x), false)
  const yTicks = niceTicks(points.map((p) => p.y), false)
  const peers = points.filter((p) => !p.focus)
  const focus = points.filter((p) => p.focus)
  // Trend line across the range of the data (not the padded axis), so it doesn't extrapolate.
  const xs = points.map((p) => p.x)
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
  const line: [{ x: number; y: number }, { x: number; y: number }] | null = stats
    ? [
        { x: x0, y: stats.slope * x0 + stats.intercept },
        { x: x1, y: stats.slope * x1 + stats.intercept },
      ]
    : null

  return (
    <figure aria-hidden className="m-0">
      <p className="mb-1 text-[11px] text-tertiary-foreground">↑ {y.label}</p>
      <div className="h-80 w-full sm:h-96">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="var(--border)" />
            <XAxis
              type="number"
              dataKey="x"
              name={x.label}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tick={axisTick}
              tickMargin={8}
              tickFormatter={(v: number) => formatMetric(x, v, true)}
              ticks={xTicks}
              domain={[xTicks[0], xTicks.at(-1)!]}
              allowDataOverflow
            />
            <YAxis
              type="number"
              dataKey="y"
              name={y.label}
              width={56}
              tickLine={false}
              axisLine={false}
              tick={axisTick}
              tickFormatter={(v: number) => formatMetric(y, v, true)}
              ticks={yTicks}
              domain={[yTicks[0], yTicks.at(-1)!]}
              allowDataOverflow
            />
            {line && (
              <ReferenceLine
                segment={line}
                stroke="var(--muted-foreground)"
                strokeWidth={2}
                strokeLinecap="round"
                ifOverflow="hidden"
              />
            )}
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.3, strokeDasharray: "3 3" }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const p = active ? (payload?.[0]?.payload as CorrelatePoint | undefined) : undefined
                if (!p) return null
                return (
                  <div className="glass-strong max-w-64 rounded-xl px-3 py-2 text-xs shadow-lg">
                    <p className={cn("mb-1 font-medium", p.focus && "text-foreground")}>{p.name}</p>
                    <p className="text-muted-foreground">
                      {x.label}: <span className="num font-medium text-foreground">{formatMetric(x, p.x)}</span>
                    </p>
                    <p className="text-muted-foreground">
                      {y.label}: <span className="num font-medium text-foreground">{formatMetric(y, p.y)}</span>
                    </p>
                  </div>
                )
              }}
            />
            <Scatter data={peers} shape={PeerDot} isAnimationActive={false} />
            <Scatter data={focus} shape={FocusDot} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-right text-[11px] text-tertiary-foreground">{x.label} →</p>
    </figure>
  )
}

export function ScatterTable({ points, x, y }: { points: CorrelatePoint[]; x: MetricDef; y: MetricDef }) {
  const rows = [...points].sort((a, b) => a.x - b.x)
  return (
    <div className="max-h-96 overflow-auto">
      <table className="num w-full text-left text-xs">
        <thead className="sticky top-0 bg-card text-muted-foreground">
          <tr className="border-b border-border">
            <th className="py-1.5 pr-3 font-medium">Hospital</th>
            <th className="max-w-40 truncate py-1.5 pl-3 text-right font-medium" title={x.label}>
              {x.label}
            </th>
            <th className="max-w-40 truncate py-1.5 pl-3 text-right font-medium" title={y.label}>
              {y.label}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className={cn("border-b border-border last:border-0", p.focus && "font-semibold")}>
              <td className="max-w-56 truncate py-1.5 pr-3" title={p.name}>
                {p.name}
              </td>
              <td className="py-1.5 pl-3 text-right">{formatMetric(x, p.x)}</td>
              <td className="py-1.5 pl-3 text-right">{formatMetric(y, p.y)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
