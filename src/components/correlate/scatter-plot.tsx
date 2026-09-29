"use client"

import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts"

import { KeyboardChart } from "@/components/shell/chart-keyboard"
import { ScrollRegion } from "@/components/shell/scroll-region"
import type { CorrelatePoint, CorrelateResult } from "@/lib/correlate/spec"
import type { MetricDef } from "@/lib/data/datasets"
import { formatMetric } from "@/lib/format"
import { niceTicks } from "@/lib/ticks"
import { cn } from "@/lib/utils"

const axisTick = { fontSize: 12, fill: "var(--muted-foreground)" }

type DotProps = { cx?: number; cy?: number; payload?: CorrelatePoint }

// Peers are gray context; the chosen hospital takes the first series color, larger, with a
// surface ring so it stays visible where dots overlap.
function PeerDot({ cx = 0, cy = 0 }: DotProps) {
  return <circle cx={cx} cy={cy} r={4.5} fill="var(--chart-2)" fillOpacity={0.7} stroke="var(--card)" strokeWidth={1.5} />
}
/** Every hospital in one series (left to right, so the arrow keys move across the chart); the chosen one drawn again on top. */
function AnyDot(props: DotProps) {
  return props.payload?.focus ? <FocusDot {...props} /> : <PeerDot {...props} />
}
function FocusDot({ cx = 0, cy = 0 }: DotProps) {
  return <circle cx={cx} cy={cy} r={6.5} fill="var(--series-1)" stroke="var(--card)" strokeWidth={2} />
}

/** The point the keyboard is on: a solid ring, so it stands out in a cluster. */
function KeyboardRing({ cx = 0, cy = 0 }: DotProps) {
  return <circle cx={cx} cy={cy} r={9} fill="none" stroke="var(--foreground)" strokeWidth={2} />
}

/** The hospital the outlier recheck found driving r: a dashed ring, so it's marked by shape as well as position. */
function InfluentialRing({ cx = 0, cy = 0 }: DotProps) {
  return <circle cx={cx} cy={cy} r={11} fill="none" stroke="var(--foreground)" strokeWidth={1.5} strokeDasharray="3 2.5" />
}

export function ScatterPlot({
  points,
  x,
  y,
  stats,
  influential,
}: {
  points: CorrelatePoint[]
  x: MetricDef
  y: MetricDef
  stats: CorrelateResult["stats"]
  /** Hospital id to ring: the one whose removal changes the reading (V7.5 outlier recheck). */
  influential?: string | null
}) {
  const xTicks = niceTicks(points.map((p) => p.x), false)
  const yTicks = niceTicks(points.map((p) => p.y), false)
  const ordered = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
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
    <KeyboardChart
      label={`${y.label} against ${x.label}, one dot per hospital`}
      count={ordered.length}
      noun="hospitals, from left to right"
      start="first"
      describe={(i) => `${ordered[i].name}${ordered[i].focus ? " (chosen hospital)" : ""}: ${x.label} ${formatMetric(x, ordered[i].x)}, ${y.label} ${formatMetric(y, ordered[i].y)}.`}
    >
      {(active) => (
    <figure aria-hidden className="m-0">
      <p className="mb-1 text-xs text-tertiary-foreground">↑ {y.label}</p>
      <div className="h-80 w-full sm:h-96">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart accessibilityLayer={false} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
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
              defaultIndex={active ?? undefined}
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
            <Scatter data={ordered} shape={AnyDot} isAnimationActive={false} />
            <Scatter data={focus} shape={FocusDot} isAnimationActive={false} tooltipType="none" />
            {active != null && <Scatter data={[ordered[active]]} shape={KeyboardRing} isAnimationActive={false} tooltipType="none" />}
            {influential && <Scatter data={points.filter((p) => p.id === influential)} shape={InfluentialRing} isAnimationActive={false} />}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-right text-xs text-tertiary-foreground">{x.label} →</p>
    </figure>
      )}
    </KeyboardChart>
  )
}

export function ScatterTable({
  points,
  x,
  y,
  scroll = true,
  influential,
}: {
  points: CorrelatePoint[]
  x: MetricDef
  y: MetricDef
  scroll?: boolean
  influential?: string | null
}) {
  const rows = [...points].sort((a, b) => a.x - b.x)
  return (
    <ScrollRegion label={`${y.label} and ${x.label} by hospital`} scroll={scroll} className="max-h-96 overflow-auto">
      <table className="num w-full text-left text-xs">
        <thead className="sticky top-0 bg-card text-muted-foreground">
          <tr className="border-b border-border">
            <th scope="col" className="py-1.5 pr-3 font-medium">Hospital</th>
            <th scope="col" className="max-w-40 truncate py-1.5 pl-3 text-right font-medium" title={x.label}>
              {x.label}
            </th>
            <th scope="col" className="max-w-40 truncate py-1.5 pl-3 text-right font-medium" title={y.label}>
              {y.label}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className={cn("border-b border-border last:border-0", p.focus && "font-semibold")}>
              <th scope="row" className="font-normal max-w-56 truncate py-1.5 pr-3" title={p.name}>
                {p.name}
                {p.id === influential && <span className="text-muted-foreground"> (changes the reading)</span>}
              </th>
              <td className="py-1.5 pl-3 text-right">{formatMetric(x, p.x)}</td>
              <td className="py-1.5 pl-3 text-right">{formatMetric(y, p.y)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  )
}
