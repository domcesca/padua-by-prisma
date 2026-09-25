"use client"

import { ChevronRight, Info } from "lucide-react"
import { useState } from "react"

import { SourceTag } from "@/components/propose/source-tag"
import { StandingBadge } from "@/components/shell/standing"
import { StatusLine } from "@/components/shell/status-line"
import { metricStanding, rankText } from "@/lib/favorability"
import { CONTEXT_REASONS } from "@/lib/favorability/directions"
import { formatInt } from "@/lib/format"
import type { ComponentRow, LinePeerStats, LineRow, LineValues, ServiceLineRollup } from "@/lib/service-lines/compute"
import { cn } from "@/lib/utils"
import { FilterPill } from "./filter-pill"

// Benchmark's service lines: HCAI's bed classifications grouped (lib/service-lines/lines.ts), each line's combined
// figures with its classifications listed underneath, so the rollup and the breakdown sit side by side. Every figure
// is HCAI public data, summed; nothing is assumed.

/** The line column stays put while the numbers scroll sideways on a narrow screen. */
const STICKY = "sticky left-0 z-10 w-[11rem] min-w-[11rem] bg-background sm:static sm:w-auto sm:bg-transparent"

const pct = (v: number | null | undefined) => (v != null ? `${v.toFixed(1)}%` : null)
const int = (v: number | null | undefined) => (v != null ? formatInt(Math.round(v)) : null)
const days = (v: number | null | undefined) => (v != null ? v.toFixed(1) : null)

/** Occupancy isn't favorable or unfavorable in itself: the label says so, and the rank follows. */
function standing(peers: LinePeerStats) {
  if (peers.percentile == null || peers.reporting === 0) return null
  const s = metricStanding("occupancy", peers.percentile, peers.reporting)!
  return (
    <span className="mt-0.5 flex flex-col items-end gap-0.5">
      <StandingBadge standing={s} short title={s === "depends" ? CONTEXT_REASONS.occupancy : undefined} />
      <span>{rankText(peers.percentile, peers.reporting)}</span>
    </span>
  )
}

export function ServiceLinePanel({
  rollup,
  focus,
  onLine,
  onUnit,
  loading,
}: {
  rollup: ServiceLineRollup
  /** One line's id to show only that line (its breakdown); null for every line. */
  focus: string | null
  /** A combined line's own view. */
  onLine: (id: string) => void
  /** A bed classification's own view. */
  onUnit: (id: string) => void
  loading: boolean
}) {
  const [picked, setPicked] = useState<number | null>(null)
  const yearData = rollup.years.find((y) => y.year === picked) ?? rollup.years[0]
  if (!yearData) {
    return (
      <p className="glass rounded-2xl px-5 py-4 text-sm text-muted-foreground">HCAI has no unit data for this hospital.</p>
    )
  }
  const lines = focus ? yearData.lines.filter((l) => l.id === focus) : yearData.lines
  const focused = focus ? lines[0] : null

  return (
    <div className={cn("space-y-4 transition-opacity duration-200", loading && "opacity-60")}>
      {!focus && <ScopeNote rollup={rollup} year={yearData.year} />}
      <section aria-label={focused ? `What's in ${focused.label}` : "Service lines"} className="glass overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5 pb-2">
          <div className="flex flex-wrap items-center gap-2">
            {focus && <SourceTag kind="data">Public data · HCAI {yearData.year}</SourceTag>}
            <h3 className="text-sm font-medium">
              {focused ? `What's in ${focused.label}, ${yearData.year}` : `Service lines, ${yearData.year}`}
            </h3>
          </div>
          {rollup.years.length > 1 && (
            <FilterPill
              label="Year"
              summary={String(yearData.year)}
              options={rollup.years.map((y) => ({ value: String(y.year), label: String(y.year) }))}
              selected={[String(yearData.year)]}
              onChange={([v]) => setPicked(Number(v))}
            />
          )}
        </div>
        <StatusLine
          className="px-4 pb-2.5"
          through={String(yearData.year)}
          periodType="Calendar year"
          published={rollup.source.published[yearData.year] ? `Published ${rollup.source.published[yearData.year]}` : null}
          processed={`Processed ${rollup.source.processed}`}
          flags={[
            ...(rollup.years[0].year < rollup.latestYear ? (["stale"] as const) : []),
            ...(yearData.annualized ? (["partial-period"] as const) : []),
          ]}
          flagDetail={{ stale: `This hospital's latest report is ${rollup.years[0].year}; HCAI has published ${rollup.latestYear}.` }}
        />
        {focus && !focused ? (
          <p className="px-4 pb-4 text-[13px] text-muted-foreground">The hospital had none of this line&apos;s units in {yearData.year}.</p>
        ) : (
          <LineTable lines={lines} total={focus ? null : yearData.total} focus={!!focus} onLine={onLine} onUnit={onUnit} />
        )}
        <Footnotes lines={lines} peerCount={rollup.peerGroup.count} />
      </section>
    </div>
  )
}

function ScopeNote({ rollup, year }: { rollup: ServiceLineRollup; year: number }) {
  const [open, setOpen] = useState(false)
  return (
    <section aria-label="What this covers" className="glass rounded-2xl px-5 py-4 text-[13px] leading-relaxed">
      <div className="flex flex-wrap items-center gap-2">
        <SourceTag kind="data">Public data · HCAI {year}</SourceTag>
        <p className="font-medium">Units grouped into service lines, every payer.</p>
      </div>
      <p className="mt-1.5 text-muted-foreground">
        A unit is the hospital&apos;s beds in one of HCAI&apos;s bed classifications. Each line adds up the licensed
        beds, patient days, and discharges its units reported, and recomputes occupancy and length of stay from those
        totals. Every unit is in exactly one line, so the lines add up to the hospital&apos;s own totals. Each line&apos;s
        units are listed under it.
      </p>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-medium text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} aria-hidden />
        How the lines are combined
      </button>
      {open && (
        <ul className="fade-up mt-1.5 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Occupancy = the line&apos;s patient days ÷ its licensed bed days, as for the whole hospital.</li>
          <li>
            Average length of stay = patient days ÷ stays. For critical care (including the NICU) and skilled nursing, HCAI
            ends a stay at a transfer out to a general acute bed as well as at a discharge, so for lines with those units
            it&apos;s time in the unit, not the whole hospital stay.
          </li>
          <li>
            Licensed beds are as of December 31. A unit that closed during the year still counts toward its
            line&apos;s patient days and discharges.
          </li>
          <li>
            The well-baby nursery is listed under Maternity &amp; Newborn but isn&apos;t in its totals: bassinets aren&apos;t
            licensed beds, so there&apos;s no occupancy, and a baby moved from the NICU to the nursery would be counted twice.
          </li>
          <li>
            Where a hospital reported beds for a unit but left its patient days or discharges blank, the
            combined line counts that as none, as HCAI&apos;s own hospital totals do; the unit&apos;s row shows
            the blank.
          </li>
          <li>
            Peer medians count only peers with the line that year. Source:{" "}
            <a href={rollup.sourcePage} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              HCAI Hospital Annual Utilization Report
            </a>{" "}
            (page 3, bed classifications).
          </li>
        </ul>
      )}
    </section>
  )
}

function LineTable({
  lines,
  total,
  focus,
  onLine,
  onUnit,
}: {
  lines: LineRow[]
  total: LineValues | null
  focus: boolean
  onLine: (id: string) => void
  onUnit: (id: string) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] text-[13px]">
        <caption className="sr-only">
          Licensed beds, patient days, discharges, occupancy with the peer median, and average length of stay by service
          line, each followed by its units.
        </caption>
        <thead>
          <tr className="border-y border-border text-left text-xs text-tertiary-foreground">
            <th scope="col" className={cn(STICKY, "px-4 py-2.5 font-medium")}>
              {focus ? "Line and units" : "Service line"}
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">Licensed beds</th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">Patient days</th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">Discharges</th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">Occupancy</th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">Peer median occupancy</th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">Avg. length of stay</th>
          </tr>
        </thead>
        {lines.map((line) => {
          const combined = line.units.length > 1
          return (
            <tbody key={line.id} className="border-b border-border/60 last:border-0">
              <tr className="hover:bg-black/3 dark:hover:bg-white/4">
                <th scope="row" className={cn(STICKY, "px-4 pt-2.5 pb-2 text-left font-normal")}>
                  <LineName line={line} onSelect={focus ? undefined : () => (combined ? onLine(line.id) : onUnit(line.units[0]))} />
                </th>
                <Cells values={line.values} strong />
                <td className="num px-3 py-2 text-right whitespace-nowrap text-muted-foreground">
                  {pct(line.peers.occupancy) ?? "—"}
                  <span className="block text-xs text-tertiary-foreground">
                    {standing(line.peers) ?? `${line.peers.reporting} peer${line.peers.reporting === 1 ? "" : "s"} with it`}
                  </span>
                </td>
                <StayCell value={line.values.alos} timeInUnit={!!line.timeInUnit} strong />
              </tr>
              {combined &&
                line.components.map((c) => (
                  <tr key={c.id} className="text-muted-foreground hover:bg-black/3 dark:hover:bg-white/4">
                    <th scope="row" className={cn(STICKY, "py-1.5 pr-4 pl-8 text-left font-normal")}>
                      <button type="button" onClick={() => onUnit(c.id)} className="rounded text-left outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                        {c.label}
                      </button>
                      {c.blank.length > 0 && <span className="block text-xs text-tertiary-foreground">{blankNote(c)}</span>}
                    </th>
                    <Cells values={c.values} />
                    <td />
                    <StayCell value={c.values.alos} timeInUnit={c.timeInUnit} />
                  </tr>
                ))}
              {line.nursery && (
                <tr className="text-muted-foreground">
                  <th scope="row" className={cn(STICKY, "py-1.5 pr-4 pl-8 text-left font-normal")}>
                    Well-baby nursery
                    <span className="block text-xs text-tertiary-foreground">Not in the line&apos;s totals</span>
                  </th>
                  <td className="px-3 py-1.5 text-right text-[12px] text-tertiary-foreground">Bassinets</td>
                  <td className="num px-3 py-1.5 text-right whitespace-nowrap">{int(line.nursery.inpatientDays) ?? "—"}</td>
                  <td className="num px-3 py-1.5 text-right whitespace-nowrap">
                    {int(line.nursery.infants) ?? "—"}
                    <span className="block text-xs text-tertiary-foreground">infants</span>
                  </td>
                  <td className="px-3 py-1.5 text-right text-[12px] text-tertiary-foreground">n/a</td>
                  <td />
                  <td />
                </tr>
              )}
            </tbody>
          )
        })}
        {total && (
          <tfoot>
            <tr className="border-t border-border">
              <th scope="row" className={cn(STICKY, "px-4 py-2.5 text-left font-medium")}>
                Whole hospital
              </th>
              <Cells values={total} strong />
              <td />
              <td className="num px-4 py-2.5 text-right whitespace-nowrap font-semibold">{days(total.alos) ?? "—"}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

function Cells({ values, strong = false }: { values: LineValues; strong?: boolean }) {
  const cls = cn("num px-3 text-right whitespace-nowrap", strong ? "py-2 font-semibold text-foreground" : "py-1.5")
  return (
    <>
      <td className={cls}>{int(values.licensedBeds) ?? "—"}</td>
      <td className={cls}>{int(values.inpatientDays) ?? "—"}</td>
      <td className={cls}>{int(values.discharges) ?? "—"}</td>
      <td className={cls}>{pct(values.occupancy) ?? "—"}</td>
    </>
  )
}

function StayCell({ value, timeInUnit, strong = false }: { value: number | null; timeInUnit: boolean; strong?: boolean }) {
  return (
    <td className={cn("num px-4 text-right whitespace-nowrap", strong ? "py-2 font-semibold text-foreground" : "py-1.5")}>
      {days(value) ?? "—"}
      {value != null && timeInUnit && <span className="block text-xs font-normal text-tertiary-foreground">time in unit</span>}
    </td>
  )
}

function blankNote(c: ComponentRow) {
  const what = c.blank.map((b) => (b === "inpatientDays" ? "patient days" : "discharges")).join(" and ")
  return `${what.charAt(0).toUpperCase()}${what.slice(1)} left blank`
}

function LineName({ line, onSelect }: { line: LineRow; onSelect?: () => void }) {
  const name = <span className="font-medium text-foreground">{line.label}</span>
  return (
    <span className="block min-w-0">
      {onSelect ? (
        <button type="button" onClick={onSelect} className="rounded text-left outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
          {name}
        </button>
      ) : (
        name
      )}
      {line.note && (
        <span className="group relative ml-1 inline-block align-[-2px]">
          <button type="button" className="rounded-full text-tertiary-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" aria-label={`About ${line.label}`}>
            <Info className="size-3.5" aria-hidden />
          </button>
          <span
            role="tooltip"
            className="pointer-events-none absolute top-full left-0 z-20 mt-1.5 hidden w-72 max-w-[calc(100vw-3rem)] rounded-lg bg-popover px-3 py-2 text-[12px] leading-relaxed font-normal text-popover-foreground shadow-lg ring-1 ring-border group-focus-within:block group-hover:block"
          >
            {line.note}
          </span>
        </span>
      )}
      {line.units.length === 1 && line.components[0] && line.components[0].label !== line.label && <span className="block text-xs text-tertiary-foreground">One unit: {line.components[0]?.label}</span>}
      {line.blank && <span className="block text-xs text-tertiary-foreground">Includes a blank, counted as none</span>}
    </span>
  )
}

function Footnotes({ lines, peerCount }: { lines: LineRow[]; peerCount: number }) {
  const stayKinds = [...new Set(lines.map((l) => l.timeInUnit).filter(Boolean))]
  return (
    <div className="space-y-1 border-t border-border px-4 py-3 text-xs leading-relaxed text-tertiary-foreground">
      {lines.length > 1 && <p>Choose a line or a unit to see its trend against peers.</p>}
      {stayKinds.length > 0 && (
        <p>
          &ldquo;Time in unit&rdquo;: per HCAI&apos;s instructions a critical care (including NICU) or skilled nursing stay
          ends at a discharge or a transfer out to a general acute bed, so its length of stay is time in that unit, not the
          whole hospital stay.
        </p>
      )}
      {lines.length === 1 && lines[0].note && <p>{lines[0].note}</p>}
      <p>Peer median occupancy counts only the peers (of {formatInt(peerCount)}) that had the line that year.</p>
    </div>
  )
}
