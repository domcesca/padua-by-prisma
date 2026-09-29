"use client"

import type { ChartKind, GroupBy } from "@/lib/report/spec"
import { onRadioGroupKeyDown, rovingTabIndex } from "@/lib/radio-group"
import { cn } from "@/lib/utils"

// Reports' "Compare by" choice (V7.5): each option carries a small sketch of the chart (or table) it makes with the
// current "Show as" setting, so the shape is clear before picking. Sketches are decoration; the option's label and
// one-line description carry the meaning.

const W = 72
const H = 40

/** What a grouping makes, as a thumbnail: lines over time, ranked bars, the hospital against a peer band, or a table. */
export function GroupSketch({ groupBy, chart, className }: { groupBy: GroupBy; chart: ChartKind; className?: string }) {
  const shown = groupBy === "facility" && chart === "line" ? "bar" : chart
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className={cn("shrink-0", className)} aria-hidden focusable="false">
      <rect x={0.5} y={0.5} width={W - 1} height={H - 1} rx={6} fill="var(--card)" stroke="var(--border)" />
      {shown === "table" ? <TableSketch rows={groupBy === "facility" ? 5 : 4} /> : groupBy === "year" ? (
        shown === "line" ? <TrendLines /> : <GroupedBars />
      ) : groupBy === "facility" ? (
        <RankedBars />
      ) : shown === "bar" ? (
        <PeerBars />
      ) : (
        <PeerBand />
      )}
    </svg>
  )
}

const FOCUS = "var(--series-1)"
const CONTEXT = "var(--chart-2)"

function TrendLines() {
  return (
    <>
      <polyline points="8,28 22,24 36,26 50,17 64,12" fill="none" stroke={FOCUS} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {[8, 22, 36, 50, 64].map((x, i) => <circle key={x} cx={x} cy={[28, 24, 26, 17, 12][i]} r={1.8} fill={FOCUS} />)}
      <polyline points="8,22 22,21 36,21 50,20 64,19" fill="none" stroke={CONTEXT} strokeWidth={1.5} strokeDasharray="3 2" />
    </>
  )
}

function GroupedBars() {
  const years = [10, 26, 42, 58]
  const focus = [14, 17, 13, 20]
  const peer = [16, 15, 16, 16]
  return (
    <>
      {years.map((x, i) => (
        <g key={x}>
          <rect x={x} y={34 - focus[i]} width={5} height={focus[i]} rx={1} fill={FOCUS} />
          <rect x={x + 6} y={34 - peer[i]} width={5} height={peer[i]} rx={1} fill={CONTEXT} opacity={0.6} />
        </g>
      ))}
      <line x1={6} x2={66} y1={34.5} y2={34.5} stroke="var(--border)" />
    </>
  )
}

function RankedBars() {
  const widths = [50, 44, 38, 31, 24]
  return (
    <>
      {widths.map((w, i) => (
        <rect key={i} x={10} y={6 + i * 6.2} width={w} height={4.2} rx={1} fill={i === 2 ? FOCUS : CONTEXT} opacity={i === 2 ? 1 : 0.55} />
      ))}
      <line x1={9.5} x2={9.5} y1={4} y2={36} stroke="var(--border)" />
    </>
  )
}

function PeerBars() {
  // The hospital, then the peer 75th, median and 25th percentiles, then California.
  const widths = [40, 48, 36, 24, 33]
  return (
    <>
      {widths.map((w, i) => (
        <rect key={i} x={10} y={6 + i * 6.2} width={w} height={4.2} rx={1} fill={i === 0 ? FOCUS : CONTEXT} opacity={i === 0 ? 1 : i === 4 ? 0.3 : 0.55} />
      ))}
      <line x1={9.5} x2={9.5} y1={4} y2={36} stroke="var(--border)" />
    </>
  )
}

function PeerBand() {
  return (
    <>
      <polygon points="8,16 22,15 36,14 50,15 64,13 64,26 50,27 36,27 22,28 8,28" fill={CONTEXT} opacity={0.22} />
      <polyline points="8,22 22,21 36,21 50,21 64,19" fill="none" stroke={CONTEXT} strokeWidth={1.5} />
      <polyline points="8,26 22,22 36,18 50,15 64,11" fill="none" stroke={FOCUS} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </>
  )
}

function TableSketch({ rows }: { rows: number }) {
  const step = 30 / rows
  return (
    <>
      <rect x={8} y={6} width={56} height={3} rx={1} fill="var(--muted-foreground)" opacity={0.5} />
      {Array.from({ length: rows }, (_, i) => (
        <g key={i}>
          <rect x={8} y={12 + i * step} width={22} height={2.4} rx={1} fill={i === 0 ? FOCUS : CONTEXT} opacity={i === 0 ? 1 : 0.55} />
          <rect x={42} y={12 + i * step} width={10} height={2.4} rx={1} fill={CONTEXT} opacity={0.55} />
          <rect x={56} y={12 + i * step} width={8} height={2.4} rx={1} fill={CONTEXT} opacity={0.55} />
        </g>
      ))}
    </>
  )
}

export type GroupChoice = { value: GroupBy; label: string; description: string }

/** "Compare by" as radio cards, each with its sketch: one tab stop, arrow keys move and pick (lib/radio-group). */
export function GroupByChooser({
  value,
  chart,
  choices,
  onChange,
}: {
  value: GroupBy
  chart: ChartKind
  choices: GroupChoice[]
  onChange: (value: GroupBy) => void
}) {
  return (
    <div role="radiogroup" aria-label="Compare by" onKeyDown={onRadioGroupKeyDown} className="grid gap-1.5">
      {choices.map((c, i) => {
        const on = c.value === value
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={rovingTabIndex(on, i, choices.some((x) => x.value === value))}
            onClick={() => onChange(c.value)}
            className={cn(
              "flex items-center gap-3 rounded-xl p-2 text-left transition-[background-color,box-shadow] duration-200",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              on ? "surface ring-accent glow-soft" : "hover:bg-muted/70"
            )}
          >
            <GroupSketch groupBy={c.value} chart={chart} />
            <span className="min-w-0">
              <span className={cn("block text-[13px] font-medium", !on && "text-foreground")}>{c.label}</span>
              <span className="block text-xs leading-snug text-muted-foreground">{c.description}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
