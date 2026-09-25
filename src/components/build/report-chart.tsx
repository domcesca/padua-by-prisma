"use client"

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import type { MetricDef } from "@/lib/data/datasets"
import { formatMetric } from "@/lib/format"
import { niceTicks } from "@/lib/ticks"
import type { ChartKind, ReportPanel, ReportSeries } from "@/lib/report/spec"
import { cn } from "@/lib/utils"

// Colors are theme tokens (globals.css) so light/dark switch without re-rendering.
// Hospitals take categorical slots in a fixed order; peer and state statistics
// are neutral gray context.
export function seriesColor(series: ReportSeries, panel: ReportPanel) {
  if (series.role === "peer" || series.role === "state") return "var(--chart-2)"
  const hospitals = panel.series.filter((s) => s.role === "focus" || s.role === "compare")
  return `var(--series-${Math.min(hospitals.indexOf(series), 4) + 1})`
}

type Row = ReportPanel["rows"][number]
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)

export function ReportChart({ panel, metric, chart }: { panel: ReportPanel; metric: MetricDef; chart: ChartKind }) {
  if (chart === "table") return <ReportTable panel={panel} metric={metric} />
  if (panel.rowKind === "year") return chart === "line" ? <YearLines panel={panel} metric={metric} /> : <YearBars panel={panel} metric={metric} />
  return <RankedBars panel={panel} metric={metric} />
}

// -- by year: one line per hospital, peer/state medians as gray context ---------

function YearLines({ panel, metric }: { panel: ReportPanel; metric: MetricDef }) {
  const band = panel.rows.some((r) => "p25" in r)
  const data = panel.rows.map((r) => ({ ...r, band: num(r.p25) != null && num(r.p75) != null ? [r.p25, r.p75] : null }))
  const ticks = niceTicks(valuesOf(panel), includeZero(metric))
  return (
    <div className="h-64 w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--border)" }} tick={axisTick} tickMargin={8} />
          <YAxis width={52} tickLine={false} axisLine={false} tick={axisTick} tickFormatter={(v: number) => formatMetric(metric, v, true)} ticks={ticks} domain={[ticks[0], ticks.at(-1)!]} allowDataOverflow />
          {ticks[0] < 0 && <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />}
          <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.4 }} content={({ active, payload, label }) => <PanelTooltip active={active} payload={payload} label={label} panel={panel} metric={metric} />} isAnimationActive={false} />
          {band && <Area dataKey="band" stroke="none" fill="var(--chart-2)" fillOpacity={0.14} activeDot={false} connectNulls animationDuration={250} />}
          {panel.series.map((s) => {
            const color = seriesColor(s, panel)
            const context = s.role === "peer" || s.role === "state"
            return (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stroke={color}
                strokeWidth={2}
                strokeDasharray={s.role === "state" ? "4 4" : undefined}
                strokeLinecap="round"
                dot={context ? false : { r: 4, fill: color, stroke: "var(--card)", strokeWidth: 2 }}
                activeDot={context ? false : { r: 5.5, fill: color, stroke: "var(--card)", strokeWidth: 2 }}
                connectNulls={context}
                animationDuration={250}
              />
            )
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function YearBars({ panel, metric }: { panel: ReportPanel; metric: MetricDef }) {
  const ticks = niceTicks(valuesOf(panel), true)
  const shown = panel.series.filter((s) => s.role !== "state")
  return (
    <div className="h-64 w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={panel.rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--border)" }} tick={axisTick} tickMargin={8} />
          <YAxis width={52} tickLine={false} axisLine={false} tick={axisTick} tickFormatter={(v: number) => formatMetric(metric, v, true)} ticks={ticks} domain={[ticks[0], ticks.at(-1)!]} allowDataOverflow />
          <Tooltip cursor={{ fill: "var(--muted-foreground)", fillOpacity: 0.08 }} content={({ active, payload, label }) => <PanelTooltip active={active} payload={payload} label={label} panel={panel} metric={metric} />} isAnimationActive={false} />
          {shown.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={seriesColor(s, panel)} fillOpacity={s.role === "peer" ? 0.45 : 1} radius={[4, 4, 0, 0]} maxBarSize={28} animationDuration={250} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// -- by hospital / vs peer group: horizontal bars, labeled at the tip ------------

function RankedBars({ panel, metric }: { panel: ReportPanel; metric: MetricDef }) {
  const rows = panel.rows.filter((r) => num(r.value) != null)
  const values = rows.map((r) => r.value as number)
  const ticks = niceTicks(values, true)
  const height = Math.max(120, rows.length * 30 + 36)
  return (
    <div className="w-full" style={{ height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 64, bottom: 0, left: 0 }} barCategoryGap={4}>
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis type="number" tickLine={false} axisLine={false} tick={axisTick} tickFormatter={(v: number) => formatMetric(metric, v, true)} ticks={ticks} domain={[ticks[0], ticks.at(-1)!]} />
          <YAxis type="category" dataKey="label" width={176} tickLine={false} axisLine={false} interval={0} tick={(props) => <CategoryTick {...props} rows={rows} />} />
          {ticks[0] < 0 && <ReferenceLine x={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />}
          <Tooltip cursor={{ fill: "var(--muted-foreground)", fillOpacity: 0.08 }} content={({ active, payload, label }) => <PanelTooltip active={active} payload={payload} label={label} panel={panel} metric={metric} />} isAnimationActive={false} />
          <Bar dataKey="value" name={metric.label} radius={4} maxBarSize={22} animationDuration={250}>
            {rows.map((r) => (
              <Cell
                key={r.key}
                fill={r.role === "focus" ? "var(--series-1)" : "var(--chart-2)"}
                fillOpacity={r.role === "focus" ? 1 : r.role === "state" ? 0.3 : 0.5}
              />
            ))}
            <LabelList dataKey="value" content={(p) => <TipLabel {...(p as TipLabelProps)} metric={metric} />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

type TipLabelProps = { x?: number; y?: number; width?: number; height?: number; value?: number }

function TipLabel({ x = 0, y = 0, width = 0, height = 0, value, metric }: TipLabelProps & { metric: MetricDef }) {
  if (value == null) return null
  const negative = value < 0
  const tipX = negative ? Math.min(x, x + width) - 6 : Math.max(x, x + width) + 6
  return (
    <text x={tipX} y={y + height / 2} dy="0.35em" textAnchor={negative ? "end" : "start"} className="num" fontSize={11} fill="var(--foreground)">
      {formatMetric(metric, value, true)}
    </text>
  )
}

function CategoryTick({ x, y, payload, rows }: { x?: number | string; y?: number | string; payload?: { value: string }; rows: Row[] }) {
  const label = payload?.value ?? ""
  const focus = rows.find((r) => r.label === label)?.role === "focus"
  const short = label.length > 26 ? `${label.slice(0, 25)}…` : label
  return (
    <text x={Number(x) - 8} y={Number(y)} dy="0.35em" textAnchor="end" fontSize={11} fill={focus ? "var(--foreground)" : "var(--muted-foreground)"} fontWeight={focus ? 600 : 400}>
      <title>{label}</title>
      {short}
    </text>
  )
}

// -- table view (always available; also the screen-reader view of every chart) ---

export function ReportTable({ panel, metric, className }: { panel: ReportPanel; metric: MetricDef; className?: string }) {
  const snapshot = panel.rowKind !== "year"
  const band = panel.rows.some((r) => "p25" in r)
  const columns = snapshot ? [{ key: "value", label: panel.year != null ? String(panel.year) : metric.label }] : panel.series.map((s) => ({ key: s.key, label: s.label }))
  return (
    <div className={cn("max-h-96 overflow-auto", className)}>
      <table className="num w-full text-left text-xs">
        <thead className="sticky top-0 bg-card text-muted-foreground">
          <tr className="border-b border-border">
            <th className="py-1.5 pr-3 font-medium">{panel.rowKind === "year" ? "Year" : panel.rowKind === "facility" ? "Hospital" : ""}</th>
            {columns.map((c) => (
              <th key={c.key} className="max-w-40 truncate py-1.5 pl-3 text-right font-medium" title={c.label}>
                {c.label}
              </th>
            ))}
            {band && <th className="py-1.5 pl-3 text-right font-medium">Peer middle 50%</th>}
          </tr>
        </thead>
        <tbody>
          {panel.rows.map((r) => (
            <tr key={r.key} className={cn("border-b border-border last:border-0", r.role === "focus" && "font-semibold")}>
              <td className="max-w-56 truncate py-1.5 pr-3" title={r.label}>
                {r.label}
              </td>
              {columns.map((c) => (
                <td key={c.key} className="py-1.5 pl-3 text-right">
                  {formatMetric(metric, num(r[c.key]))}
                </td>
              ))}
              {band && (
                <td className="py-1.5 pl-3 text-right text-muted-foreground">
                  {num(r.p25) != null ? `${formatMetric(metric, num(r.p25), true)}–${formatMetric(metric, num(r.p75), true)}` : "—"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ReportLegend({ panel }: { panel: ReportPanel }) {
  if (panel.rowKind !== "year") {
    return (
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <LegendItem swatch={<span className="size-2.5 rounded-sm bg-(--series-1)" />}>Selected hospital</LegendItem>
        <LegendItem swatch={<span className="size-2.5 rounded-sm bg-(--chart-2)/50" />}>
          {panel.rowKind === "stat" ? "Peer group" : "Other hospitals"}
        </LegendItem>
        {panel.rowKind === "stat" && <LegendItem swatch={<span className="size-2.5 rounded-sm bg-(--chart-2)/30" />}>California</LegendItem>}
      </div>
    )
  }
  const band = panel.rows.some((r) => "p25" in r)
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
      {panel.series.map((s) => (
        <LegendItem
          key={s.key}
          swatch={
            s.role === "state" ? (
              <span className="w-4 border-t-2 border-dashed" style={{ borderColor: seriesColor(s, panel) }} />
            ) : (
              <span className="relative flex h-2 w-4 items-center">
                <span className="h-0.5 w-full rounded-full" style={{ background: seriesColor(s, panel) }} />
                {s.role !== "peer" && <span className="absolute left-1/2 size-2 -translate-x-1/2 rounded-full" style={{ background: seriesColor(s, panel) }} />}
              </span>
            )
          }
        >
          <span className="max-w-56 truncate">{s.label}</span>
        </LegendItem>
      ))}
      {band && <LegendItem swatch={<span className="h-2.5 w-4 rounded-sm bg-(--chart-2)/25" />}>Peer middle 50%</LegendItem>}
    </div>
  )
}

function LegendItem({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="flex w-4 shrink-0 justify-center">{swatch}</span>
      {children}
    </span>
  )
}

function PanelTooltip({
  active,
  payload,
  label,
  panel,
  metric,
}: {
  active?: boolean
  payload?: readonly { payload?: unknown }[]
  label?: string | number
  panel: ReportPanel
  metric: MetricDef
}) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload as Row | undefined
  if (!row) return null
  const lines =
    panel.rowKind === "year"
      ? panel.series.map((s) => ({ key: s.key, label: s.label, color: seriesColor(s, panel), value: num(row[s.key]) }))
      : [{ key: "value", label: metric.label, color: row.role === "focus" ? "var(--series-1)" : "var(--chart-2)", value: num(row.value) }]
  return (
    <div className="min-w-52 rounded-xl bg-popover/95 px-3 py-2.5 text-xs shadow-lg ring-1 ring-black/5 backdrop-blur-md dark:ring-white/10">
      <p className="mb-1.5 max-w-64 truncate font-medium">{label ?? row.label}</p>
      <dl className="space-y-1">
        {lines.map((l) => (
          <div key={l.key} className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-full" style={{ background: l.color }} />
            <dt className="max-w-44 flex-1 truncate text-muted-foreground">{l.label}</dt>
            <dd className="num font-medium">{formatMetric(metric, l.value)}</dd>
          </div>
        ))}
      </dl>
      {"n" in row && typeof row.n === "number" && <p className="mt-2 text-muted-foreground">{row.n} peers reporting</p>}
    </div>
  )
}

// -- helpers ------------------------------------------------------------------

const axisTick = { fontSize: 11, fill: "var(--muted-foreground)" }

function includeZero(metric: MetricDef) {
  if (metric.id === "operatingMargin") return false
  return metric.unit === "count" || metric.unit === "pct" || metric.unit === "ratio"
}

function valuesOf(panel: ReportPanel) {
  const keys = [...panel.series.map((s) => s.key), "p25", "p75"]
  return panel.rows.flatMap((r) => keys.map((k) => num(r[k]))).filter((v): v is number => v != null)
}
