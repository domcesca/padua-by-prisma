"use client"

import { ChevronRight, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"

import type { BenchmarkResult, TrendMetric } from "@/lib/benchmark/compute"
import { DEFAULT_FILTERS, filtersToParams, OWNERSHIP_LABEL, type PeerFilters } from "@/lib/benchmark/filters"
import type { DictionaryMetric, PayerGroup } from "@/lib/data/types"
import { cn } from "@/lib/utils"
import { FacilityPicker, type FacilityOption } from "./facility-picker"
import { MetricCard } from "./metric-card"
import { PayerMixCard } from "./payer-mix-card"
import { PeerFilterBar } from "./peer-filters"
import { TrendLegend } from "./trend-chart"

const TREND_ORDER: TrendMetric[] = ["operatingMargin", "daysCashOnHand", "occupancy", "edVisits"]

export function BenchmarkView({
  facilities,
  counties,
  metrics,
  payerGroups,
  latestYear,
  initialFacilityId,
  initialFilters,
  initialResult,
  suggestions,
}: {
  facilities: FacilityOption[]
  counties: string[]
  metrics: DictionaryMetric[]
  payerGroups: { id: PayerGroup; label: string }[]
  latestYear: number
  initialFacilityId: string | null
  initialFilters: PeerFilters
  initialResult: BenchmarkResult | null
  suggestions: FacilityOption[]
}) {
  const router = useRouter()
  const [facilityId, setFacilityId] = useState(initialFacilityId)
  const [filters, setFilters] = useState(initialFilters)
  const [result, setResult] = useState(initialResult)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)

  const metaById = Object.fromEntries(metrics.map((m) => [m.id, m]))
  const facility = facilityId ? (facilities.find((f) => f.id === facilityId) ?? null) : null

  async function apply(nextFacility: string | null, nextFilters: PeerFilters) {
    setFacilityId(nextFacility)
    setFilters(nextFilters)
    const params = filtersToParams(nextFilters)
    if (nextFacility) params.set("facility", nextFacility)
    const qs = params.toString()
    router.replace(qs ? `/benchmark?${qs}` : "/benchmark", { scroll: false })
    if (!nextFacility) return

    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/benchmark?${params}`, { signal: controller.signal })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? res.statusText)
      setResult((await res.json()) as BenchmarkResult)
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("Couldn’t load the comparison. Try again in a moment.")
    } finally {
      if (request.current === controller) setLoading(false)
    }
  }

  const shown = result && result.facility.id === facilityId ? result : null

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <FacilityPicker
          facilities={facilities}
          value={facilityId}
          onChange={(id) => apply(id, filters)}
          latestYear={latestYear}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PeerFilterBar
            filters={filters}
            onChange={(f) => apply(facilityId, f)}
            counties={counties}
            facility={shown?.facility ?? null}
          />
          {loading && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
              <Loader2 className="size-3.5 animate-spin" /> Updating
            </span>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {!facilityId && (
        <EmptyState suggestions={suggestions} onPick={(id) => apply(id, DEFAULT_FILTERS)} />
      )}

      {facilityId && !shown && !error && <LoadingState />}

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
                <p className="text-xs text-tertiary-foreground">Report years {shown.years[0]}–{shown.years.at(-1)}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {TREND_ORDER.map((m) => (
                  <MetricCard key={m} meta={metaById[m]} points={shown.series[m]} />
                ))}
              </div>
              {shown.payerMix && (
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

  return (
    <div className="space-y-2">
      <h2 className="text-2xl font-semibold tracking-tight">{f.name}</h2>
      <p className="text-sm text-muted-foreground">{facts.join(" · ")}</p>
      <p className="text-[13px] text-muted-foreground">
        Compared with <span className="font-medium text-foreground">{result.peers.length}</span>{" "}
        {f.typeOfCare?.toLowerCase() === "general" ? "general acute" : f.typeOfCare?.toLowerCase()} hospital
        {result.peers.length === 1 ? "" : "s"}
        {!result.filters.includeNonComparable && " (Kaiser and other non-comparable hospitals excluded)"}.
        {lastYear < result.years.at(-1)! && ` This hospital last reported in ${lastYear}.`}
      </p>
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
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function EmptyState({ suggestions, onPick }: { suggestions: FacilityOption[]; onPick: (id: string) => void }) {
  return (
    <div className="rounded-2xl bg-card px-6 py-12 text-center shadow-card sm:px-12">
      <p className="text-lg font-semibold tracking-tight">Pick a hospital to see how it compares.</p>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
        You&apos;ll see operating margin, cash, occupancy, ED volume, and payer mix against a peer group you can narrow by
        county, size, ownership, and teaching status.
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

function LoadingState() {
  return (
    <div className="space-y-6" aria-busy>
      <div className="space-y-2">
        <div className="h-7 w-72 animate-pulse rounded-lg bg-muted" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {TREND_ORDER.map((m) => (
          <div key={m} className="h-80 animate-pulse rounded-2xl bg-card shadow-card" />
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
