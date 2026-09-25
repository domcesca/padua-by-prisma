"use client"

import { ChevronRight, Loader2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { KeyFindingsPanel, tierOf } from "@/components/findings/key-findings-panel"
import { MethodologyDrawer } from "@/components/findings/methodology-drawer"
import { useFindings } from "@/components/findings/use-findings"
import { FacilityFlagNote } from "@/components/shell/facility-flag-note"
import { LiveStatus } from "@/components/shell/live-status"
import { MobileControls } from "@/components/shell/mobile-controls"
import { PickerPill } from "@/components/shell/grouped-picker"
import { Segmented } from "@/components/shell/segmented"
import type { BenchmarkResult } from "@/lib/benchmark/compute"
import { DEFAULT_FILTERS, filtersToParams, OWNERSHIP_LABEL, type PeerFilters } from "@/lib/benchmark/filters"
import { lineView, metricsFor, viewToParams, type BenchmarkViewState } from "@/lib/benchmark/view"
import {
  applyPayerView,
  CATEGORIES,
  CATEGORY_BY_ID,
  DATASETS,
  PAYER_VIEWS,
  pickableMetrics,
  PRIMARY_DATASET,
  supportsUnits,
  UNIT_DEFAULT_METRICS,
  UNIT_METRIC_LABELS,
  UNIT_METRICS,
  type MetricDef,
  type PayerView,
} from "@/lib/data/datasets"
import { metricPickerOptions } from "@/lib/data/metric-options"
import { facilityFlag, type FacilityFlag } from "@/lib/facility-flag"
import type { FindingsResult } from "@/lib/findings/compute"
import { FAMILY_OF_METRIC } from "@/lib/findings/families"
import type { MetricCategory, PayerGroup } from "@/lib/data/types"
import { rememberSelection } from "@/lib/selection"
import { lineOfUnit } from "@/lib/service-lines/lines"
import type { SpecialtyResult } from "@/lib/specialty/compute"
import { MDCS } from "@/lib/specialty/mdc"
import { cn } from "@/lib/utils"
import { CommunityPanel } from "./community-panel"
import { FacilityPicker, type FacilityOption } from "./facility-picker"
import { FilterPill } from "./filter-pill"
import { MetricCard } from "./metric-card"
import { PayerMixCard } from "./payer-mix-card"
import { PeerFilterBar } from "./peer-filters"
import { ServiceLinePanel } from "./service-line-panel"
import { SpecialtyPanel } from "./specialty-panel"
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
  initialSpecialty,
  initialFindings,
  initialFinding,
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
  /** Medicare specialty (MDC) data, when the URL asks for the specialty view. */
  initialSpecialty: SpecialtyResult | null
  /** Key findings for the first hospital and peer group, server-rendered. */
  initialFindings: FindingsResult | null
  /** A finding family whose methodology opens on arrival (links from Home). */
  initialFinding: string | null
  suggestions: FacilityOption[]
}) {
  const [state, setState] = useState<State>({ facilityId: initialFacilityId, filters: initialFilters, view: initialView })
  const [result, setResult] = useState(initialResult)
  const [specialty, setSpecialtyResult] = useState(initialSpecialty)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)

  const { facilityId, filters, view } = state

  // Key findings follow the hospital and peer group, not the topic: they scan every topic at once.
  const peerQuery = filtersToParams(filters).toString()
  const findings = useFindings(facilityId, peerQuery, initialFindings)
  const findingsResult = findings.data ?? findings.stale
  const [openFamily, setOpenFamily] = useState<string | null>(initialFinding)
  const opener = useRef<HTMLElement | null>(null)
  const openInfo = openFamily && findingsResult ? tierOf(findingsResult, openFamily) : null
  const pendingScroll = useRef<string | null>(null)

  // Carry the hospital and category to the other tabs.
  useEffect(() => {
    rememberSelection(facilityId ? { facilityId, category: view.category } : { category: view.category })
  }, [facilityId, view.category])
  const metaById = Object.fromEntries(catalog.map((m) => [m.id, m]))
  const facility = facilityId ? (facilities.find((f) => f.id === facilityId) ?? null) : null
  const categoryMetrics = pickableMetrics(catalog, view.category, view.payer)
  const shownMetrics = metricsFor(view).filter((id) => metaById[id]?.category === view.category)
  // Under a payer lens the picker keeps the all-payer ids but names what will be shown.
  // Under a unit or service line, only what HCAI reports by bed classification.
  const narrowed = !!view.unit || lineView(view)
  const metricOptions = narrowed
    ? UNIT_METRICS.map((id) => ({ value: id, label: UNIT_METRIC_LABELS[id] }))
    : metricPickerOptions(categoryMetrics, { acrossCategories: false }).map((o) => {
        const m = metaById[o.value]
        if (view.payer === "all" || m.lens) return o
        const lensId = applyPayerView([m.id], view.payer, catalog)[0]
        return { ...o, label: lensId !== m.id ? metaById[lensId].label : `${m.label} (all payers)` }
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
    const getJson = async <T,>(url: string) => {
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? res.statusText)
      return (await res.json()) as T
    }
    try {
      // The specialty view keeps the hospital and peer cards, so it loads both.
      const [body, specialtyBody] = await Promise.all([
        getJson<BenchmarkResult>(`/api/benchmark?${apiParams}`),
        next.view.specialty ? getJson<SpecialtyResult>(`/api/specialty?${params}`) : Promise.resolve(null),
      ])
      if (specialtyBody) setSpecialtyResult(specialtyBody)
      // A unit this hospital doesn't have (e.g. after switching hospitals): show the whole hospital instead.
      if (next.view.unit && !body.unit) {
        void apply({ ...next, view: { ...next.view, unit: null } })
        return
      }
      if (lineView(next.view) && !body.line) {
        void apply({ ...next, view: { ...next.view, line: null } })
        return
      }
      setResult(body)
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("Couldn’t load the comparison. Try again in a moment.")
    } finally {
      if (request.current === controller) setLoading(false)
    }
  }

  const setCategory = (category: MetricCategory) =>
    apply({
      view: {
        ...view,
        category,
        metrics: null,
        unit: supportsUnits(category) ? view.unit : null,
        line: supportsUnits(category) ? view.line : null,
        specialty: supportsUnits(category) ? view.specialty : null,
        compare: supportsUnits(category) ? view.compare : [],
      },
    })
  const setUnit = (unit: string | null) =>
    apply({ view: { ...view, unit, line: null, specialty: null, compare: [], payer: unit ? "all" : view.payer } })
  const setLine = (line: string | null) =>
    apply({ view: { ...view, line, unit: null, specialty: null, compare: [], payer: line ? "all" : view.payer } })
  const setSpecialty = (key: string | null) =>
    apply({ view: { ...view, specialty: key, unit: null, line: null, compare: key ? view.compare : [], payer: key ? "all" : view.payer } })
  const setPayer = (payer: PayerView) => apply({ view: { ...view, payer } })
  const setMetrics = (metrics: string[]) => {
    const valid = metrics.filter((id) => metaById[id]?.category === view.category && (!narrowed || UNIT_METRICS.includes(id)))
    return apply({ view: { ...view, metrics: valid.length ? valid : null } })
  }

  const shown =
    result &&
    result.facility.id === facilityId &&
    result.category === view.category &&
    result.payer === (view.category === "quality" ? "all" : view.payer) &&
    (result.unit?.id ?? null) === view.unit &&
    (result.line?.id ?? (result.serviceLines ? "all" : null)) === view.line
      ? result
      : null

  // "Show this metric's card" from a finding: switch to its topic (and the Medicare view for a Medicare metric), add
  // it if the topic's metrics don't include it, then scroll to the card once it's on screen.
  function scrollToMetric() {
    const id = pendingScroll.current
    const heading = id ? document.getElementById(`metric-${id}`) : null
    if (!heading) return
    pendingScroll.current = null
    const card = heading.closest("section") ?? heading
    window.scrollTo({ top: card.getBoundingClientRect().top + window.scrollY - 72, behavior: "smooth" })
    // After the drawer has closed and returned focus, move it to the card's heading.
    window.setTimeout(() => {
      heading.setAttribute("tabindex", "-1")
      heading.focus({ preventScroll: true })
    }, 300)
  }
  function showMetric(id: string) {
    const meta = metaById[id]
    if (!meta) return
    pendingScroll.current = id
    const base = meta.lens && meta.allPayer ? meta.allPayer : id
    const wholeHospital = !view.unit && !view.line && !view.specialty
    if (wholeHospital && shown?.metrics.includes(id)) return scrollToMetric()
    const current = wholeHospital && view.category === meta.category ? metricsFor(view) : CATEGORY_BY_ID[meta.category].defaultMetrics
    void apply({
      view: {
        ...view,
        category: meta.category,
        metrics: current.includes(base) ? current : [...current, base],
        unit: null,
        line: null,
        specialty: null,
        compare: [],
        payer: meta.lens ?? "all",
      },
    })
  }
  // A card asked for from a finding scrolls into view once its topic has loaded.
  const shownKey = shown ? `${shown.category}:${shown.metrics.join(",")}` : null
  useEffect(() => {
    if (pendingScroll.current && shownKey) scrollToMetric()
  })

  /** The finding that covers a metric card, if one is ranked: "Key finding 2 · Readmissions". */
  function relatedFor(metricId: string) {
    const family = FAMILY_OF_METRIC.get(metricId)
    const info = family && findingsResult && facilityId === findingsResult.facility.id ? tierOf(findingsResult, family) : null
    if (!info) return undefined
    return {
      label: `${info.tier === "primary" ? "Key finding" : "To watch"} ${info.rank} · ${info.finding.label}`,
      onOpen: (el: HTMLElement) => {
        opener.current = el
        setOpenFamily(info.finding.family)
      },
    }
  }
  const shownSpecialty =
    view.specialty && specialty && specialty.facility.id === facilityId && specialty.mdc === (view.specialty === "all" ? null : view.specialty)
      ? specialty
      : null
  const specialtyView = !!view.specialty && view.category === "utilization"
  const primaryDataset = PRIMARY_DATASET[view.category]
  const quality = view.category === "quality"
  const payerInfo = PAYER_VIEWS.find((p) => p.value === view.payer)!
  const categoryInfo = CATEGORY_BY_ID[view.category]
  const linesView = view.line === "all" && view.category === "utilization"
  const defaultMetrics = narrowed ? UNIT_DEFAULT_METRICS : categoryInfo.defaultMetrics
  const isDefaultMetrics = !view.metrics || shownMetrics.join(",") === defaultMetrics.join(",")
  // The hospital's units come with each result; keep offering them while the next one loads.
  const units = result && result.facility.id === facilityId ? result.units : []
  const lines = result && result.facility.id === facilityId ? result.lines : []
  const unitInfo = units.find((u) => u.id === view.unit)
  const lineInfo = lines.find((l) => l.id === view.line)
  // A unit that's part of a combined service line the hospital has.
  const parentLine = shown?.unit ? lines.find((l) => l.id === lineOfUnit(shown.unit!.id)?.id) : undefined

  const topicName = view.specialty
    ? "Medicare specialty"
    : view.line
      ? "service line"
      : view.unit
        ? `${unitInfo?.label ?? "unit"}`
        : CATEGORY_BY_ID[view.category].label.toLowerCase()
  const loadingMessage = `Loading ${facility?.name ?? "the hospital"}’s ${topicName} data and its peer group…`
  const announcement = loading || (facilityId && !shown)
    ? loadingMessage
    : shown
      ? specialtyView || linesView
        ? `Showing ${facility?.name ?? "the hospital"}’s ${topicName} table against ${shown.peers.length} peers.`
        : `Showing ${shown.metrics.length} metric${shown.metrics.length === 1 ? "" : "s"} for ${shown.facility.name} against ${shown.peers.length} peers.`
      : error ?? ""

  const controls = (
    <>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="What to compare"
            value={view.category}
            onChange={setCategory}
            options={CATEGORIES.map((c) => ({ value: c.id, label: c.label }))}
          />
          {supportsUnits(view.category) && facilityId && (
            <PickerPill
              noun="specialties"
              label="Medicare specialty"
              summary={
                view.specialty === "all"
                  ? "Medicare specialties"
                  : view.specialty
                    ? `Medicare: ${MDCS.find((m) => m.code === view.specialty)?.name ?? view.specialty}`
                    : null
              }
              active={!!view.specialty}
              options={[
                { value: "off", label: "Off (HCAI utilization, all payers)" },
                { value: "all", label: "All specialties (Medicare cases by MDC)" },
                ...MDCS.map((m) => {
                  const cell = shownSpecialty?.hospital?.cells[m.code]
                  return {
                    value: m.code,
                    label: m.code === "none" ? m.name : `${m.name} (${m.plain})`,
                    group: "One specialty",
                    keywords: [m.official, m.code === "PRE" || m.code === "none" ? m.code : `MDC ${m.code}`],
                    hint: cell ? `${cell.cases.toLocaleString("en-US")} cases` : undefined,
                  }
                }),
              ]}
              selected={[view.specialty ?? "off"]}
              onChange={([v]) => setSpecialty(v === "off" ? null : v)}
              wide
            />
          )}
          {supportsUnits(view.category) && !view.specialty && units.length > 0 && (
            <PickerPill
              noun="units"
              label="Unit or service line"
              summary={unitInfo ? unitInfo.label : lineInfo ? lineInfo.label : linesView ? "All service lines" : "Whole hospital"}
              active={!!unitInfo || !!lineInfo || linesView}
              options={[
                { value: "all", label: "Whole hospital" },
                { value: "lines", label: "All service lines, side by side" },
                ...lines.map((l) => ({
                  value: `line:${l.id}`,
                  label: l.label,
                  group: "Service lines (combined)",
                  keywords: l.units.map((id) => units.find((u) => u.id === id)?.label ?? id),
                  hint: l.lastYear < (result?.facility.utilizationYears.at(-1) ?? l.lastYear) ? `through ${l.lastYear}` : l.beds != null ? `${l.beds} beds` : undefined,
                })),
                ...units.map((u) => ({
                  value: `unit:${u.id}`,
                  label: u.label,
                  group: "Units",
                  hint: u.lastYear < (result?.facility.utilizationYears.at(-1) ?? u.lastYear) ? `through ${u.lastYear}` : u.beds != null ? `${u.beds} beds` : undefined,
                })),
              ]}
              selected={[view.unit ? `unit:${view.unit}` : view.line === "all" ? "lines" : view.line ? `line:${view.line}` : "all"]}
              onChange={([v]) =>
                v === "all" ? setUnit(null) : v === "lines" ? setLine("all") : v.startsWith("line:") ? setLine(v.slice(5)) : setUnit(v.slice(5))
              }
              wide
            />
          )}
          {!quality && !view.unit && !view.line && !specialtyView && (
            <Segmented
              label="Payer view"
              value={view.payer}
              onChange={setPayer}
              options={PAYER_VIEWS.map((p) => ({ value: p.value, label: p.label }))}
            />
          )}
          {!specialtyView && !linesView && (
          <PickerPill
            noun="metrics"
            label="Metrics"
            summary={isDefaultMetrics ? null : `${shownMetrics.length} metric${shownMetrics.length === 1 ? "" : "s"}`}
            options={metricOptions}
            selected={shownMetrics}
            onChange={setMetrics}
            multiple
            actions={isDefaultMetrics ? undefined : [{ label: "Back to the standard set", onSelect: () => setMetrics([]) }]}
          />
          )}
          {!specialtyView && !linesView && (
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
          )}
          {loading && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" aria-hidden>
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
    </>
  )
  const periodYears = shown
    ? shown.category === "quality"
      ? qualityYears(shown)
      : shown.category === "utilization"
        ? shown.facility.utilizationYears
        : shown.facility.financialYears
    : []
  const periodText = specialtyView
    ? "Medicare, calendar year"
    : primaryDataset && periodYears.length
      ? `${DATASETS[primaryDataset].periodType}s ${yearRange(periodYears)}`
      : periodYears.length
        ? `Through ${periodYears.at(-1)}`
        : null
  const activeControls = [
    view.unit || view.line,
    view.specialty,
    view.payer !== "all",
    !specialtyView && !linesView && !isDefaultMetrics,
    view.since != null,
    filters.mode !== DEFAULT_FILTERS.mode,
  ].filter(Boolean).length + [...filtersToParams(filters).keys()].filter((k) => k !== "peers").length

  return (
    <div className="space-y-6">
      <LiveStatus message={announcement} />
      <MobileControls
        hospital={facility?.name ?? null}
        topic={[CATEGORY_BY_ID[view.category].label, specialtyView ? "Medicare specialty" : lineInfo?.label ?? (linesView ? "Service lines" : unitInfo?.label)]
          .filter(Boolean)
          .join(" · ")}
        period={periodText}
        active={activeControls}
      >
        {controls}
      </MobileControls>
      <div className="relative space-y-3">
        <FacilityPicker
          facilities={facilities}
          value={facilityId}
          onChange={(id) => apply({ facilityId: id })}
          latestYear={latestYear}
        />
        <div className="hidden space-y-3 md:block">{controls}</div>
        {/* Out of the flow, halfway into the gap below, so it never eats the space between the filters and the results. */}
        {loading && <div className="loading-bar fade-up absolute inset-x-0 -bottom-3.5" aria-hidden />}
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {facilityId && facility && (
        <KeyFindingsPanel
          facilityId={facilityId}
          facilityName={facility.name}
          peerQuery={peerQuery}
          result={findingsResult && findingsResult.facility.id === facilityId ? findingsResult : null}
          loading={findings.loading}
          error={findings.error}
          retry={findings.retry}
          onOpen={(finding, _tier, _rank, el) => {
            opener.current = el
            setOpenFamily(finding.family)
          }}
        />
      )}
      <MethodologyDrawer
        finding={openInfo?.finding ?? null}
        tier={openInfo?.tier ?? "primary"}
        rank={openInfo?.rank ?? 1}
        context={{ facilityName: facility?.name ?? "", peerGroup: findingsResult?.peerGroup.description ?? "", peerQuery }}
        onOpenChange={(open) => !open && setOpenFamily(null)}
        finalFocus={opener}
        onShowMetric={(id) => {
          opener.current = null
          showMetric(id)
        }}
      />

      {!facilityId && (
        <EmptyState
          category={view.category}
          suggestions={suggestions}
          onPick={(id) => apply({ facilityId: id, filters: DEFAULT_FILTERS })}
        />
      )}

      {facilityId && !shown && !error && <LoadingState count={shownMetrics.length} message={loadingMessage} />}

      {shown && (
        <div className={cn("space-y-6 transition-opacity duration-200", loading && "opacity-60")}>
          <FacilitySummary result={shown} lastYear={facility?.lastYear ?? latestYear} flag={facility ? facilityFlag(facility, latestYear) : null} />
          {!specialtyView && shown.community && <CommunityPanel context={shown.community} />}

          {specialtyView ? (
            shownSpecialty ? (
              <>
                <SpecialtyPanel
                  result={shownSpecialty}
                  specialty={view.specialty!}
                  onSpecialty={(key) => setSpecialty(key)}
                  facilities={facilities}
                  onCompare={(ids) => apply({ view: { ...view, compare: ids } })}
                  loading={loading}
                />
                {shown.peers.length > 0 && <PeerList peers={shown.peers} />}
              </>
            ) : (
              !error && <LoadingState count={2} message={loadingMessage} />
            )
          ) : linesView ? (
            shown.serviceLines && (
              <>
                <ServiceLinePanel rollup={shown.serviceLines} focus={null} onLine={setLine} onUnit={setUnit} loading={loading} />
                {shown.peers.length > 0 && <PeerList peers={shown.peers} />}
              </>
            )
          ) : shown.peers.length === 0 ? (
            <div className="glass rounded-2xl p-8 text-center">
              <p className="font-medium">No hospitals match these filters.</p>
              <p className="mt-1 text-sm text-muted-foreground">Remove a filter to widen the peer group.</p>
            </div>
          ) : (
            <>
              {shown.line && shown.serviceLines && (
                <ServiceLinePanel rollup={shown.serviceLines} focus={shown.line.id} onLine={setLine} onUnit={setUnit} loading={loading} />
              )}
              {parentLine && (
                <p className="rounded-xl bg-black/4 px-3.5 py-2.5 text-[13px] leading-relaxed text-muted-foreground dark:bg-white/6">
                  {shown.unit!.label} is part of the <span className="font-medium text-foreground">{parentLine.label}</span> service line
                  {parentLine.units.length > 1 &&
                    `, with ${listFormat(parentLine.units.filter((id) => id !== shown.unit!.id).map((id) => units.find((u) => u.id === id)?.label ?? id))}`}
                  .{" "}
                  <button
                    type="button"
                    onClick={() => setLine(parentLine.id)}
                    className="rounded font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    See the line combined
                  </button>
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <TrendLegend />
                <p className="max-w-xl text-xs text-tertiary-foreground sm:text-right">
                  {quality
                    ? "Care Compare measures are filed under the year their measurement period ends (periods span one to three years and overlap); infection data is by calendar year."
                    : shown.unit
                      ? `${DATASETS.hau.yearNote} ${shown.unit.label} beds only; peers without this unit are left out of the median.`
                      : shown.line
                        ? `${DATASETS.hau.yearNote} ${shown.line.label} units combined; peers with none of them are left out of the median.`
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
                    // Under a unit, the unit's own definitions (same ids, unit-specific fields and wording).
                    const meta = shown.unit?.definitions[id] ?? shown.line?.definitions[id] ?? metaById[id]
                    if (!meta || !shown.series[id]) return null
                    const companion = meta.companion && shown.series[meta.companion] ? meta.companion : null
                    return (
                      <MetricCard
                        key={id}
                        meta={meta}
                        points={shown.series[id]}
                        companion={companion ? { meta: metaById[companion], points: shown.series[companion] } : undefined}
                        source={shown.sources[meta.dataset]}
                        related={shown.unit || shown.line ? undefined : relatedFor(id)}
                        tags={[
                          shown.unit ? shown.unit.label : shown.line ? shown.line.label : null,
                          quality ? (meta.group ?? null) : null,
                          quality ? DATASETS[meta.dataset].shortLabel : null,
                          meta.estimate ? "Estimate" : null,
                          !quality && view.payer !== "all" && !meta.lens ? "All payers" : null,
                        ].filter((t): t is string => t != null)}
                      />
                    )
                  })}
                </div>
              )}
              {shown.payerMix && metaById.payerMix && (
                <PayerMixCard mix={shown.payerMix} groups={payerGroups} meta={metaById.payerMix} source={shown.sources["hafd-selected"]} />
              )}
              <PeerList peers={shown.peers} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function FacilitySummary({ result, lastYear, flag }: { result: BenchmarkResult; lastYear: number; flag: FacilityFlag | null }) {
  const f = result.facility
  const snapshot = result.snapshot
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
        <p className="text-xs font-medium tracking-wide text-tertiary-foreground uppercase">Hospital</p>
        <h2 className="text-2xl leading-tight font-semibold tracking-tight">{f.name}</h2>
        <p className="text-sm text-muted-foreground">{facts.join(" · ")}</p>
        {flag && <FacilityFlagNote flag={flag} />}
        {result.category === "utilization" && f.campuses.length > 0 && (
          <p className="text-[13px] text-muted-foreground">
            Includes {f.campuses.length === 1 ? "the" : "its"} {listFormat(f.campuses)} campus
            {f.campuses.length === 1 ? "" : "es"}, which report{f.campuses.length === 1 ? "s" : ""} utilization separately
            under the same license.
          </p>
        )}
        {result.unit && (
          <p className="rounded-xl bg-black/4 px-3.5 py-2.5 text-[13px] leading-relaxed text-muted-foreground dark:bg-white/6">
            Showing the <span className="font-medium text-foreground">{result.unit.label}</span> unit
            {unitAlias(result.unit) && ` (${unitAlias(result.unit)})`}
            {result.unit.beds != null && `: ${result.unit.beds.toLocaleString("en-US")} licensed beds in ${result.unit.lastYear}`}. The
            charts cover this unit only; the figures on this card are for the whole hospital. ED, surgery, and case mix
            data aren&apos;t reported by unit.
          </p>
        )}
        {result.line && (
          <p className="rounded-xl bg-black/4 px-3.5 py-2.5 text-[13px] leading-relaxed text-muted-foreground dark:bg-white/6">
            Showing the <span className="font-medium text-foreground">{result.line.label}</span> service line
            {result.line.beds != null && `: ${result.line.beds.toLocaleString("en-US")} licensed beds in ${result.line.lastYear}`}. The
            charts cover its units combined; the figures on this card are for the whole hospital.
          </p>
        )}
        {!flag && result.category !== "quality" && lastYear < latestOf(result) && (
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
        <dl className="mt-auto grid grid-cols-3 gap-x-3 gap-y-3.5 border-t border-black/6 pt-3 dark:border-white/8">
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
          <Stat
            label="Length of stay"
            value={snapshot.alos ? `${snapshot.alos.value.toFixed(1)} days` : "—"}
            sub={snapshot.alos ? `Acute · ${snapshot.alos.year}` : undefined}
          />
          <Stat
            label="Avg. daily census"
            value={snapshot.adc ? Math.round(snapshot.adc.value).toLocaleString("en-US") : "—"}
            sub={snapshot.adc ? `Acute · ${snapshot.adc.year}` : undefined}
          />
          <Stat
            label="Case mix index"
            value={snapshot.caseMixIndex ? snapshot.caseMixIndex.value.toFixed(2) : "—"}
            sub={snapshot.caseMixIndex ? `FFY ${snapshot.caseMixIndex.year}` : undefined}
          />
        </dl>
      </section>
      <section aria-label="Peer group" className="widget fade-up flex flex-col gap-1 p-5">
        <p className="text-xs font-medium tracking-wide text-tertiary-foreground uppercase">Compared with</p>
        <p className="num text-[40px] leading-none font-semibold tracking-tight">{result.peers.length}</p>
        <p className="text-[13px] font-medium">
          {similar ? "similar hospitals" : result.filters.mode === "statewide" ? "hospitals statewide" : `hospital${result.peers.length === 1 ? "" : "s"} you chose`}
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          {result.peerGroup.description}
          {!result.filters.includeNonComparable && ", not counting Kaiser and other non-comparable hospitals"}.
        </p>
        {result.peerGroup.note && <p className="text-xs leading-relaxed text-tertiary-foreground">{result.peerGroup.note}</p>}
        {result.line && (
          <p className="mt-1 text-[13px] leading-relaxed">
            <span className="font-medium">
              {result.line.peersWithUnit.count} of {result.peers.length}
            </span>{" "}
            <span className="text-muted-foreground">
              had {result.line.label} beds in {result.line.peersWithUnit.year}; only hospitals with the line count toward the
              peer median.
            </span>
          </p>
        )}
        {result.unit && (
          <p className="mt-1 text-[13px] leading-relaxed">
            <span className="font-medium">
              {result.unit.peersWithUnit.count} of {result.peers.length}
            </span>{" "}
            <span className="text-muted-foreground">
              had {result.unit.label.match(/^[AEIOU]/i) ? "an" : "a"} {result.unit.label} unit in {result.unit.peersWithUnit.year}
              ; only hospitals with the unit count toward the peer median.
            </span>
          </p>
        )}
      </section>
    </div>
  )
}

/** The plain-language name when it says more than HCAI's ("neonatal intensive care (NICU)"), else null. */
function unitAlias(unit: { label: string; description: string }) {
  const plain = unit.description.replace(/\s*\(.*\)$/, "").toLowerCase()
  return plain === unit.label.toLowerCase() ? null : unit.description.charAt(0).toLowerCase() + unit.description.slice(1)
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-tertiary-foreground">{label}</dt>
      <dd className="num truncate text-[15px] font-semibold tracking-tight">{value}</dd>
      {sub && <dd className="truncate text-xs text-tertiary-foreground">{sub}</dd>}
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

function LoadingState({ count, message }: { count: number; message: string }) {
  return (
    <div className="space-y-6" aria-busy>
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        {message}
      </p>
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
