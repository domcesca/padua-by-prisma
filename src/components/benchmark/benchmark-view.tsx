"use client"

import { ChevronRight, Loader2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Segmented } from "@/components/shell/segmented"
import type { BenchmarkResult } from "@/lib/benchmark/compute"
import { DEFAULT_FILTERS, filtersToParams, OWNERSHIP_LABEL, type PeerFilters } from "@/lib/benchmark/filters"
import { metricsFor, viewToParams, type BenchmarkViewState } from "@/lib/benchmark/view"
import { CATEGORIES, CATEGORY_BY_ID, DATASETS, type MetricDef } from "@/lib/data/datasets"
import type { MetricCategory, PayerGroup } from "@/lib/data/types"
import { rememberSelection } from "@/lib/selection"
import { cn } from "@/lib/utils"
import { FacilityPicker, type FacilityOption } from "./facility-picker"
import { FilterPill } from "./filter-pill"
import { MetricCard } from "./metric-card"
import { PayerMixCard } from "./payer-mix-card"
import { PeerFilterBar } from "./peer-filters"
import { TrendLegend } from "./trend-chart"

type State = { facilityId: string | null; filters: PeerFilters; view: BenchmarkViewState }

export function BenchmarkView({
  facilities,
  counties,
  catalog,
  payerGroups,
  latestYear,
  years,
  initialFacilityId,
  initialFilters,
  initialView,
  initialResult,
  suggestions,
}: {
  facilities: FacilityOption[]
  counties: string[]
  /** Every benchmarkable metric, both categories (payer mix included). */
  catalog: MetricDef[]
  payerGroups: { id: PayerGroup; label: string }[]
  latestYear: number
  /** Every year loaded in any dataset, ascending. */
  years: number[]
  initialFacilityId: string | null
  initialFilters: PeerFilters
  initialView: BenchmarkViewState
  initialResult: BenchmarkResult | null
  suggestions: FacilityOption[]
}) {
  const [state, setState] = useState<State>({ facilityId: initialFacilityId, filters: initialFilters, view: initialView })
  const [result, setResult] = useState(initialResult)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)

  const { facilityId, filters, view } = state

  // Carry the hospital and category to the other tabs.
  useEffect(() => {
    rememberSelection(facilityId ? { facilityId, category: view.category } : { category: view.category })
  }, [facilityId, view.category])
  const metaById = Object.fromEntries(catalog.map((m) => [m.id, m]))
  const facility = facilityId ? (facilities.find((f) => f.id === facilityId) ?? null) : null
  const categoryMetrics = catalog.filter((m) => m.category === view.category && m.unit !== "share")
  const shownMetrics = metricsFor(view).filter((id) => metaById[id]?.category === view.category)

  async function apply(patch: Partial<State>) {
    const next = { ...state, ...patch }
    setState(next)
    const params = viewToParams(next.view, filtersToParams(next.filters))
    if (next.facilityId) params.set("facility", next.facilityId)
    const qs = params.toString()
    // Native replaceState keeps the URL shareable without re-rendering the page on the server;
    // the data comes from /api/benchmark below.
    window.history.replaceState(null, "", qs ? `/benchmark?${qs}` : "/benchmark")
    if (!next.facilityId) return

    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError(null)
    const apiParams = new URLSearchParams(params)
    apiParams.set("metrics", metricsFor(next.view).join(","))
    try {
      const res = await fetch(`/api/benchmark?${apiParams}`, { signal: controller.signal })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? res.statusText)
      setResult((await res.json()) as BenchmarkResult)
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("Couldn’t load the comparison. Try again in a moment.")
    } finally {
      if (request.current === controller) setLoading(false)
    }
  }

  const setCategory = (category: MetricCategory) => apply({ view: { ...view, category, metrics: null } })
  const setMetrics = (metrics: string[]) => {
    const valid = metrics.filter((id) => metaById[id]?.category === view.category)
    return apply({ view: { ...view, metrics: valid.length ? valid : null } })
  }

  const shown = result && result.facility.id === facilityId && result.category === view.category ? result : null
  const categoryInfo = CATEGORY_BY_ID[view.category]
  const isDefaultMetrics = !view.metrics || view.metrics.join(",") === categoryInfo.defaultMetrics.join(",")

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <FacilityPicker
          facilities={facilities}
          value={facilityId}
          onChange={(id) => apply({ facilityId: id })}
          latestYear={latestYear}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="What to compare"
            value={view.category}
            onChange={setCategory}
            options={CATEGORIES.map((c) => ({ value: c.id, label: c.label }))}
          />
          <FilterPill
            label="Metrics"
            summary={isDefaultMetrics ? null : `${shownMetrics.length} metric${shownMetrics.length === 1 ? "" : "s"}`}
            options={categoryMetrics.map((m) => ({ value: m.id, label: m.label }))}
            selected={shownMetrics}
            onChange={setMetrics}
            multiple
            quickActions={isDefaultMetrics ? undefined : [{ label: "Back to the standard set", onSelect: () => setMetrics([]) }]}
          />
          <FilterPill
            label="Years"
            summary={view.since != null ? `Since ${view.since}` : null}
            options={[
              { value: "all", label: `All years (${years[0]}–${years.at(-1)})` },
              ...years.slice(0, -2).map((y) => ({ value: String(y), label: `Since ${y}` })),
            ]}
            selected={[view.since != null ? String(view.since) : "all"]}
            onChange={([v]) => apply({ view: { ...view, since: v === "all" ? null : Number(v) } })}
          />
          {loading && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
              <Loader2 className="size-3.5 animate-spin" /> Updating
            </span>
          )}
        </div>
        <PeerFilterBar
          filters={filters}
          applied={shown?.filters ?? null}
          onChange={(f) => apply({ filters: f })}
          counties={counties}
          facility={shown?.facility ?? null}
        />
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {!facilityId && (
        <EmptyState
          category={view.category}
          suggestions={suggestions}
          onPick={(id) => apply({ facilityId: id, filters: DEFAULT_FILTERS })}
        />
      )}

      {facilityId && !shown && !error && <LoadingState count={shownMetrics.length} />}

      {shown && (
        <div className={cn("space-y-6 transition-opacity duration-200", loading && "opacity-60")}>
          <FacilitySummary result={shown} lastYear={facility?.lastYear ?? latestYear} />

          {shown.peers.length === 0 ? (
            <div className="rounded-2xl bg-card p-8 text-center shadow-card">
              <p className="font-medium">No hospitals match these filters.</p>
              <p className="mt-1 text-sm text-muted-foreground">Remove a filter to widen the peer group.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <TrendLegend />
                <p className="text-xs text-tertiary-foreground">
                  {view.category === "utilization" ? DATASETS.hau.yearNote : DATASETS["hafd-selected"].yearNote}
                </p>
              </div>
              {shownMetrics.length === 0 ? (
                <p className="text-sm text-muted-foreground">Choose at least one metric.</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {shownMetrics.map((id) =>
                    shown.series[id] ? <MetricCard key={id} meta={metaById[id]} points={shown.series[id]} /> : null
                  )}
                </div>
              )}
              {shown.payerMix && metaById.payerMix && (
                <PayerMixCard mix={shown.payerMix} groups={payerGroups} meta={metaById.payerMix} />
              )}
              <PeerList peers={shown.peers} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function FacilitySummary({ result, lastYear }: { result: BenchmarkResult; lastYear: number }) {
  const f = result.facility
  const facts = [
    f.city && f.county ? `${f.city}, ${f.county} County` : f.county,
    OWNERSHIP_LABEL[f.ownership],
    f.licensedBeds != null ? `${f.licensedBeds} licensed beds` : null,
    f.teaching ? "Teaching" : null,
    f.rural ? "Small & rural" : null,
    f.traumaLevel ? `Trauma level ${f.traumaLevel}` : null,
    f.owner && f.owner.toLowerCase() !== f.hcaiName.toLowerCase() ? `Operated by ${titleCase(f.owner)}` : null,
  ].filter(Boolean)
  const noData =
    result.category === "utilization" ? f.utilizationYears.length === 0 : f.financialYears.length === 0

  return (
    <div className="space-y-2">
      <h2 className="text-2xl font-semibold tracking-tight">{f.name}</h2>
      <p className="text-sm text-muted-foreground">{facts.join(" · ")}</p>
      <p className="text-[13px] text-muted-foreground">
        Compared with <span className="font-medium text-foreground">{result.peers.length}</span>{" "}
        {result.filters.mode === "similar" ? "similar hospitals" : `hospital${result.peers.length === 1 ? "" : "s"}`}:{" "}
        {result.peerGroup.description.charAt(0).toLowerCase() + result.peerGroup.description.slice(1)}
        {!result.filters.includeNonComparable && ", not counting Kaiser and other non-comparable hospitals"}.
        {result.peerGroup.note && ` ${result.peerGroup.note}`}
        {lastYear < latestOf(result) && ` This hospital last reported in ${lastYear}.`}
      </p>
      {result.category === "utilization" && f.campuses.length > 0 && (
        <p className="text-[13px] text-muted-foreground">
          Includes {f.campuses.length === 1 ? "the" : "its"} {listFormat(f.campuses)} campus
          {f.campuses.length === 1 ? "" : "es"}, which report{f.campuses.length === 1 ? "s" : ""} utilization separately
          under the same license.
        </p>
      )}
      {noData && (
        <p className="rounded-xl bg-muted px-3.5 py-2.5 text-[13px] leading-relaxed text-muted-foreground">
          HCAI has no {result.category === "utilization" ? "utilization" : "financial"} data for this hospital in these
          years.
        </p>
      )}
      {f.hospitalType && f.hospitalType !== "Comparable" && (
        <p className="rounded-xl bg-muted px-3.5 py-2.5 text-[13px] leading-relaxed text-muted-foreground">
          HCAI classifies this hospital as <span className="font-medium text-foreground">{f.hospitalType}</span>, so its
          numbers may not be directly comparable.
          {f.hospitalType === "Kaiser" && " Kaiser hospitals report financials differently from other hospitals."}
        </p>
      )}
    </div>
  )
}

function latestOf(result: BenchmarkResult) {
  return Math.max(...Object.values(result.series).map((s) => s.at(-1)?.year ?? 0))
}

const listFormat = (items: string[]) => new Intl.ListFormat("en-US", { style: "long", type: "conjunction" }).format(items)

function PeerList({ peers }: { peers: BenchmarkResult["peers"] }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="rounded-2xl bg-card shadow-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-2xl px-5 py-4 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className="text-sm font-medium">Who&apos;s in the peer group ({peers.length})</span>
        <ChevronRight className={cn("size-4 text-muted-foreground transition-transform duration-200", open && "rotate-90")} />
      </button>
      {open && (
        <ul className="fade-up grid gap-x-6 gap-y-1.5 border-t border-border px-5 py-4 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
          {peers.map((p) => (
            <li key={p.id} className="truncate">
              {p.name}
              <span className="text-muted-foreground">
                {" "}
                · {p.county}
                {p.beds != null && ` · ${p.beds} beds`}
                {p.distance != null && ` · ${p.distance} mi`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function EmptyState({
  category,
  suggestions,
  onPick,
}: {
  category: MetricCategory
  suggestions: FacilityOption[]
  onPick: (id: string) => void
}) {
  return (
    <div className="rounded-2xl bg-card px-6 py-12 text-center shadow-card sm:px-12">
      <p className="text-lg font-semibold tracking-tight">Pick a hospital to see how it compares.</p>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
        You&apos;ll see {CATEGORY_BY_ID[category].description.toLowerCase().replace(/\.$/, "")} against a peer group you can
        narrow by county, size, ownership, and teaching status.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {suggestions.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s.id)}
            className="rounded-full bg-muted px-3 py-1.5 text-[13px] transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {s.name}
          </button>
        ))}
      </div>
    </div>
  )
}

function LoadingState({ count }: { count: number }) {
  return (
    <div className="space-y-6" aria-busy>
      <div className="space-y-2">
        <div className="h-7 w-72 animate-pulse rounded-lg bg-muted" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: Math.max(2, count) }, (_, i) => (
          <div key={i} className="h-80 animate-pulse rounded-2xl bg-card shadow-card" />
        ))}
      </div>
    </div>
  )
}

const SMALL_WORDS = new Set(["of", "the", "and", "at", "for", "in", "on"])

function titleCase(s: string) {
  return s
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ")
}
