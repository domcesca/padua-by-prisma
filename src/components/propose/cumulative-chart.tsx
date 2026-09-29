"use client"

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { formatUsd } from "@/lib/format"
import type { Projection, ScenarioId } from "@/lib/propose/engine"
import { niceTicks } from "@/lib/ticks"

export const SCENARIO_COLOR: Record<ScenarioId, string> = {
  conservative: "var(--series-2)",
  expected: "var(--series-1)",
  optimistic: "var(--series-3)",
}

/** Line style per scenario, so the three lines differ by more than color: dashed, solid, dotted. */
export const SCENARIO_DASH: Record<ScenarioId, string | undefined> = {
  conservative: "7 4",
  expected: undefined,
  optimistic: "1.5 3.5",
}

/** The legend's swatch: the scenario's color and line style. */
export function ScenarioSwatch({ scenario }: { scenario: ScenarioId }) {
  return (
    <svg width="20" height="4" viewBox="0 0 20 4" aria-hidden className="shrink-0">
      <line x1="1" y1="2" x2="19" y2="2" stroke={SCENARIO_COLOR[scenario]} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={SCENARIO_DASH[scenario]} />
    </svg>
  )
}

/** Cumulative net cash over the useful life, one line per scenario; where a line crosses zero is payback. */
export function CumulativeChart({ projections, focus }: { projections: Projection[]; focus: ScenarioId }) {
  const years = projections[0].rows.map((r) => r.year)
  const data = years.map((year) => ({
    year,
    ...Object.fromEntries(projections.map((p) => [p.scenario, p.rows[year].cumulative])),
  }))
  const ticks = niceTicks(projections.flatMap((p) => p.rows.map((r) => r.cumulative)).concat(0), true)

  return (
    <div className="h-72 w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart accessibilityLayer={false} data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="year"
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickFormatter={(y: number) => (y === 0 ? "Start" : `Yr ${y}`)}
            tickMargin={8}
            interval="preserveStartEnd"
          />
          <YAxis
            width={64}
            tickLine={false}
            axisLine={false}
            ticks={ticks}
            domain={[ticks[0], ticks.at(-1)!]}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickFormatter={(v: number) => formatUsd(v, { compact: true })}
          />
          <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="4 3" />
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              fontSize: 12,
              color: "var(--popover-foreground)",
            }}
            labelFormatter={(y) => (y === 0 ? "Start (up-front cost)" : `End of year ${y}`)}
            formatter={(value, name) => [formatUsd(Number(value)), projections.find((p) => p.scenario === name)?.label ?? name]}
          />
          {projections.map((p) => (
            <Line
              key={p.scenario}
              type="linear"
              dataKey={p.scenario}
              stroke={SCENARIO_COLOR[p.scenario]}
              strokeDasharray={SCENARIO_DASH[p.scenario]}
              strokeLinecap="round"
              strokeWidth={p.scenario === focus ? 2.75 : 1.75}
              strokeOpacity={p.scenario === focus ? 1 : 0.55}
              dot={p.rows.length <= 12 ? { r: p.scenario === focus ? 3 : 2, strokeWidth: 0, fill: SCENARIO_COLOR[p.scenario] } : false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
