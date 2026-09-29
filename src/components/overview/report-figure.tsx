"use client"

import { useId, useState } from "react"
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { CardToggle } from "@/components/shell/card-toggle"
import { KeyboardChart } from "@/components/shell/chart-keyboard"
import { HOSPITAL_PATTERNS, PatternDefs, PatternSwatch, patternUrl, type FillPattern } from "@/components/shell/fill-pattern"
import { ScrollRegion } from "@/components/shell/scroll-region"
import { MarkerShapeSvg, MarkerSwatch, markerOf, type MarkerShape } from "@/components/shell/series-marker"
import type { Figure } from "@/lib/annual-report/figures"
import { formatMetric } from "@/lib/format"
import { niceTicks } from "@/lib/ticks"
import { useMediaQuery } from "@/lib/use-media-query"

// One figure in Overview's annual report (V7.5.5): the chart, a Chart / Table switch, and the table, which screen
// readers always get whichever view is showing (as on Compare's cards). Every chart is one tab stop whose arrow keys
// step through its rows and announce them (shell/chart-keyboard.tsx). Series differ by more than color: lines by
// marker shape and dashing, bars by fill pattern (shell/series-marker.tsx, shell/fill-pattern.tsx). A figure shows one
// hospital only; its data comes from lib/annual-report/build.ts.

const PATTERNS: FillPattern[] = [...HOSPITAL_PATTERNS, "dots"]
const DASHES = [undefined, "6 4", "2 3", "8 3 2 3"]
const colorOf = (i: number) => (i < 5 ? `var(--series-${i + 1})` : "var(--chart-2)")
const patternOf = (i: number) => PATTERNS[i % PATTERNS.length]
/** Bridge bars: totals solid, additions hatched, deductions dotted. */
const BRIDGE = {
  total: {
    color: "var(--series-1)",
    pattern: "solid" as FillPattern,
    label: "Total",
  },
  up: {
    color: "var(--series-3)",
    pattern: "diagonal" as FillPattern,
    label: "Adds to the total",
  },
  down: {
    color: "var(--series-2)",
    pattern: "dots" as FillPattern,
    label: "Takes away from it",
  },
}

const axisTick = { fontSize: 12, fill: "var(--muted-foreground)" }
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)

export function ReportFigure({ figure }: { figure: Figure }) {
  const [view, setView] = useState<"chart" | "table">("chart")
  const headingId = useId()
  return (
    <figure aria-labelledby={headingId} className="space-y-3 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <figcaption className="min-w-0 space-y-0.5">
          <h3 id={headingId} className="text-[15px] leading-snug font-semibold tracking-tight">
            {figure.title}
          </h3>
          <p className="text-xs text-muted-foreground">{figure.period}</p>
        </figcaption>
        <CardToggle
          label={`${figure.title} view`}
          value={view}
          onChange={setView}
          options={[
            { value: "chart", label: "Chart" },
            { value: "table", label: "Table" },
          ]}
        />
      </div>
      {view === "chart" ? (
        <>
          <FigureLegend figure={figure} />
          <FigureChart figure={figure} />
          <div className="sr-only">
            <FigureTable figure={figure} scroll={false} />
          </div>
        </>
      ) : (
        <FigureTable figure={figure} scroll />
      )}
      {figure.note && <p className="text-xs leading-relaxed text-tertiary-foreground">{figure.note}</p>}
    </figure>
  )
}

// -- the chart ----------------------------------------------------------------------------------------------------------

/** One row as a sentence: the keyboard announcement and the tooltip say the same thing. */
function describe(figure: Figure, i: number) {
  const label = figure.categories[i]
  if (figure.kind === "bridge" && figure.steps) {
    const s = figure.steps[i]
    return s.kind === "total"
      ? `${label}: ${formatMetric(figure.format, s.amount)}.`
      : `${label}: ${s.kind === "up" ? "adds" : "takes away"} ${formatMetric(figure.format, s.amount)}, leaving ${formatMetric(figure.format, s.to)}.`
  }
  const parts = figure.series.map((s) => `${figure.series.length > 1 ? `${s.label} ` : ""}${formatMetric(figure.format, s.values[i])}`)
  const extra = (figure.extraColumns ?? []).map((c) => `${c.label.charAt(0).toLowerCase()}${c.label.slice(1)} ${formatMetric(c.format, c.values[i])}`)
  return `${label}: ${[...parts, ...extra].join(", ")}.`
}

function FigureChart({ figure }: { figure: Figure }) {
  const overYears = figure.kind === "line" || figure.kind === "bars" || figure.kind === "stacked"
  return (
    <KeyboardChart
      label={`${figure.title}, ${figure.period}`}
      count={figure.categories.length}
      noun={overYears ? "years" : figure.kind === "bridge" ? "steps" : "rows"}
      start={overYears ? "last" : "first"}
      describe={(i) => describe(figure, i)}
    >
      {(active) =>
        figure.kind === "line" ? (
          <Lines figure={figure} active={active} />
        ) : figure.kind === "bars" || figure.kind === "stacked" ? (
          <ColumnBars figure={figure} active={active} />
        ) : figure.kind === "bridge" ? (
          <Bridge figure={figure} active={active} />
        ) : (
          <RowBars figure={figure} active={active} />
        )
      }
    </KeyboardChart>
  )
}

function rowsOf(figure: Figure) {
  return figure.categories.map((label, i) => ({
    label,
    i,
    ...Object.fromEntries(figure.series.map((s) => [s.key, s.values[i]])),
  }))
}

function FigureTooltip({ figure, index }: { figure: Figure; index: number | null }) {
  if (index == null || index < 0 || index >= figure.categories.length) return null
  const step = figure.kind === "bridge" ? figure.steps?.[index] : null
  return (
    <div className="max-w-72 min-w-44 glass-strong rounded-xl px-3 py-2.5 text-xs">
      <p className="mb-1.5 font-medium">{figure.categories[index]}</p>
      <dl className="space-y-1">
        {step ? (
          <>
            <TipRow label={step.kind === "total" ? "Total" : step.kind === "up" ? "Adds" : "Takes away"}>{formatMetric(figure.format, step.amount)}</TipRow>
            {step.kind !== "total" && <TipRow label="Leaves">{formatMetric(figure.format, step.to)}</TipRow>}
          </>
        ) : (
          figure.series.map((s) => (
            <TipRow key={s.key} label={s.label}>
              {formatMetric(figure.format, s.values[index])}
            </TipRow>
          ))
        )}
        {(figure.extraColumns ?? []).map((c) => (
          <TipRow key={c.label} label={c.label}>
            {formatMetric(c.format, c.values[index])}
          </TipRow>
        ))}
      </dl>
    </div>
  )
}

function TipRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="flex-1 text-muted-foreground">{label}</dt>
      <dd className="num font-medium">{children}</dd>
    </div>
  )
}

/** Recharts passes the hovered row's payload; the row carries its index. */
const tooltipIndex = (payload: readonly { payload?: unknown }[] | undefined) => {
  const row = payload?.[0]?.payload as { i?: number } | undefined
  return typeof row?.i === "number" ? row.i : null
}

function ticksFor(figure: Figure, values: number[]) {
  const withRef = figure.reference ? [...values, figure.reference.value] : values
  // Margins read best zoomed in around zero; amounts and shares from zero.
  return niceTicks(withRef.length ? withRef : [0], figure.format.unit !== "ratio" || figure.kind !== "line")
}

type DotProps = { cx?: number; cy?: number; index?: number; value?: unknown }
const markerDot = (shape: MarkerShape, color: string, r: number) =>
  function MarkerDot({ cx, cy, index, value }: DotProps) {
    if (cx == null || cy == null || value == null) return <g key={index} />
    return <MarkerShapeSvg key={index} shape={shape} cx={cx} cy={cy} r={r} fill={color} stroke="var(--card)" strokeWidth={2} />
  }

function Lines({ figure, active }: { figure: Figure; active: number | null }) {
  const values = figure.series.flatMap((s) => s.values).filter((v): v is number => v != null)
  const ticks = ticksFor(figure, values)
  return (
    <div className="h-56 w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart accessibilityLayer={false} data={rowsOf(figure)} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--border)" }} tick={axisTick} tickMargin={8} interval="preserveStartEnd" />
          <YAxis
            width={56}
            tickLine={false}
            axisLine={false}
            tick={axisTick}
            tickFormatter={(v: number) => formatMetric(figure.format, v, true)}
            ticks={ticks}
            domain={[ticks[0], ticks.at(-1)!]}
            allowDataOverflow
          />
          {figure.reference && ticks[0] < figure.reference.value && (
            <ReferenceLine y={figure.reference.value} stroke="var(--muted-foreground)" strokeOpacity={0.6} strokeDasharray="3 3" />
          )}
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.4 }}
            content={({ active: on, payload }) => (on ? <FigureTooltip figure={figure} index={tooltipIndex(payload)} /> : null)}
            isAnimationActive={false}
            defaultIndex={active ?? undefined}
          />
          {figure.series.map((s, i) => (
            <Line
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stroke={colorOf(i)}
              strokeWidth={2}
              strokeDasharray={DASHES[i % DASHES.length]}
              strokeLinecap="round"
              dot={markerDot(markerOf(i), colorOf(i), 4)}
              activeDot={markerDot(markerOf(i), colorOf(i), 5.5)}
              connectNulls={false}
              animationDuration={250}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function ColumnBars({ figure, active }: { figure: Figure; active: number | null }) {
  const id = useId()
  const stacked = figure.kind === "stacked"
  const rows = rowsOf(figure)
  const values = stacked
    ? figure.categories.map((_, i) => figure.series.reduce((t, s) => t + Math.max(s.values[i] ?? 0, 0), 0))
    : figure.series.flatMap((s) => s.values).filter((v): v is number => v != null)
  const ticks = niceTicks(values.length ? values : [0], true)
  return (
    <div className="h-60 w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart accessibilityLayer={false} data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%">
          <PatternDefs
            id={id}
            fills={figure.series.map((s, i) => ({
              key: s.key,
              color: colorOf(i),
              pattern: patternOf(i),
            }))}
          />
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--border)" }} tick={axisTick} tickMargin={8} interval="preserveStartEnd" />
          <YAxis
            width={56}
            tickLine={false}
            axisLine={false}
            tick={axisTick}
            tickFormatter={(v: number) => formatMetric(figure.format, v, true)}
            ticks={ticks}
            domain={[ticks[0], ticks.at(-1)!]}
            allowDataOverflow
          />
          <Tooltip
            cursor={{ fill: "var(--muted-foreground)", fillOpacity: 0.08 }}
            content={({ active: on, payload }) => (on ? <FigureTooltip figure={figure} index={tooltipIndex(payload)} /> : null)}
            isAnimationActive={false}
            defaultIndex={active ?? undefined}
          />
          {figure.series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId={stacked ? "stack" : undefined}
              fill={patternUrl(id, s.key, patternOf(i), colorOf(i))}
              // Stacked segments are separated by a card-colored edge, so neighbours read apart in any theme.
              stroke={stacked ? "var(--card)" : undefined}
              strokeWidth={stacked ? 1 : 0}
              radius={stacked ? 0 : [4, 4, 0, 0]}
              maxBarSize={stacked ? 44 : 28}
              animationDuration={250}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Category labels on the left of a horizontal chart, cut short on phones (the full label is its tooltip). */
function CategoryTick({ x, y, payload, maxChars }: { x?: number | string; y?: number | string; payload?: { value: string }; maxChars: number }) {
  const label = payload?.value ?? ""
  const short = label.length > maxChars ? `${label.slice(0, maxChars - 1)}…` : label
  return (
    <text x={Number(x) - 8} y={Number(y)} dy="0.35em" textAnchor="end" fontSize={12} fill="var(--muted-foreground)">
      <title>{label}</title>
      {short}
    </text>
  )
}

type TipLabelProps = {
  x?: number
  y?: number
  width?: number
  height?: number
  value?: number
}
function TipLabel({ x = 0, y = 0, width = 0, height = 0, value, figure }: TipLabelProps & { figure: Figure }) {
  if (value == null) return null
  const negative = value < 0
  const tipX = negative ? Math.min(x, x + width) - 6 : Math.max(x, x + width) + 6
  return (
    <text x={tipX} y={y + height / 2} dy="0.35em" textAnchor={negative ? "end" : "start"} className="num" fontSize={11} fill="var(--foreground)">
      {formatMetric(figure.format, value, true)}
    </text>
  )
}

function RowBars({ figure, active }: { figure: Figure; active: number | null }) {
  const id = useId()
  const compact = useMediaQuery("(max-width: 640px)")
  const rows = rowsOf(figure)
  const values = figure.series.flatMap((s) => s.values).filter((v): v is number => v != null)
  const ticks = ticksFor(figure, values)
  const single = figure.series.length === 1
  const height = Math.max(120, rows.length * (figure.series.length * 16 + 16) + 36)
  return (
    <div className="w-full" style={{ height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          accessibilityLayer={false}
          data={rows}
          layout="vertical"
          margin={{
            top: 4,
            right: single ? (compact ? 48 : 60) : 12,
            bottom: 0,
            left: 0,
          }}
          barGap={2}
          barCategoryGap={8}
        >
          <PatternDefs
            id={id}
            fills={figure.series.map((s, i) => ({
              key: s.key,
              color: colorOf(i),
              pattern: patternOf(i),
            }))}
          />
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            tick={axisTick}
            tickFormatter={(v: number) => formatMetric(figure.format, v, true)}
            ticks={ticks}
            domain={[ticks[0], ticks.at(-1)!]}
            allowDataOverflow
          />
          <YAxis
            type="category"
            dataKey="label"
            width={compact ? 124 : 196}
            tickLine={false}
            axisLine={false}
            interval={0}
            tick={(p) => <CategoryTick {...p} maxChars={compact ? 18 : 30} />}
          />
          {ticks[0] < 0 && <ReferenceLine x={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />}
          {figure.reference && <ReferenceLine x={figure.reference.value} stroke="var(--foreground)" strokeOpacity={0.55} strokeDasharray="4 3" />}
          <Tooltip
            cursor={{ fill: "var(--muted-foreground)", fillOpacity: 0.08 }}
            content={({ active: on, payload }) => (on ? <FigureTooltip figure={figure} index={tooltipIndex(payload)} /> : null)}
            isAnimationActive={false}
            defaultIndex={active ?? undefined}
          />
          {figure.series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={patternUrl(id, s.key, patternOf(i), colorOf(i))}
              radius={4}
              maxBarSize={single ? 22 : 14}
              animationDuration={250}
            >
              {single && <LabelList dataKey={s.key} content={(p) => <TipLabel {...(p as TipLabelProps)} figure={figure} />} />}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function Bridge({ figure, active }: { figure: Figure; active: number | null }) {
  const id = useId()
  const compact = useMediaQuery("(max-width: 640px)")
  const steps = figure.steps ?? []
  const rows = steps.map((s, i) => ({
    label: s.label,
    i,
    range: [Math.min(s.from, s.to), Math.max(s.from, s.to)] as [number, number],
    kind: s.kind,
  }))
  const ticks = niceTicks(steps.flatMap((s) => [s.from, s.to]).concat(0), true)
  return (
    <div className="w-full" style={{ height: rows.length * 30 + 36 }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart accessibilityLayer={false} data={rows} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }} barCategoryGap={6}>
          <PatternDefs
            id={id}
            fills={Object.entries(BRIDGE).map(([k, b]) => ({
              key: k,
              color: b.color,
              pattern: b.pattern,
            }))}
          />
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            tick={axisTick}
            tickFormatter={(v: number) => formatMetric(figure.format, v, true)}
            ticks={ticks}
            domain={[ticks[0], ticks.at(-1)!]}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={compact ? 124 : 196}
            tickLine={false}
            axisLine={false}
            interval={0}
            tick={(p) => <CategoryTick {...p} maxChars={compact ? 18 : 30} />}
          />
          {ticks[0] < 0 && <ReferenceLine x={0} stroke="var(--muted-foreground)" strokeOpacity={0.6} />}
          <Tooltip
            cursor={{ fill: "var(--muted-foreground)", fillOpacity: 0.08 }}
            content={({ active: on, payload }) => (on ? <FigureTooltip figure={figure} index={tooltipIndex(payload)} /> : null)}
            isAnimationActive={false}
            defaultIndex={active ?? undefined}
          />
          <Bar dataKey="range" radius={3} maxBarSize={20} animationDuration={250}>
            {rows.map((r) => (
              <Cell key={r.i} fill={patternUrl(id, r.kind, BRIDGE[r.kind].pattern, BRIDGE[r.kind].color)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// -- legend and table ---------------------------------------------------------------------------------------------------

function FigureLegend({ figure }: { figure: Figure }) {
  const items =
    figure.kind === "bridge"
      ? Object.values(BRIDGE).map((b) => ({
          label: b.label,
          swatch: <PatternSwatch pattern={b.pattern} color={b.color} />,
        }))
      : figure.series.length > 1
        ? figure.series.map((s, i) => ({
            label: s.label,
            swatch: figure.kind === "line" ? <LineSwatch index={i} /> : <PatternSwatch pattern={patternOf(i)} color={colorOf(i)} />,
          }))
        : []
  if (figure.reference && figure.kind !== "line") {
    items.push({
      label: figure.reference.label,
      swatch: <span aria-hidden className="h-3 w-0 border-l-2 border-dashed border-foreground/55" />,
    })
  }
  if (!items.length) return null
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
      {items.map((it) => (
        <li key={it.label} className="inline-flex items-center gap-1.5">
          {it.swatch}
          {it.label}
        </li>
      ))}
    </ul>
  )
}

function LineSwatch({ index }: { index: number }) {
  const dash = DASHES[index % DASHES.length]
  if (!dash) return <MarkerSwatch shape={markerOf(index)} color={colorOf(index)} />
  return (
    <svg width="18" height="10" viewBox="0 0 18 10" aria-hidden className="shrink-0 overflow-visible">
      <line x1="0" y1="5" x2="18" y2="5" stroke={colorOf(index)} strokeWidth="2" strokeDasharray={dash} />
      <MarkerShapeSvg shape={markerOf(index)} cx={9} cy={5} r={3.4} fill={colorOf(index)} />
    </svg>
  )
}

function FigureTable({ figure, scroll }: { figure: Figure; scroll: boolean }) {
  const extra = figure.extraColumns ?? []
  const bridge = figure.kind === "bridge" && figure.steps
  return (
    <ScrollRegion label={`${figure.title}: table`} scroll={scroll} className="max-h-80 overflow-auto">
      <table className="num w-full text-left text-xs">
        <caption className="sr-only">
          {figure.title}. {figure.period}.
        </caption>
        <thead className="sticky top-0 bg-card text-muted-foreground">
          <tr className="border-b border-border">
            <th scope="col" className="py-1.5 pr-3 font-medium">
              {figure.categoryLabel}
            </th>
            {bridge ? (
              <>
                <th scope="col" className="py-1.5 pl-3 text-right font-medium">
                  Amount
                </th>
                <th scope="col" className="py-1.5 pl-3 text-right font-medium">
                  Running total
                </th>
              </>
            ) : (
              figure.series.map((s) => (
                <th key={s.key} scope="col" className="py-1.5 pl-3 text-right font-medium">
                  {s.label}
                </th>
              ))
            )}
            {extra.map((c) => (
              <th key={c.label} scope="col" className="py-1.5 pl-3 text-right font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {figure.categories.map((label, i) => {
            const step = bridge ? figure.steps![i] : null
            return (
              <tr key={label} className="border-b border-border/60 last:border-0">
                <th scope="row" className="py-1.5 pr-3 font-normal text-foreground">
                  {label}
                </th>
                {step ? (
                  <>
                    <td className="py-1.5 pl-3 text-right">
                      {step.kind === "total"
                        ? formatMetric(figure.format, step.amount)
                        : `${step.kind === "up" ? "+" : "−"}${formatMetric(figure.format, step.amount)}`}
                    </td>
                    <td className="py-1.5 pl-3 text-right">{formatMetric(figure.format, step.to)}</td>
                  </>
                ) : (
                  figure.series.map((s) => (
                    <td key={s.key} className="py-1.5 pl-3 text-right">
                      {formatMetric(figure.format, num(s.values[i]))}
                    </td>
                  ))
                )}
                {extra.map((c) => (
                  <td key={c.label} className="py-1.5 pl-3 text-right">
                    {formatMetric(c.format, num(c.values[i]))}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </ScrollRegion>
  )
}
