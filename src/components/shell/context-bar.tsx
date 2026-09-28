"use client"

import { Check, ChevronDown, CircleAlert, CircleCheck, Info, SlidersHorizontal, TriangleAlert, Users } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { FacilityPicker, type FacilityOption } from "@/components/benchmark/facility-picker"
import { FilterPill, pillClass } from "@/components/benchmark/filter-pill"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { COHORT_BY_ID, COHORTS, cohortFilters, cohortOf, type CohortId } from "@/lib/benchmark/cohorts"
import type { PeerFilters } from "@/lib/benchmark/filters"
import { peerFit, type PeerFitLevel } from "@/lib/benchmark/peer-fit"
import { setDisplayMode, useDisplayMode, type DisplayMode } from "@/lib/display-mode"
import { QUALITY_FLAGS } from "@/lib/status"
import { cn } from "@/lib/utils"
import { MobileSheet } from "./mobile-sheet"
import { Segmented } from "./segmented"
import { StatusLine, type StatusLineProps } from "./status-line"

// The context every tool works in, in one sticky bar: the hospital, the period, the peer group (with how much to trust
// it), the unit where the tool has one, and whether the data is current. Each part changes in place. The same bar in
// Benchmark, Build, Correlate and Propose, so moving between tools keeps the context in view.
//
// On phones the bar and the tool's own filters are one sticky summary bar with one bottom sheet (MobileSheet), so a
// phone never stacks two sticky bars; Benchmark's Key findings bar sits in the page flow below it.

export type PeriodControl =
  | { kind: "pick"; label: string; summary: string; options: { value: string; label: string }[]; selected: string; onChange: (value: string) => void }
  | { kind: "text"; text: string }

export type PeersControl = {
  /** What was asked for: a preset or custom filters. */
  filters: PeerFilters
  /** What the group was built with (for "similar", the filters chosen automatically); null while loading. */
  applied: PeerFilters | null
  count: number | null
  description: string | null
  /** Why "similar" had to widen. */
  note?: string | null
  onChange: (next: PeerFilters) => void
  /** Benchmark: the full filter controls, shown under the presets (or a sentence, when they're hidden in Guided mode). */
  customEditor?: React.ReactNode | string
}

export type ContextBarProps = {
  facilities: FacilityOption[]
  facilityId: string | null
  onFacility: (id: string) => void
  latestYear: number
  period?: PeriodControl | null
  peers?: PeersControl | null
  /** Benchmark (Utilization): the unit or service line picker. */
  unit?: React.ReactNode
  status?: StatusLineProps | null
  /** Show the Guided / Analysis switch (tools where it changes something). */
  modeToggle?: boolean
  /** Phones: the tool's own filters, below the context in the same sheet. */
  toolControls?: React.ReactNode
  /** Phones: what the tool shows, for the summary bar ("Financials · Medicare"). */
  topic?: string
  /** Phones: how many of the tool's own controls are off their defaults. */
  activeCount?: number
  /** Guided-tour targets (data-tour) for the hospital and peer-group parts. */
  tour?: { hospital?: string; peers?: string }
}

const FIT_STYLE: Record<PeerFitLevel, { icon: typeof CircleCheck; className: string }> = {
  strong: { icon: CircleCheck, className: "bg-primary/10 text-primary" },
  broad: { icon: Users, className: "bg-black/5 text-muted-foreground dark:bg-white/8" },
  limited: { icon: TriangleAlert, className: "bg-warning/12 text-warning" },
}

export function PeerFitBadge({ level, label, reason, className }: { level: PeerFitLevel; label: string; reason?: string; className?: string }) {
  const { icon: Icon, className: tone } = FIT_STYLE[level]
  return (
    <span
      title={reason}
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs leading-tight font-medium whitespace-nowrap", tone, className)}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {label}
      {reason && <span className="sr-only">: {reason}</span>}
    </span>
  )
}

function fitOf(peers: PeersControl) {
  return peers.applied && peers.count != null ? peerFit(peers.applied, peers.count) : null
}

function cohortLabel(peers: PeersControl, facility: FacilityOption | null) {
  const id = cohortOf(peers.filters, facility)
  return id ? COHORT_BY_ID.get(id)!.label : "Custom peer group"
}

/** The presets as radio options, the fit and its reason, and any custom editor. */
function PeersPanel({ peers, facility, onPicked }: { peers: PeersControl; facility: FacilityOption | null; onPicked?: () => void }) {
  const current = cohortOf(peers.filters, facility)
  const fit = fitOf(peers)
  const pick = (id: CohortId) => {
    peers.onChange(cohortFilters(id, facility, peers.filters.includeNonComparable))
    onPicked?.()
  }
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {peers.description && (
          <p className="text-[13px] leading-snug">
            <span className="font-medium">{peers.count ?? "…"} peers:</span> {peers.description.charAt(0).toLowerCase() + peers.description.slice(1)}.
          </p>
        )}
        {fit && (
          <div className="space-y-1">
            <PeerFitBadge level={fit.level} label={fit.label} />
            <p className="text-xs leading-relaxed text-muted-foreground">{fit.reason}</p>
          </div>
        )}
        {peers.note && <p className="text-xs leading-relaxed text-muted-foreground">{peers.note}</p>}
      </div>
      <div role="radiogroup" aria-label="Peer group preset" className="space-y-0.5 border-t border-border pt-2">
        {COHORTS.map((c) => {
          const on = current === c.id
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => pick(c.id)}
              className={cn(
                "flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left outline-none hover:bg-black/4 focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/6",
                on && "bg-primary/8"
              )}
            >
              <Check className={cn("mt-0.5 size-3.5 shrink-0 text-primary", !on && "invisible")} aria-hidden />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium">{c.label}</span>
                <span className="block text-xs leading-snug text-muted-foreground">{c.description}</span>
              </span>
            </button>
          )
        })}
        {current == null && (
          <div className="flex items-start gap-2 rounded-lg bg-primary/8 px-2 py-1.5" role="radio" aria-checked="true">
            <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
            <span className="text-[13px] font-medium">Custom peer group</span>
          </div>
        )}
      </div>
      {typeof peers.customEditor === "string" ? (
        <p className="border-t border-border pt-2 text-xs text-muted-foreground">{peers.customEditor}</p>
      ) : peers.customEditor ? (
        <div className="space-y-1.5 border-t border-border pt-2">
          <p className="text-xs font-medium text-tertiary-foreground">Or set the filters yourself</p>
          {peers.customEditor}
        </div>
      ) : (
        <p className="border-t border-border pt-2 text-xs text-muted-foreground">
          Custom filters (county, radius, ownership, beds) are set in{" "}
          <Link href={facility ? `/compare?facility=${facility.id}` : "/compare"} className="font-medium text-primary hover:underline">
            Compare
          </Link>{" "}
          and carry over here.
        </p>
      )}
    </div>
  )
}

function StatusSummary({ status }: { status: StatusLineProps }) {
  const flag = status.flags?.[0]
  return (
    <>
      {flag ? <CircleAlert className="size-3.5 shrink-0 text-warning" aria-hidden /> : <Info className="size-3.5 shrink-0 opacity-60" aria-hidden />}
      <span className="truncate">
        {status.through ? `Data through ${status.through}` : "No data"}
        {flag ? ` · ${QUALITY_FLAGS[flag].label}` : status.audit ? ` · ${status.audit.replace(/ \(.*\)$/, "")}` : ""}
      </span>
    </>
  )
}

export function ModeToggle({ className }: { className?: string }) {
  const mode = useDisplayMode()
  return (
    <Segmented<DisplayMode>
      label="Display mode"
      size="sm"
      value={mode}
      onChange={setDisplayMode}
      options={[
        { value: "guided", label: "Guided" },
        { value: "analysis", label: "Analysis" },
      ]}
      className={className}
    />
  )
}

export function ContextBar(props: ContextBarProps) {
  const { facilities, facilityId, onFacility, latestYear, period, peers, unit, status, modeToggle, toolControls, topic, activeCount = 0, tour } = props
  const facility = facilities.find((f) => f.id === facilityId) ?? null
  const [peersOpen, setPeersOpen] = useState(false)
  const fit = peers ? fitOf(peers) : null
  const mode = useDisplayMode()
  const hasFilters = !!(toolControls || peers || period || unit)

  const periodPill =
    period?.kind === "pick" ? (
      <FilterPill
        label={period.label}
        summary={period.summary}
        active={false}
        options={period.options}
        selected={[period.selected]}
        onChange={([v]) => v && period.onChange(v)}
      />
    ) : period?.kind === "text" ? (
      <span className="inline-flex h-8 items-center px-1 text-[13px] whitespace-nowrap text-muted-foreground">{period.text}</span>
    ) : null

  return (
    <>
      {/* md up: the bar itself, a rounded panel like the rest of the page, pinned just below the top edge. */}
      <div
        role="region"
        aria-label="Context"
        className="glass-strong sticky top-3 z-20 hidden rounded-2xl px-3 py-2 md:block print:hidden"
      >
        <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5">
          <span data-tour={tour?.hospital} className="inline-flex max-w-full">
            <FacilityPicker
              facilities={facilities}
              value={facilityId}
              onChange={onFacility}
              latestYear={latestYear}
              placeholder="Choose a hospital"
              variant="pill"
            />
          </span>
          {facility && periodPill}
          {facility && peers && (
            <Popover open={peersOpen} onOpenChange={setPeersOpen}>
              <PopoverTrigger data-tour={tour?.peers} className={pillClass(false)} aria-label={`Peer group: ${cohortLabel(peers, facility)}${fit ? `, ${fit.label}` : ""}. Change peer group`}>
                <Users className="size-3.5 opacity-60" aria-hidden />
                <span className="max-w-52 truncate font-medium">{cohortLabel(peers, facility)}</span>
                {peers.count != null && <span className="num text-muted-foreground">{peers.count}</span>}
                {fit && <PeerFitBadge level={fit.level} label={fit.label} className="-mr-1" />}
                <ChevronDown className="size-3.5 opacity-60" aria-hidden />
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[26rem] max-w-[calc(100vw-2rem)] p-3">
                <PeersPanel peers={peers} facility={facility} onPicked={() => setPeersOpen(false)} />
              </PopoverContent>
            </Popover>
          )}
          {facility && unit}
          {facility && status && (
            <Popover>
              <PopoverTrigger
                className={cn(pillClass(false), "max-w-64 text-muted-foreground")}
                aria-label={`Data status: ${status.through ? `data through ${status.through}` : "no data"}${status.flags?.length ? `, ${status.flags.map((f) => QUALITY_FLAGS[f].label).join(", ")}` : ""}. Details`}
              >
                <StatusSummary status={status} />
              </PopoverTrigger>
              <PopoverContent align="start" className="w-96 max-w-[calc(100vw-2rem)] p-3">
                <p className="text-[13px] font-medium">Data status</p>
                <StatusLine {...status} />
              </PopoverContent>
            </Popover>
          )}
        </div>
          {modeToggle && <ModeToggle className="shrink-0" />}
        </div>
      </div>

      {/* Phones: one pinned summary bar; the context and the tool's filters share one sheet. */}
      <MobileSheet
        sticky
        title={hasFilters ? "Context and filters" : "Hospital"}
        triggerLabel={hasFilters ? `Context and filters${activeCount ? `: ${activeCount} set` : ""}` : "Change hospital"}
        summary={
          <>
            <p className="truncate text-[13px] leading-tight font-semibold">{facility?.name ?? "No hospital chosen"}</p>
            <p className="truncate text-xs leading-tight text-muted-foreground">
              {fit && (
                <span className={cn("font-medium", fit.level === "limited" ? "text-warning" : fit.level === "strong" ? "text-primary" : "text-foreground")}>
                  {fit.label} ·{" "}
                </span>
              )}
              {[peers && facility ? cohortLabel(peers, facility) : null, period?.kind === "pick" ? period.summary : period?.text, topic]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </>
        }
        trigger={
          <>
            <SlidersHorizontal className="size-3.5" aria-hidden />
            {hasFilters ? "Filters" : "Change"}
            {activeCount > 0 && (
              <span className="num rounded-full bg-primary px-1.5 text-xs leading-5 text-primary-foreground" aria-hidden>
                {activeCount}
              </span>
            )}
          </>
        }
      >
        <section aria-label="Context" className="space-y-3">
          <FacilityPicker facilities={facilities} value={facilityId} onChange={onFacility} latestYear={latestYear} />
          {facility && (periodPill || unit) && (
            <div className="flex flex-wrap items-center gap-2">
              {periodPill}
              {unit}
            </div>
          )}
          {facility && peers && (
            <div className="glass rounded-xl p-3">
              <p className="mb-2 text-[13px] font-semibold">Peer group</p>
              <PeersPanel peers={peers} facility={facility} />
            </div>
          )}
          {facility && status && <StatusLine {...status} />}
          {modeToggle && (
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-medium">Display</p>
              <ModeToggle />
            </div>
          )}
        </section>
        {toolControls && (
          <section aria-label="Filters" className="space-y-3 border-t border-border pt-3">
            {toolControls}
          </section>
        )}
        {modeToggle && mode === "guided" && (
          <p className="text-xs text-muted-foreground">Guided shows fewer metrics and controls. Switch to Analysis for everything.</p>
        )}
      </MobileSheet>
    </>
  )
}
