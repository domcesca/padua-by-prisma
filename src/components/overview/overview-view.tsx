"use client"

import { useEffect, useMemo, useState } from "react"

import { FacilityPicker, type FacilityOption } from "@/components/benchmark/facility-picker"
import { useFindings } from "@/components/findings/use-findings"
import { AboutTool } from "@/components/shell/about-tool"
import { ContextBar } from "@/components/shell/context-bar"
import { LiveStatus } from "@/components/shell/live-status"
import type { BenchmarkResult } from "@/lib/benchmark/compute"
import { filtersToParams, parseFilters, type PeerFilters } from "@/lib/benchmark/filters"
import { APP_FULL_NAME, APP_SUMMARY } from "@/lib/brand"
import type { MetricDef } from "@/lib/data/datasets"
import type { MetricCategory } from "@/lib/data/types"
import { HOME_COUNT } from "@/lib/findings/families"
import { scanChanges } from "@/lib/overview/changes"
import { rememberSelection, useSelection } from "@/lib/selection"
import { useMounted } from "@/lib/use-mounted"
import { CommonActions } from "./common-actions"
import { NeedsAttention } from "./needs-attention"
import { SavedWork } from "./saved-work"
import { UpcomingFilings } from "./upcoming-filings"
import { WhatChanged, type TopicScan } from "./what-changed"

// The Overview (the front door): for the remembered hospital, what needs attention, what changed, what's due, what's
// saved, and shortcuts to the main jobs. Every part reads data the other tools already serve (/api/findings,
// /api/benchmark, the Filing calendar's rules and the pins in this browser); nothing here is calculated anew.
//
// First visit (no hospital remembered): one focused step to pick a hospital, with the same search the context bar
// uses. After that the hospital is remembered (lib/selection.ts, as every tool does) and the Overview opens on it; the
// shared context bar changes the hospital or the peer group.

export type OverviewFacility = FacilityOption & { fiscalYearEnd: string | null; onCalendar: boolean }

const TOPICS: MetricCategory[] = ["financial", "utilization", "quality"]

export function OverviewView({
  facilities,
  catalog,
  latestYear,
  initialFacilityId,
}: {
  facilities: OverviewFacility[]
  catalog: MetricDef[]
  latestYear: number
  /** ?facility= in the link: opens (and remembers) that hospital. */
  initialFacilityId: string | null
}) {
  const mounted = useMounted()
  const selection = useSelection()

  // A hospital in the link becomes the remembered one; the address goes back to plain "/" so a later change in the
  // context bar isn't overridden by it.
  useEffect(() => {
    if (!initialFacilityId) return
    rememberSelection({ facilityId: initialFacilityId })
    window.history.replaceState(null, "", "/")
  }, [initialFacilityId])

  const facilityId = selection?.facilityId ?? initialFacilityId
  const facility = facilities.find((f) => f.id === facilityId) ?? null

  // Before hydration the remembered hospital isn't known; don't flash the first-run step at a returning viewer.
  if (!mounted || (selection == null && !initialFacilityId)) return <OverviewSkeleton />
  if (!facility) return <FirstRun facilities={facilities} latestYear={latestYear} />
  return <Dashboard key={facility.id} facility={facility} facilities={facilities} catalog={catalog} latestYear={latestYear} peerQuery={selection?.peers ?? ""} />
}

function FirstRun({ facilities, latestYear }: { facilities: FacilityOption[]; latestYear: number }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6 pt-4 md:pt-14">
      <div className="space-y-3">
        <p className="text-[13px] font-medium text-muted-foreground">
          {APP_FULL_NAME} · {APP_SUMMARY}
        </p>
        <h1 className="text-[34px] leading-[1.1] font-semibold tracking-tight sm:text-[40px]">Which hospital do you run?</h1>
        <p className="text-[17px] leading-relaxed text-muted-foreground">
          Pick it once. Padua remembers it in this browser and opens on its overview every time: what needs attention against
          similar California hospitals, what changed, what&apos;s due to HCAI, and what you&apos;ve saved.
        </p>
      </div>
      <div data-tour="hospital" className="widget space-y-2 p-5">
        <p className="text-[13px] font-medium">Your hospital</p>
        <FacilityPicker
          facilities={facilities}
          value={null}
          onChange={(id) => rememberSelection({ facilityId: id })}
          latestYear={latestYear}
          placeholder="Search by name, city, or county"
        />
        <p className="text-xs text-muted-foreground">You can change it any time from the bar at the top of every page.</p>
      </div>
      <div className="flex justify-end">
        <AboutTool id="home" />
      </div>
    </div>
  )
}

type Loaded = Partial<Record<MetricCategory, { data: BenchmarkResult | null; error: string | null }>>

/** Compare's standard measures in each topic, for What changed and the context bar's peer group. */
function useTopics(facilityId: string, peerQuery: string) {
  const key = `${facilityId}?${peerQuery}`
  const [state, setState] = useState<{ key: string; loaded: Loaded }>({ key: "", loaded: {} })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    for (const category of TOPICS) {
      const params = new URLSearchParams(peerQuery)
      params.set("facility", facilityId)
      if (category !== "financial") params.set("view", category)
      fetch(`/api/benchmark?${params}`, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? res.statusText)
          return (await res.json()) as BenchmarkResult
        })
        .then(
          (data) => setState((s) => ({ key, loaded: { ...(s.key === key ? s.loaded : {}), [category]: { data, error: null } } })),
          (e: Error) => {
            if (e.name !== "AbortError") setState((s) => ({ key, loaded: { ...(s.key === key ? s.loaded : {}), [category]: { data: null, error: e.message || "failed" } } }))
          }
        )
    }
    return () => controller.abort()
  }, [key, facilityId, peerQuery, attempt])
  const loaded = state.key === key ? state.loaded : {}
  return { loaded, loading: TOPICS.some((c) => !loaded[c]), retry: () => setAttempt((a) => a + 1) }
}

function Dashboard({
  facility,
  facilities,
  catalog,
  latestYear,
  peerQuery,
}: {
  facility: OverviewFacility
  facilities: OverviewFacility[]
  catalog: MetricDef[]
  latestYear: number
  peerQuery: string
}) {
  const metaById = useMemo(() => Object.fromEntries(catalog.map((m) => [m.id, m])), [catalog])
  const findings = useFindings(facility.id, peerQuery)
  const topics = useTopics(facility.id, peerQuery)
  const filters = useMemo(() => parseFilters(new URLSearchParams(peerQuery)), [peerQuery])
  const group = TOPICS.map((c) => topics.loaded[c]?.data).find(Boolean) ?? null

  const scans: TopicScan[] = TOPICS.map((category) => {
    const t = topics.loaded[category]
    if (!t) return { category, scan: null, error: null }
    if (!t.data) return { category, scan: null, error: t.error }
    const metrics = t.data.metrics.map((id) => metaById[id]).filter((m): m is MetricDef => !!m)
    return { category, scan: scanChanges(metrics, t.data.series), error: null }
  })

  const worse = scans.reduce((n, t) => n + (t.scan?.changes.filter((c) => c.worse).length ?? 0), 0)
  const status =
    findings.loading || topics.loading
      ? `Loading the overview for ${facility.name}…`
      : findings.data
        ? `Overview for ${facility.name} loaded: ${Math.min(findings.data.primary.length, HOME_COUNT)} priorit${Math.min(findings.data.primary.length, HOME_COUNT) === 1 ? "y" : "ies"} needing attention, ${worse} measure${worse === 1 ? "" : "s"} that changed for the worse.`
        : ""

  return (
    <div className="space-y-6">
      <LiveStatus message={status} />
      <ContextBar
        facilities={facilities}
        facilityId={facility.id}
        onFacility={(id) => rememberSelection({ facilityId: id })}
        latestYear={latestYear}
        peers={{
          filters,
          applied: group?.filters ?? null,
          count: group ? group.peers.length : null,
          description: group?.peerGroup.description ?? null,
          note: group?.peerGroup.note ?? null,
          onChange: (next: PeerFilters) => rememberSelection({ peers: filtersToParams(next).toString() }),
        }}
        tour={{ hospital: "hospital" }}
        topic="Overview"
      />
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight sm:text-[32px]">{facility.name}</h1>
          <p className="text-[15px] text-muted-foreground">
            What needs attention against its peers, what changed, what&apos;s due, and what you&apos;ve saved.
          </p>
        </div>
        <AboutTool id="home" />
      </header>

      <NeedsAttention facilityId={facility.id} facilityName={facility.name} peerQuery={peerQuery} findings={findings} metaById={metaById} />
      <WhatChanged facilityId={facility.id} peerQuery={peerQuery} topics={scans} loading={topics.loading} retry={topics.retry} />
      <div className="grid gap-6 lg:grid-cols-2">
        <UpcomingFilings facilityId={facility.id} fiscalYearEnd={facility.fiscalYearEnd} onCalendar={facility.onCalendar} />
        <SavedWork facilityId={facility.id} facilityName={facility.name} peerQuery={peerQuery} findings={findings} />
      </div>
      <CommonActions facilityId={facility.id} peerQuery={peerQuery} />
    </div>
  )
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <p className="sr-only" role="status">
        Loading the overview…
      </p>
      <div className="h-12 animate-pulse rounded-2xl bg-black/5 dark:bg-white/6" />
      <div className="h-9 w-1/2 animate-pulse rounded-lg bg-black/5 dark:bg-white/6" />
      {[0, 1].map((i) => (
        <div key={i} className="h-48 animate-pulse rounded-2xl bg-black/4 dark:bg-white/5" />
      ))}
    </div>
  )
}
