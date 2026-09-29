"use client"

import { FileUp, Gauge, History, ListTree, Loader2, Pin, Search, Sparkles, X } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"

import { FacilityPicker, type FacilityOption } from "@/components/benchmark/facility-picker"
import { FilterPill } from "@/components/benchmark/filter-pill"
import { OverviewSection, SectionEmpty } from "@/components/overview/section"
import { LiveStatus } from "@/components/shell/live-status"
import { Segmented } from "@/components/shell/segmented"
import { StatusLine } from "@/components/shell/status-line"
import { DATASET_SLUG, DATASETS, parseDatasetSlug } from "@/lib/data/datasets"
import type { SourceStatus } from "@/lib/data/freshness"
import type { Dictionary, DictionaryField, DictionaryMetric, FieldYearMeta, HcaiDatasetId } from "@/lib/data/types"
import { normalizeColumn, type Extract } from "@/lib/translate/columns"
import { isNotable, materiality } from "@/lib/translate/notable"
import { clearRecentSearches, rememberSearch, toggleWatch, useRecentSearches, useWatchlist } from "@/lib/translate/watchlist"
import { rememberSelection } from "@/lib/selection"
import { auditLabel } from "@/lib/status"
import { ExtractInput } from "./extract-input"
import { FieldRow, metricTrend, MetricRow, type FieldValues, type MetricValues, type ValueContext } from "./field-row"

// Data definitions (V7.5) has two modes. Focused, the default: what's notable for the chosen hospital first, then the
// fields and measures the viewer pinned, then the key measures, with recent searches under the search box. Browse all
// fields: every field, section by section, with a sticky index of sections; a deep link to one field opens here. Both
// lead with plain-language names; HCAI's field codes come second.

type FacilityFields = {
  values: Record<string, Record<string, number | null>>
  meta: Record<string, FieldYearMeta>
  /** The dictionary's measures by year (V7.5). */
  metrics?: Record<string, Record<string, number | null>>
}

export type DefinitionsMode = "focused" | "browse"
type Order = "notable" | "hcai"

export type { FacilityFields }

/** Most rows in each of the focused view's "notable" lists. */
const NOTABLE_SHOWN = 5
/** Most search results listed in the focused view. */
const RESULTS_SHOWN = 30

export function TranslateView({
  dataset,
  dictionary,
  otherSource,
  facilities,
  latestYear,
  sourceStatus,
  sourceLatestYear,
  initialFacilityId,
  initialFacilityData,
  initialFocus,
  initialMode,
}: {
  dataset: HcaiDatasetId
  dictionary: Dictionary
  /** The other dataset's field codes, to spot an extract uploaded under the wrong source. */
  otherSource: { slug: string; codes: string[] }
  facilities: FacilityOption[]
  latestYear: number
  /** This source's publication and processing dates, for the status line. */
  sourceStatus: SourceStatus
  /** The newest year this source has for any hospital. */
  sourceLatestYear: number
  initialFacilityId: string | null
  initialFacilityData: FacilityFields | null
  /** Field code or metric id to open and scroll to on load. */
  initialFocus: string | null
  initialMode: DefinitionsMode
}) {
  const router = useRouter()
  const [mode, setMode] = useState<DefinitionsMode>(initialFocus ? "browse" : initialMode)
  const [query, setQuery] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(initialFocus ? [initialFocus] : []))
  const [facilityId, setFacilityId] = useState<string | null>(initialFacilityId)
  const [facilityData, setFacilityData] = useState<FacilityFields | null>(initialFacilityData)
  const [loadingFacility, setLoadingFacility] = useState(false)
  const [year, setYear] = useState<number | null>(null)
  const [order, setOrder] = useState<Order>("notable")
  const [showExtractInput, setShowExtractInput] = useState(false)
  const [extract, setExtract] = useState<Extract | null>(null)
  const [extractRow, setExtractRow] = useState(0)
  const [scrollTo, setScrollTo] = useState<string | null>(initialFocus)
  const fetched = useRef<string | null>(null)
  const watchlist = useWatchlist(dataset)
  const recent = useRecentSearches()
  useEffect(() => {
    rememberSelection({ ...(facilityId ? { facilityId } : {}), category: dataset === "hau" ? "utilization" : "financial" })
  }, [facilityId, dataset])
  const source = DATASET_SLUG[dataset]
  const hrefFor = (params: Record<string, string | null>) => {
    const qs = new URLSearchParams({ source })
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v)
    return `/data-definitions?${qs}`
  }
  const syncUrl = (next: { facility?: string | null; mode?: DefinitionsMode }) =>
    window.history.replaceState(
      null,
      "",
      hrefFor({ facility: next.facility !== undefined ? next.facility : facilityId, view: (next.mode ?? mode) === "browse" ? "browse" : null })
    )

  const sections = useMemo(() => new Map(dictionary.sections.map((s) => [s.id, s])), [dictionary.sections])
  const fieldByCode = useMemo(() => new Map(dictionary.fields.map((f) => [f.code, f])), [dictionary.fields])
  // Measures documented with this source (payer mix is a composition, not one number).
  const measures = useMemo(() => dictionary.metrics.filter((m) => m.unit !== "share"), [dictionary.metrics])
  const usedIn = useMemo(() => {
    const map = new Map<string, DictionaryMetric[]>()
    for (const m of measures) for (const code of m.inputs) map.set(code, [...(map.get(code) ?? []), m])
    return map
  }, [measures])

  // -- facility values -------------------------------------------------------
  async function selectFacility(id: string | null) {
    setFacilityId(id)
    setFacilityData(null)
    setYear(null)
    syncUrl({ facility: id })
    if (!id) return
    fetched.current = id
    setLoadingFacility(true)
    try {
      const res = await fetch(`/api/facilities/${id}/fields?source=${source}`)
      if (!res.ok) throw new Error()
      const data = (await res.json()) as FacilityFields
      if (fetched.current === id) setFacilityData(data)
    } finally {
      if (fetched.current === id) setLoadingFacility(false)
    }
  }

  function switchMode(next: DefinitionsMode) {
    setMode(next)
    syncUrl({ mode: next })
  }

  /** Open a field or measure in Browse all fields and bring it into view (from a measure's source fields, or a list). */
  function openInBrowse(id: string) {
    setQuery("")
    setExpanded((prev) => new Set(prev).add(id))
    switchMode("browse")
    setScrollTo(id)
  }

  // Scroll a deep-linked or jumped-to entry into view once it's rendered.
  useEffect(() => {
    if (!scrollTo) return
    const frame = requestAnimationFrame(() => {
      document.getElementById(`field-${scrollTo}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
      setScrollTo(null)
    })
    return () => cancelAnimationFrame(frame)
  }, [scrollTo, mode])

  const years = facilityData ? Object.keys(facilityData.values).map(Number).sort((a, b) => a - b) : []
  const activeYear = year ?? years.at(-1) ?? null
  const prevYear = activeYear != null ? (years.filter((y) => y < activeYear).at(-1) ?? null) : null
  const operatingExpense = activeYear != null ? (facilityData?.values[activeYear]?.TOT_OP_EXP ?? null) : null

  // -- extract mapping -------------------------------------------------------
  const extractColumns = useMemo(() => {
    if (!extract) return null
    return extract.headers.map((h, i) => ({ header: h, code: normalizeColumn(h), index: i }))
  }, [extract])
  const unknownColumns = extractColumns?.filter((c) => c.header && !fieldByCode.has(c.code)) ?? []
  // An extract that matches the other dataset's fields better was probably uploaded under the wrong source.
  const otherCodes = useMemo(() => new Set(otherSource.codes), [otherSource.codes])
  const likelyOtherSource =
    extractColumns != null &&
    extractColumns.filter((c) => otherCodes.has(c.code)).length > extractColumns.length - unknownColumns.length + 5
  const extractFacilityId = useMemo(() => {
    if (!extract || !extractColumns) return null
    const col = extractColumns.find((c) => c.code === "FAC_NO")
    const raw = col ? extract.rows[extractRow]?.[col.index] : null
    const id = raw != null ? String(raw).replace(/\.0$/, "") : null
    return id && facilities.some((f) => f.id === id) ? id : null
  }, [extract, extractColumns, extractRow, facilities])

  // -- values per field and measure ------------------------------------------
  function valuesFor(field: DictionaryField): FieldValues | null {
    if (extract && extractColumns) {
      const col = extractColumns.find((c) => c.code === field.code)
      if (!col) return null
      const v = extract.rows[extractRow]?.[col.index] ?? null
      return { current: v }
    }
    if (!facilityData || activeYear == null) return null
    if (["text", "date", "code"].includes(field.unit)) return null
    const current = facilityData.values[activeYear]?.[field.code] ?? null
    const previous = prevYear != null ? (facilityData.values[prevYear]?.[field.code] ?? null) : null
    const change =
      current != null && previous != null && previous !== 0 ? (current - previous) / Math.abs(previous) : null
    return {
      current,
      previous,
      change,
      history: years.map((y) => ({
        year: y,
        value: facilityData.values[y]?.[field.code] ?? null,
        annualized: facilityData.meta[y]?.annualized ?? false,
      })),
    }
  }

  function metricValuesFor(metric: DictionaryMetric): MetricValues | null {
    if (extract || !facilityData?.metrics || activeYear == null) return null
    const at = (y: number | null) => (y != null ? (facilityData.metrics?.[y]?.[metric.id] ?? null) : null)
    return { current: at(activeYear), previous: at(prevYear), history: years.map((y) => ({ year: y, value: at(y) })) }
  }

  const notableCodes = useMemo(() => {
    const set = new Set<string>()
    if (!facilityData || extract) return set
    for (const f of dictionary.fields) {
      const v = valuesFor(f)
      if (v && typeof v.current !== "string" && isNotable(f, { current: v.current, previous: v.previous ?? null, change: v.change ?? null }, operatingExpense)) {
        set.add(f.code)
      }
    }
    return set
    // valuesFor reads the hospital's values for the active year.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilityData, activeYear, prevYear, extract, dictionary.fields, operatingExpense])

  // -- search ----------------------------------------------------------------
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const searching = terms.length > 0
  const matches = (hay: string) => terms.every((t) => hay.includes(t))
  const fieldMatches = (f: DictionaryField) => matches(`${f.label} ${f.summary} ${f.hcaiLabel} ${f.code}`.toLowerCase())
  const measureMatches = (m: DictionaryMetric) => matches(`${m.label} ${m.summary} ${m.formula} ${m.id}`.toLowerCase())

  function toggle(id: string) {
    // Opening a search result counts the search as one worth remembering.
    if (searching && !expanded.has(id)) rememberSearch(query)
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const facilityName = facilities.find((f) => f.id === facilityId)?.name ?? null
  const context: ValueContext = { facilityId, facilityName, year: activeYear, prevYear, extract: !!extract }
  const campuses = activeYear != null ? (facilityData?.meta[activeYear]?.campuses ?? []) : []

  const fieldRow = (field: DictionaryField, { badge = true }: { badge?: boolean } = {}) => (
    <FieldRow
      key={field.code}
      dataset={dataset}
      field={field}
      section={sections.get(field.section)}
      values={valuesFor(field)}
      usedIn={usedIn.get(field.code) ?? []}
      notable={badge && notableCodes.has(field.code)}
      pinned={watchlist.includes(field.code)}
      onPin={() => toggleWatch(dataset, field.code)}
      expanded={expanded.has(field.code)}
      onToggle={() => toggle(field.code)}
      context={context}
    />
  )
  const measureRow = (metric: DictionaryMetric) => (
    <MetricRow
      key={metric.id}
      dataset={dataset}
      metric={metric}
      values={metricValuesFor(metric)}
      inputs={metric.inputs.map((c) => fieldByCode.get(c)).filter((f): f is DictionaryField => !!f)}
      pinned={watchlist.includes(metric.id)}
      onPin={() => toggleWatch(dataset, metric.id)}
      expanded={expanded.has(metric.id)}
      onToggle={() => toggle(metric.id)}
      onJump={openInBrowse}
      context={context}
    />
  )

  const browsing = mode === "browse" || !!extract
  const liveCount = searching ? dictionary.fields.filter(fieldMatches).length + measures.filter(measureMatches).length : 0

  return (
    <div className="space-y-6">
      <LiveStatus
        message={
          loadingFacility
            ? `Loading ${facilityName ?? "the hospital"}’s values…`
            : searching
              ? `${liveCount} ${liveCount === 1 ? "match" : "matches"} for “${query.trim()}”.`
              : ""
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Which HCAI dataset"
          value={source}
          onChange={(slug) =>
            router.push(
              `/data-definitions?${new URLSearchParams({ source: slug, ...(facilityId ? { facility: facilityId } : {}), ...(mode === "browse" ? { view: "browse" } : {}) })}`,
              { scroll: false }
            )
          }
          options={(["hafd-selected", "hau"] as const).map((d) => ({ value: DATASET_SLUG[d], label: DATASETS[d].shortLabel }))}
        />
        {!extract && (
          <Segmented
            label="View"
            value={mode}
            onChange={switchMode}
            options={[
              { value: "focused", label: "Focused" },
              { value: "browse", label: "Browse all fields" },
            ]}
          />
        )}
      </div>

      {/* Search + hospital */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <label className="glass flex h-11 min-w-0 items-center gap-2.5 rounded-xl px-3.5 transition-shadow duration-200 focus-within:glow-soft focus-within:ring-2 focus-within:ring-ring">
            <Search className="size-4 shrink-0 text-tertiary-foreground" aria-hidden />
            <span className="sr-only">Search fields and measures</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && rememberSearch(query)}
              placeholder={dataset === "hau" ? "Search: ICU days, ED visits, diversion…" : "Search: charity care, Medi-Cal revenue, staffed beds…"}
              className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="text-tertiary-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            )}
          </label>
          {recent.length > 0 && !searching && (
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Recent searches">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <History className="size-3.5" aria-hidden /> Recent:
              </span>
              {recent.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setQuery(r)}
                  className="glass-subtle inline-flex h-7 max-w-48 items-center rounded-full px-2.5 text-[12px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="truncate">{r}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={clearRecentSearches}
                className="h-7 px-1 text-xs text-muted-foreground hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                Clear
              </button>
            </div>
          )}
        </div>
        {!extract && (
          <div className="flex min-w-0 items-start gap-2">
            <FacilityPicker facilities={facilities} value={facilityId} onChange={(id) => void selectFacility(id)} latestYear={latestYear} />
            {facilityId && (
              <button
                type="button"
                onClick={() => void selectFacility(null)}
                aria-label="Stop showing hospital values"
                className="glass flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 empty:hidden">
        {facilityData && !extract && years.length > 1 && (
          <FilterPill
            label="Year"
            summary={activeYear != null ? `${activeYear}${prevYear ? ` vs ${prevYear}` : ""}` : null}
            options={years.slice(1).reverse().map((y) => ({ value: String(y), label: `${y} vs ${years.filter((p) => p < y).at(-1)}` }))}
            selected={activeYear != null ? [String(activeYear)] : []}
            active={year != null && year !== years.at(-1)}
            onChange={([v]) => setYear(Number(v))}
          />
        )}
        {browsing && facilityData && !extract && (
          <FilterPill
            label="Order"
            summary={order === "notable" ? "Notable first" : "HCAI form order"}
            options={[
              { value: "notable", label: "Notable first, within each section" },
              { value: "hcai", label: "HCAI form order" },
            ]}
            selected={[order]}
            active={order !== "notable"}
            onChange={([v]) => setOrder(v as Order)}
          />
        )}
        {browsing && !extract && !showExtractInput && (
          <button
            type="button"
            onClick={() => setShowExtractInput(true)}
            className="glass-subtle inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors hover:bg-white/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:hover:bg-white/10"
          >
            <FileUp className="size-3.5" /> Translate an extract
          </button>
        )}
        {loadingFacility && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" aria-hidden>
            <Loader2 className="size-3.5 animate-spin" /> Loading {facilityName ?? "the hospital"}&apos;s values
          </span>
        )}
      </div>

      {showExtractInput && !extract && (
        <ExtractInput
          onLoad={(e) => {
            setExtract(e)
            setExtractRow(0)
            setShowExtractInput(false)
            setOrder("hcai")
          }}
          onCancel={() => setShowExtractInput(false)}
        />
      )}

      {extract && extractColumns && (
        <ExtractBanner
          extract={extract}
          recognized={extractColumns.length - unknownColumns.length}
          row={extractRow}
          onRowChange={setExtractRow}
          nameIndex={extractColumns.find((c) => c.code === "FAC_NAME")?.index ?? null}
          matchedFacilityId={extractFacilityId}
          onCompare={(id) => {
            setExtract(null)
            void selectFacility(id)
          }}
          onClear={() => setExtract(null)}
        />
      )}

      {likelyOtherSource && (
        <p className="rounded-xl bg-muted px-3.5 py-2.5 text-[13px] text-muted-foreground">
          This file looks like {otherSource.slug === "utilization" ? "a utilization" : "a financial"} extract.{" "}
          <Link href={`/data-definitions?source=${otherSource.slug}`} className="font-medium text-primary hover:underline">
            Switch to {DATASETS[parseDatasetSlug(otherSource.slug)].shortLabel.toLowerCase()}
          </Link>{" "}
          and upload it there.
        </p>
      )}

      {facilityId && facilityData && !extract && years.length === 0 && (
        <p className="rounded-xl bg-muted px-3.5 py-2.5 text-[13px] text-muted-foreground">
          HCAI has no {dataset === "hau" ? "utilization" : "financial"} data for {facilityName} in these years.
        </p>
      )}

      {facilityData && !extract && activeYear != null && (
        <div className="space-y-2">
          <p className="text-[13px] text-muted-foreground">
            Showing {facilityName}&apos;s {activeYear} values
            {prevYear != null && <> and the change from {prevYear}</>}.{" "}
            {campuses.length > 0 && (
              <>
                Includes the {new Intl.ListFormat("en-US").format(campuses)} campus{campuses.length === 1 ? "" : "es"} on the same
                license.{" "}
              </>
            )}
            {notableCodes.size > 0 && (
              <>
                <span className="font-medium text-foreground">{notableCodes.size}</span> field{notableCodes.size === 1 ? "" : "s"} had a notable
                change.
              </>
            )}
          </p>
          <StatusLine
            through={String(activeYear)}
            periodType={DATASETS[dataset].periodType}
            published={
              sourceStatus.published[activeYear]
                ? `Published ${sourceStatus.published[activeYear]}`
                : sourceStatus.sourceUpdated
                  ? `Source updated ${sourceStatus.sourceUpdated}`
                  : null
            }
            processed={`Processed ${sourceStatus.processed}`}
            audit={dataset === "hafd-selected" ? auditLabel(facilityData.meta[activeYear]?.status) : null}
            flags={[
              ...(years.at(-1)! < sourceLatestYear ? (["stale"] as const) : []),
              ...(sourceStatus.provisional.includes(activeYear) ? (["provisional"] as const) : []),
              ...(facilityData.meta[activeYear]?.annualized ? (["partial-period"] as const) : []),
            ]}
            flagDetail={{ stale: `This hospital's latest report is ${years.at(-1)}; HCAI has published ${sourceLatestYear}.` }}
          />
        </div>
      )}

      {browsing ? (
        <BrowseAll
          dictionary={dictionary}
          measures={measures}
          fields={extractColumns ? extractColumns.map((c) => fieldByCode.get(c.code)).filter((f): f is DictionaryField => !!f) : dictionary.fields}
          keepFileOrder={!!extract}
          fieldFilter={searching ? fieldMatches : null}
          measureFilter={extract ? () => false : searching ? measureMatches : null}
          notable={notableCodes}
          notableFirst={order === "notable" && !!facilityData && !extract}
          fieldRow={fieldRow}
          measureRow={measureRow}
          query={query}
        />
      ) : searching ? (
        <SearchResults
          fields={dictionary.fields.filter(fieldMatches)}
          measures={measures.filter(measureMatches)}
          fieldRow={fieldRow}
          measureRow={measureRow}
          query={query}
          onBrowse={() => switchMode("browse")}
        />
      ) : (
        <Focused
          dataset={dataset}
          facilityName={facilityName}
          loading={loadingFacility}
          hasValues={!!facilityData && activeYear != null}
          yearLabel={prevYear != null && activeYear != null ? `${prevYear} to ${activeYear}` : null}
          notableFields={dictionary.fields
            .filter((f) => notableCodes.has(f.code))
            .map((f) => {
              const v = valuesFor(f)!
              return { field: f, score: materiality(f, { current: v.current as number, previous: v.previous ?? null, change: v.change ?? null }, operatingExpense) }
            })
            .sort((a, b) => b.score - a.score)
            .map((x) => x.field)}
          watched={watchlist.flatMap((id): FocusedEntry[] => {
            const m = measures.find((x) => x.id === id)
            if (m) return [{ kind: "measure", metric: m }]
            const f = fieldByCode.get(id)
            return f ? [{ kind: "field", field: f }] : []
          })}
          keyMeasures={keyMeasures(measures, metricValuesFor)}
          fieldRow={fieldRow}
          measureRow={measureRow}
          onBrowseNotable={() => {
            setOrder("notable")
            switchMode("browse")
          }}
        />
      )}

      {unknownColumns.length > 0 && (
        <section className="surface rounded-2xl p-5">
          <h2 className="text-[13px] font-semibold">Columns not in this dictionary ({unknownColumns.length})</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            These may come from a different HCAI dataset (like the Quarterly or complete Annual Disclosure file), which this app doesn&apos;t
            cover yet.
          </p>
          <p className="mt-3 font-mono text-xs leading-relaxed text-muted-foreground">{unknownColumns.map((c) => c.header).join(" · ")}</p>
        </section>
      )}
    </div>
  )
}

/**
 * The key measures for the focused view: the source's own measures on Compare (not the Medicare versions, which Browse
 * lists), exceptions first — worsening, then improving, then the rest in the dictionary's order.
 */
function keyMeasures(measures: DictionaryMetric[], valuesOf: (m: DictionaryMetric) => MetricValues | null) {
  const rank = { worsening: 0, improving: 1 } as Record<string, number>
  return measures
    .filter((m) => m.category != null && !m.lens)
    .map((m, i) => ({ m, i, t: metricTrend(m, valuesOf(m)) }))
    .sort((a, b) => (rank[a.t ?? ""] ?? 2) - (rank[b.t ?? ""] ?? 2) || a.i - b.i)
    .map((x) => x.m)
}

type FocusedEntry = { kind: "measure"; metric: DictionaryMetric } | { kind: "field"; field: DictionaryField }

function RowList({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card ring-1 ring-border">{children}</ul>
}

function Focused({
  dataset,
  facilityName,
  loading,
  hasValues,
  yearLabel,
  notableFields,
  watched,
  keyMeasures,
  fieldRow,
  measureRow,
  onBrowseNotable,
}: {
  dataset: HcaiDatasetId
  facilityName: string | null
  loading: boolean
  hasValues: boolean
  yearLabel: string | null
  /** Notable fields, most material first. */
  notableFields: DictionaryField[]
  watched: FocusedEntry[]
  keyMeasures: DictionaryMetric[]
  fieldRow: (f: DictionaryField, opts?: { badge?: boolean }) => React.ReactNode
  measureRow: (m: DictionaryMetric) => React.ReactNode
  onBrowseNotable: () => void
}) {
  const dollars = notableFields.filter((f) => f.unit === "usd")
  const volumes = notableFields.filter((f) => f.unit !== "usd")
  const lists = [
    { title: "Biggest dollar changes", note: "Ranked by size against total operating expenses.", rows: dollars },
    { title: dataset === "hau" ? "Biggest changes" : "Biggest volume and staffing changes", note: "Ranked by percent change.", rows: volumes },
  ].filter((l) => l.rows.length)
  return (
    <div className="space-y-5">
      <OverviewSection
        id="definitions-notable"
        icon={Sparkles}
        title={facilityName ? `Notable for ${facilityName}` : "Notable changes"}
        description={
          hasValues && yearLabel
            ? `Fields that moved 20% or more from ${yearLabel}, by a material amount: at least 1% of operating expenses for dollars, and not tiny counts.`
            : "Fields that moved a lot from one year to the next, for the hospital you choose."
        }
        busy={loading}
      >
        {!facilityName ? (
          <SectionEmpty title="Choose a hospital to see what changed">
            Pick one above: the fields that moved most for it come first, with what can drive each change.
          </SectionEmpty>
        ) : loading || !hasValues ? (
          loading ? (
            <p className="text-[13px] text-muted-foreground">Loading {facilityName}&apos;s values…</p>
          ) : (
            <SectionEmpty title="No year-over-year change to show">This hospital has fewer than two years of this report.</SectionEmpty>
          )
        ) : lists.length === 0 ? (
          <SectionEmpty title="Nothing notable">
            No field moved 20% or more by a material amount{yearLabel ? ` from ${yearLabel}` : ""}.
          </SectionEmpty>
        ) : (
          <div className="space-y-4">
            {lists.map((l) => (
              <div key={l.title} className="space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <h3 className="text-[13px] font-semibold">{l.title}</h3>
                  <p className="text-xs text-muted-foreground">
                    {l.rows.length > NOTABLE_SHOWN ? `Top ${NOTABLE_SHOWN} of ${l.rows.length}. ` : ""}
                    {l.note}
                  </p>
                </div>
                <RowList>{l.rows.slice(0, NOTABLE_SHOWN).map((f) => fieldRow(f, { badge: false }))}</RowList>
              </div>
            ))}
            <button
              type="button"
              onClick={onBrowseNotable}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <ListTree className="size-3.5" aria-hidden />
              See all {notableFields.length} notable field{notableFields.length === 1 ? "" : "s"} in Browse all fields
            </button>
          </div>
        )}
      </OverviewSection>

      <OverviewSection
        id="definitions-watchlist"
        icon={Pin}
        title="Your watchlist"
        description="Fields and measures you pinned. Saved in this browser only."
      >
        {watched.length === 0 ? (
          <SectionEmpty title="Nothing pinned yet">
            Use the pin on any field or measure to keep it here, with its latest value for the hospital you choose.
          </SectionEmpty>
        ) : (
          <RowList>{watched.map((e) => (e.kind === "measure" ? measureRow(e.metric) : fieldRow(e.field)))}</RowList>
        )}
      </OverviewSection>

      <OverviewSection
        id="definitions-key"
        icon={Gauge}
        title="Key measures"
        description={
          hasValues
            ? "The measures Compare shows from this report, worsening first, then improving. Open one for its formula and source fields."
            : "The measures Compare shows from this report. Open one for its formula and source fields."
        }
      >
        <RowList>{keyMeasures.map(measureRow)}</RowList>
      </OverviewSection>
    </div>
  )
}

function SearchResults({
  fields,
  measures,
  fieldRow,
  measureRow,
  query,
  onBrowse,
}: {
  fields: DictionaryField[]
  measures: DictionaryMetric[]
  fieldRow: (f: DictionaryField) => React.ReactNode
  measureRow: (m: DictionaryMetric) => React.ReactNode
  query: string
  onBrowse: () => void
}) {
  if (!fields.length && !measures.length) return <NoMatches query={query} />
  return (
    <div className="space-y-5">
      {measures.length > 0 && (
        <section aria-labelledby="results-measures" className="space-y-2">
          <h2 id="results-measures" className="px-1 text-[13px] font-semibold">
            Measures ({measures.length})
          </h2>
          <RowList>{measures.map(measureRow)}</RowList>
        </section>
      )}
      {fields.length > 0 && (
        <section aria-labelledby="results-fields" className="space-y-2">
          <h2 id="results-fields" className="px-1 text-[13px] font-semibold">
            Fields ({fields.length})
          </h2>
          <RowList>{fields.slice(0, RESULTS_SHOWN).map((f) => fieldRow(f))}</RowList>
          {fields.length > RESULTS_SHOWN && (
            <p className="px-1 text-[13px] text-muted-foreground">
              {fields.length - RESULTS_SHOWN} more.{" "}
              <button type="button" onClick={onBrowse} className="font-medium text-primary hover:underline">
                See them all in Browse all fields
              </button>{" "}
              or search for something more specific.
            </p>
          )}
        </section>
      )}
    </div>
  )
}

function NoMatches({ query }: { query: string }) {
  return (
    <div className="glass rounded-2xl p-10 text-center">
      <p className="font-medium">Nothing matches “{query}”.</p>
      <p className="mt-1 text-sm text-muted-foreground">Try a plain word like “charity” or “ICU”, or a field code like CASH.</p>
    </div>
  )
}

/** Every field, section by section, with a sticky index; the measures come first. */
function BrowseAll({
  dictionary,
  measures,
  fields,
  keepFileOrder,
  fieldFilter,
  measureFilter,
  notable,
  notableFirst,
  fieldRow,
  measureRow,
  query,
}: {
  dictionary: Dictionary
  measures: DictionaryMetric[]
  fields: DictionaryField[]
  keepFileOrder: boolean
  fieldFilter: ((f: DictionaryField) => boolean) | null
  measureFilter: ((m: DictionaryMetric) => boolean) | null
  notable: Set<string>
  notableFirst: boolean
  fieldRow: (f: DictionaryField) => React.ReactNode
  measureRow: (m: DictionaryMetric) => React.ReactNode
  query: string
}) {
  const shownMeasures = measureFilter ? measures.filter(measureFilter) : measures
  const shownFields = fieldFilter ? fields.filter(fieldFilter) : fields
  const groups = dictionary.sections
    .map((s) => {
      let rows = shownFields.filter((f) => f.section === s.id)
      if (notableFirst) rows = [...rows.filter((f) => notable.has(f.code)), ...rows.filter((f) => !notable.has(f.code))]
      return { section: s, rows, notable: rows.filter((f) => notable.has(f.code)).length }
    })
    .filter((g) => g.rows.length)
  // Keep an uploaded file's column order.
  if (keepFileOrder) groups.sort((a, b) => shownFields.indexOf(a.rows[0]) - shownFields.indexOf(b.rows[0]))
  if (!groups.length && !shownMeasures.length) return <NoMatches query={query} />

  const index = [
    ...(shownMeasures.length ? [{ id: "section-measures", label: "Measures", count: shownMeasures.length, notable: 0 }] : []),
    ...groups.map((g) => ({ id: `section-${g.section.id}`, label: g.section.title, count: g.rows.length, notable: g.notable })),
  ]
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
      <nav aria-label="Field sections" className="glass-strong sticky top-12 z-10 -mx-4 border-b border-border px-4 py-2 md:top-24 md:mx-0 md:self-start md:rounded-2xl md:border-0 md:p-2">
        <p className="sr-only md:not-sr-only md:px-2 md:pt-1 md:pb-2 md:text-xs md:font-semibold md:tracking-wide md:text-tertiary-foreground md:uppercase">
          Sections
        </p>
        <ul className="relative flex gap-1.5 overflow-x-auto md:max-h-[calc(100dvh-9rem)] md:flex-col md:gap-0.5 md:overflow-y-auto">
          {index.map((i) => (
            <li key={i.id} className="shrink-0">
              <a
                href={`#${i.id}`}
                className="flex h-8 items-center gap-2 rounded-full px-3 text-[13px] whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:h-auto md:rounded-lg md:px-2 md:py-1.5 md:whitespace-normal"
              >
                <span className="md:flex-1">{i.label}</span>
                {i.notable > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs text-foreground" title={`${i.notable} notable`}>
                    <span className="size-1.5 rounded-full bg-warning" aria-hidden />
                    {i.notable}
                    <span className="sr-only"> notable</span>
                  </span>
                )}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 space-y-6">
        {shownMeasures.length > 0 && (
          <section id="section-measures" aria-labelledby="section-measures-title" className="scroll-mt-28 space-y-2 md:scroll-mt-24">
            <div className="px-1">
              <h2 id="section-measures-title" className="text-[13px] font-semibold tracking-tight">
                Measures
              </h2>
              <p className="text-xs text-muted-foreground">The measures Padua calculates from these fields, with their formulas.</p>
            </div>
            <RowList>{shownMeasures.map(measureRow)}</RowList>
          </section>
        )}
        {groups.map(({ section: s, rows, notable: n }) => (
          <section key={s.id} id={`section-${s.id}`} aria-labelledby={`section-${s.id}-title`} className="scroll-mt-28 space-y-2 md:scroll-mt-24">
            <div className="px-1">
              <h2 id={`section-${s.id}-title`} className="text-[13px] font-semibold tracking-tight">
                {s.title}
                {n > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">{n} notable</span>}
              </h2>
              <p className="text-xs text-muted-foreground">{s.summary}</p>
            </div>
            <RowList>{rows.map((f) => fieldRow(f))}</RowList>
          </section>
        ))}
      </div>
    </div>
  )
}

function ExtractBanner({
  extract,
  recognized,
  row,
  onRowChange,
  nameIndex,
  matchedFacilityId,
  onCompare,
  onClear,
}: {
  extract: Extract
  recognized: number
  row: number
  onRowChange: (row: number) => void
  nameIndex: number | null
  matchedFacilityId: string | null
  onCompare: (id: string) => void
  onClear: () => void
}) {
  return (
    <section className="glass fade-up flex flex-col gap-3 rounded-2xl p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold tracking-tight">{extract.fileName}</p>
        <p className="text-[13px] text-muted-foreground">
          {recognized} of {extract.headers.length} columns recognized · {extract.rows.length} row{extract.rows.length === 1 ? "" : "s"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {extract.rows.length > 1 && (
          <label className="flex items-center gap-2 text-[13px]">
            <span className="text-muted-foreground">Row</span>
            <select
              value={row}
              onChange={(e) => onRowChange(Number(e.target.value))}
              className="h-8 max-w-64 rounded-lg bg-muted px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {extract.rows.map((r, i) => (
                <option key={i} value={i}>
                  {nameIndex != null && r[nameIndex] ? String(r[nameIndex]) : `Row ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
        )}
        {matchedFacilityId && (
          <button
            type="button"
            onClick={() => onCompare(matchedFacilityId)}
            className="btn-accent h-8 rounded-full px-3 text-[13px] font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            See this hospital&apos;s history
          </button>
        )}
        <button
          type="button"
          onClick={onClear}
          className="h-8 rounded-full px-3 text-[13px] text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Clear
        </button>
      </div>
    </section>
  )
}

