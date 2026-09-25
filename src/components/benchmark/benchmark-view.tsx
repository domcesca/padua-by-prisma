"use client"

import { ChevronRight, Loader2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Segmented } from "@/components/shell/segmented"
import type { BenchmarkResult } from "@/lib/benchmark/compute"
import { DEFAULT_FILTERS, filtersToParams, OWNERSHIP_LABEL, type PeerFilters } from "@/lib/benchmark/filters"
import { metricsFor, viewToParams, type BenchmarkViewState } from "@/lib/benchmark/view"
import {
  applyPayerView,
  CATEGORIES,
  CATEGORY_BY_ID,
  DATASETS,
  PAYER_VIEWS,
  pickableMetrics,
  PRIMARY_DATASET,
  type MetricDef,
  type PayerView,
} from "@/lib/data/datasets"
import type { MetricCategory, PayerGroup } from "@/lib/data/types"
import { rememberSelection } from "@/lib/selection"
import { cn } from "@/lib/utils"
import { CommunityPanel } from "./community-panel"
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
  const categoryMetrics = pickableMetrics(catalog, view.category, view.payer)
  const shownMetrics = metricsFor(view).filter((id) => metaById[id]?.category === view.category)
  // Under a payer lens the picker keeps the all-payer ids but names what will be shown.
  const metricOptions = categoryMetrics.map((m) => {
    if (view.payer === "all" || m.lens) return { value: m.id, label: m.label }
    const lensId = applyPayerView([m.id], view.payer, catalog)[0]
    return { value: m.id, label: lensId !== m.id ? metaById[lensId].label : `${m.label} (all payers)` }
  })

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
  const setPayer = (payer: PayerView) => apply({ view: { ...view, payer } })
  const setMetrics = (metrics: string[]) => {
    const valid = metrics.filter((id) => metaById[id]?.category === view.category)
    return apply({ view: { ...view, metrics: valid.length ? valid : null } })
  }

  const shown =
    result &&
    result.facility.id === facilityId &&
    result.category === view.category &&
    result.payer === (view.category === "quality" ? "all" : view.payer)
      ? result
      : null
  const primaryDataset = PRIMARY_DATASET[view.category]
  const quality = view.category === "quality"
  const payerInfo = PAYER_VIEWS.find((p) => p.value === view.payer)!
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
          {!quality && (
            <Segmented
              label="Payer view"
              value={view.payer}
              onChange={setPayer}
              options={PAYER_VIEWS.map((p) => ({ value: p.value, label: p.label }))}
            />
          )}
          <FilterPill
            label="Metrics"
            summary={isDefaultMetrics ? null : `${shownMetrics.length} metric${shownMetrics.length === 1 ? "" : "s"}`}
            options={metricOptions}
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

      <div className="-my-3 h-0.5" aria-hidden>
        {loading && <div className="loading-bar fade-up" />}
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
          {shown.community && <CommunityPanel context={shown.community} />}

          {shown.peers.length === 0 ? (
            <div className="glass rounded-2xl p-8 text-center">
              <p className="font-medium">No hospitals match these filters.</p>
              <p className="mt-1 text-sm text-muted-foreground">Remove a filter to widen the peer group.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <TrendLegend />
                <p className="max-w-xl text-xs text-tertiary-foreground sm:text-right">
                  {quality
                    ? "Care Compare measures are filed under the year their measurement period ends (periods span one to three years and overlap); infection data is by calendar year."
                    : view.payer === "all"
                      ? DATASETS[primaryDataset!].yearNote
                      : `${payerInfo.label}: ${payerInfo.description} Measures HCAI doesn’t split by payer stay all-payer and are marked.`}
                </p>
              </div>
              {shown.metrics.length === 0 ? (
                <p className="text-sm text-muted-foreground">Choose at least one metric.</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {orderByGroup(shown.metrics, metaById).map((id) => {
                    const meta = metaById[id]
                    if (!shown.series[id]) return null
                    const companion = meta.companion && shown.series[meta.companion] ? meta.companion : null
                    return (
                      <MetricCard
                        key={id}
                        meta={meta}
                        points={shown.series[id]}
                        companion={companion ? { meta: metaById[companion], points: shown.series[companion] } : undefined}
                        tags={[
                          quality ? (meta.group ?? null) : null,
                          quality ? DATASETS[meta.dataset].shortLabel : null,
                          meta.estimate ? "Estimate" : null,
                          !quality && view.payer !== "all" && !meta.lens ? "All payers" : null,
                          primaryDataset && meta.dataset !== primaryDataset
                            ? meta.dataset === "hau"
                              ? "Calendar years"
                              : "Fiscal years"
                            : null,
                        ].filter((t): t is string => t != null)}
                      />
                    )
                  })}
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
    f.teaching ? "Teaching" : null,
    f.rural ? "Small & rural" : null,
    f.traumaLevel ? `Trauma level ${f.traumaLevel}` : null,
    f.owner && f.owner.toLowerCase() !== f.hcaiName.toLowerCase() ? `Operated by ${titleCase(f.owner)}` : null,
  ].filter(Boolean)
  const dataYears =
    result.category === "quality"
      ? qualityYears(result)
      : result.category === "utilization"
        ? f.utilizationYears
        : f.financialYears
  const noData = dataYears.length === 0
  const similar = result.filters.mode === "similar"

  // Two at-a-glance widgets: who the hospital is, and who it's compared with.
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <section aria-label="Hospital" className="widget fade-up flex flex-col gap-2 p-5 lg:col-span-2">
        <p className="text-[11px] font-medium tracking-wide text-tertiary-foreground uppercase">Hospital</p>
        <h2 className="text-2xl leading-tight font-semibold tracking-tight">{f.name}</h2>
        <p className="text-sm text-muted-foreground">{facts.join(" · ")}</p>
        {result.category === "utilization" && f.campuses.length > 0 && (
          <p className="text-[13px] text-muted-foreground">
            Includes {f.campuses.length === 1 ? "the" : "its"} {listFormat(f.campuses)} campus
            {f.campuses.length === 1 ? "" : "es"}, which report{f.campuses.length === 1 ? "s" : ""} utilization separately
            under the same license.
          </p>
        )}
        {result.category !== "quality" && lastYear < latestOf(result) && (
          <p className="text-[13px] text-muted-foreground">Last reported in {lastYear}.</p>
        )}
        {noData && (
          <p className="rounded-xl bg-black/4 px-3.5 py-2.5 text-[13px] leading-relaxed text-muted-foreground dark:bg-white/6">
            {result.category === "quality"
              ? "CMS and CDPH published none of these measures for this hospital in these years."
              : `HCAI has no ${result.category === "utilization" ? "utilization" : "financial"} data for this hospital in these years.`}
          </p>
        )}
        {result.notes.map((note) => (
          <p key={note} className="rounded-xl bg-black/4 px-3.5 py-2.5 text-[13px] leading-relaxed text-muted-foreground dark:bg-white/6">
            {note}
          </p>
        ))}
        {f.hospitalType && f.hospitalType !== "Comparable" && (
          <p className="rounded-xl bg-black/4 px-3.5 py-2.5 text-[13px] leading-relaxed text-muted-foreground dark:bg-white/6">
            HCAI classifies this hospital as <span className="font-medium text-foreground">{f.hospitalType}</span>, so its
            numbers may not be directly comparable.
            {f.hospitalType === "Kaiser" && " Kaiser hospitals report financials differently from other hospitals."}
          </p>
        )}
        <dl className="mt-auto grid grid-cols-3 gap-3 border-t border-black/6 pt-3 dark:border-white/8">
          <Stat label="Licensed beds" value={f.licensedBeds != null ? f.licensedBeds.toLocaleString("en-US") : "—"} />
          <Stat
            label="Fiscal year ends"
            value={
              f.fiscalYearEnd
                ? new Date(`${f.fiscalYearEnd}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
                : "—"
            }
          />
          <Stat
            label={{ financial: "Financial data", utilization: "Utilization data", quality: "Quality data" }[result.category]}
            value={yearRange(dataYears) ?? "None"}
          />
        </dl>
      </section>
      <section aria-label="Peer group" className="widget fade-up flex flex-col gap-1 p-5">
        <p className="text-[11px] font-medium tracking-wide text-tertiary-foreground uppercase">Compared with</p>
        <p className="num text-[40px] leading-none font-semibold tracking-tight">{result.peers.length}</p>
        <p className="text-[13px] font-medium">
          {similar ? "similar hospitals" : result.filters.mode === "statewide" ? "hospitals statewide" : `hospital${result.peers.length === 1 ? "" : "s"} you chose`}
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          {result.peerGroup.description}
          {!result.filters.includeNonComparable && ", not counting Kaiser and other non-comparable hospitals"}.
        </p>
        {result.peerGroup.note && <p className="text-xs leading-relaxed text-tertiary-foreground">{result.peerGroup.note}</p>}
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[11px] text-tertiary-foreground">{label}</dt>
      <dd className="num truncate text-[15px] font-semibold tracking-tight">{value}</dd>
    </div>
  )
}

/** Years with a value for any metric shown (quality mixes sources, so there's no single year list). */
function qualityYears(result: BenchmarkResult) {
  const years = new Set<number>()
  for (const id of result.metrics) for (const p of result.series[id] ?? []) if (p.value != null) years.add(p.year)
  return [...years].sort((a, b) => a - b)
}

/** Keeps metrics of the same group (quality: Readmissions, Infections, ...) next to each other, in first-seen order. */
function orderByGroup(ids: string[], metaById: Record<string, MetricDef>) {
  const groups = [...new Set(ids.map((id) => metaById[id]?.group ?? ""))]
  return [...ids].sort((a, b) => groups.indexOf(metaById[a]?.group ?? "") - groups.indexOf(metaById[b]?.group ?? ""))
}

const yearRange = (years: number[]) =>
  years.length ? (years.length === 1 ? String(years[0]) : `${years[0]}–${years.at(-1)}`) : null

function latestOf(result: BenchmarkResult) {
  return Math.max(...Object.values(result.series).map((s) => s.at(-1)?.year ?? 0))
}

const listFormat = (items: string[]) => new Intl.ListFormat("en-US", { style: "long", type: "conjunction" }).format(items)

function PeerList({ peers }: { peers: BenchmarkResult["peers"] }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="glass rounded-2xl">
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
    <div className="glass rounded-2xl px-6 py-12 text-center sm:px-12">
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
            className="glass-subtle rounded-full px-3 py-1.5 text-[13px] transition-colors hover:bg-white/80 dark:hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
          <div key={i} className="widget h-80 animate-pulse" />
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
