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
import { HOME_COUNT } from "@/lib/findings/families"
import { rememberSelection, useSelection } from "@/lib/selection"
import { useMounted } from "@/lib/use-mounted"
import { AnnualReportBody, ReportContents, useAnnualReport } from "./annual-report"
import { CommonActions } from "./common-actions"
import { NeedsAttention } from "./needs-attention"
import { SavedWork } from "./saved-work"
import { FilingBanner } from "./upcoming-filings"

// The Overview (the front door, V7.5.5): the remembered hospital's annual report from its own HCAI filings
// (annual-report.tsx, /api/report/[id]), under a top strip with its next filing and what needs attention against its
// peers (the page's one peer comparison, labeled), beside a sidebar of saved work and shortcuts (the footer on phones).
//
// First visit (no hospital remembered): one focused step to pick a hospital, with the same search the context bar
// uses. After that the hospital is remembered (lib/selection.ts, as every tool does) and the Overview opens on it; the
// shared context bar changes the hospital or the peer group.

export type OverviewFacility = FacilityOption & { fiscalYearEnd: string | null; onCalendar: boolean }

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
          Pick it once. Padua remembers it in this browser and opens on its annual report every time, written from its own
          HCAI filings, with what&apos;s due to HCAI, what needs attention against similar California hospitals, and what
          you&apos;ve saved.
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

/** Compare's financial result for the context bar's peer group (who the peers are and how well they fit). */
function usePeerGroup(facilityId: string, peerQuery: string) {
  const key = `${facilityId}?${peerQuery}`
  const [state, setState] = useState<{ key: string; data: BenchmarkResult | null } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams(peerQuery)
    params.set("facility", facilityId)
    fetch(`/api/benchmark?${params}`, { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<BenchmarkResult>) : null))
      .then(
        (data) => setState({ key, data }),
        (e: Error) => {
          if (e.name !== "AbortError") setState({ key, data: null })
        }
      )
    return () => controller.abort()
  }, [key, facilityId, peerQuery])
  return state?.key === key ? state.data : null
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
  const report = useAnnualReport(facility.id)
  const filters = useMemo(() => parseFilters(new URLSearchParams(peerQuery)), [peerQuery])
  const group = usePeerGroup(facility.id, peerQuery)
  const priorities = findings.data ? Math.min(findings.data.primary.length, HOME_COUNT) : null

  const status = report.loading
    ? `Loading the annual report for ${facility.name}…`
    : report.data
      ? `Annual report for ${facility.name} loaded.${priorities != null ? ` ${priorities} priorit${priorities === 1 ? "y needs" : "ies need"} attention against peers.` : ""}`
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
          <p className="text-[13px] font-medium text-muted-foreground">Annual report</p>
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight sm:text-[32px]">{facility.name}</h1>
          <p className="text-[15px] text-muted-foreground">Its year, from its own filings with HCAI. The peer group applies only to the strip below.</p>
        </div>
        <AboutTool id="home" />
      </header>

      {/* The top strip: the next filing, and the page's one peer comparison, labeled as such. */}
      <div className="widget divide-y divide-border">
        <div className="px-4 py-3 sm:px-5">
          <FilingBanner facilityId={facility.id} fiscalYearEnd={facility.fiscalYearEnd} onCalendar={facility.onCalendar} />
        </div>
        <div className="px-4 py-3 sm:px-5">
          <NeedsAttention facilityId={facility.id} facilityName={facility.name} peerQuery={peerQuery} findings={findings} metaById={metaById} />
        </div>
      </div>

      {/* The report, with the sidebar beside it; on a phone the sidebar follows the report as its footer. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] xl:gap-10">
        <article aria-label={`Annual report: ${facility.name}`} className="min-w-0">
          <AnnualReportBody facilityName={facility.name} report={report} />
        </article>
        <aside aria-label="Saved work and shortcuts" className="flex min-w-0 flex-col gap-4">
          <SavedWork facilityId={facility.id} facilityName={facility.name} peerQuery={peerQuery} findings={findings} />
          <CommonActions facilityId={facility.id} peerQuery={peerQuery} />
          <ReportContents facilityName={facility.name} report={report} className="hidden lg:sticky lg:top-24 lg:block" />
        </aside>
      </div>
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
