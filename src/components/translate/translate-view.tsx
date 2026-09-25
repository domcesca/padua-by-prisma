"use client"

import { ChevronRight, FileUp, Loader2, Search, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"

import Link from "next/link"

import { FacilityPicker, type FacilityOption } from "@/components/benchmark/facility-picker"
import { FilterPill } from "@/components/benchmark/filter-pill"
import { Segmented } from "@/components/shell/segmented"
import { DATASET_SLUG, DATASETS, parseDatasetSlug } from "@/lib/data/datasets"
import type { DatasetId, Dictionary, DictionaryField, DictionaryMetric, FieldYearMeta } from "@/lib/data/types"
import { normalizeColumn, type Extract } from "@/lib/translate/columns"
import { rememberSelection } from "@/lib/selection"
import { cn } from "@/lib/utils"
import { ExtractInput } from "./extract-input"
import { BIG_CHANGE, FieldRow, type FieldValues } from "./field-row"

type FacilityFields = {
  values: Record<string, Record<string, number | null>>
  meta: Record<string, FieldYearMeta>
}

type SortMode = "hcai" | "change"

export type { FacilityFields }

export function TranslateView({
  dataset,
  dictionary,
  otherSource,
  facilities,
  latestYear,
  initialFacilityId,
  initialFacilityData,
  initialFocus,
}: {
  dataset: DatasetId
  dictionary: Dictionary
  /** The other dataset's field codes, to spot an extract uploaded under the wrong source. */
  otherSource: { slug: string; codes: string[] }
  facilities: FacilityOption[]
  latestYear: number
  initialFacilityId: string | null
  initialFacilityData: FacilityFields | null
  /** Field code or metric id to open and scroll to on load. */
  initialFocus: string | null
}) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [section, setSection] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(initialFocus ? [initialFocus] : []))
  const [facilityId, setFacilityId] = useState<string | null>(initialFacilityId)
  const [facilityData, setFacilityData] = useState<FacilityFields | null>(initialFacilityData)
  const [loadingFacility, setLoadingFacility] = useState(false)
  const [year, setYear] = useState<number | null>(null)
  const [sort, setSort] = useState<SortMode>("hcai")
  const [showExtractInput, setShowExtractInput] = useState(false)
  const [extract, setExtract] = useState<Extract | null>(null)
  const [extractRow, setExtractRow] = useState(0)
  const fetched = useRef<string | null>(null)
  useEffect(() => {
    rememberSelection({ ...(facilityId ? { facilityId } : {}), category: dataset === "hau" ? "utilization" : "financial" })
  }, [facilityId, dataset])
  const source = DATASET_SLUG[dataset]
  const hrefFor = (params: Record<string, string | null>) => {
    const qs = new URLSearchParams({ source })
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v)
    return `/translate?${qs}`
  }

  const sections = useMemo(() => new Map(dictionary.sections.map((s) => [s.id, s])), [dictionary.sections])
  const fieldByCode = useMemo(() => new Map(dictionary.fields.map((f) => [f.code, f])), [dictionary.fields])

  // -- facility values -------------------------------------------------------
  async function selectFacility(id: string | null) {
    setFacilityId(id)
    setFacilityData(null)
    setYear(null)
    router.replace(hrefFor({ facility: id }), { scroll: false })
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

  // Scroll a deep-linked field (e.g. from a Benchmark "Why this number moves" link) into view.
  useEffect(() => {
    if (!initialFocus) return
    const frame = requestAnimationFrame(() =>
      document.getElementById(`field-${initialFocus}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
    )
    return () => cancelAnimationFrame(frame)
  }, [initialFocus])

  const years = facilityData ? Object.keys(facilityData.values).map(Number).sort((a, b) => a - b) : []
  const activeYear = year ?? years.at(-1) ?? null
  const prevYear = activeYear != null ? (years.filter((y) => y < activeYear).at(-1) ?? null) : null

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

  // -- values per field ------------------------------------------------------
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

  // -- filtering & ordering --------------------------------------------------
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (hay: string) => terms.every((t) => hay.includes(t))

  let fields: DictionaryField[] = extractColumns
    ? extractColumns.map((c) => fieldByCode.get(c.code)).filter((f): f is DictionaryField => !!f)
    : dictionary.fields
  if (section) fields = fields.filter((f) => f.section === section)
  if (terms.length) {
    fields = fields.filter((f) => matches(`${f.code} ${f.label} ${f.hcaiLabel} ${f.summary}`.toLowerCase()))
  }
  const rows = fields.map((f) => ({ field: f, values: valuesFor(f) }))
  if (sort === "change" && facilityData && !extract) {
    rows.sort((a, b) => Math.abs(b.values?.change ?? -1) - Math.abs(a.values?.change ?? -1))
  }
  const bigMoves = rows.filter((r) => r.values?.change != null && Math.abs(r.values.change) >= BIG_CHANGE).length

  const metrics = extract
    ? []
    : dictionary.metrics.filter(
        (m) => !section && (!terms.length || matches(`${m.id} ${m.label} ${m.summary} ${m.formula}`.toLowerCase()))
      )

  function toggle(code: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const grouped = sort === "hcai" || !facilityData || !!extract
  const groups = grouped
    ? dictionary.sections
        .map((s) => ({ section: s, rows: rows.filter((r) => r.field.section === s.id) }))
        .filter((g) => g.rows.length)
    : [{ section: null, rows }]
  // Keep extract column order when translating an upload.
  if (extract && grouped) groups.sort((a, b) => rows.indexOf(a.rows[0]) - rows.indexOf(b.rows[0]))

  const compareLabel = prevYear != null && activeYear != null ? `from ${prevYear} to ${activeYear}` : undefined
  const facilityName = facilities.find((f) => f.id === facilityId)?.name
  const campuses = activeYear != null ? (facilityData?.meta[activeYear]?.campuses ?? []) : []

  return (
    <div className="space-y-6">
      <Segmented
        label="Which HCAI dataset"
        value={source}
        onChange={(slug) => router.push(`/translate?${new URLSearchParams({ source: slug, ...(facilityId ? { facility: facilityId } : {}) })}`, { scroll: false })}
        options={(["hafd-selected", "hau"] as const).map((d) => ({ value: DATASET_SLUG[d], label: DATASETS[d].shortLabel }))}
      />

      {/* Search + value source */}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex h-11 min-w-0 items-center gap-2.5 rounded-xl bg-card px-3.5 shadow-card ring-1 ring-black/5 focus-within:ring-2 focus-within:ring-ring dark:ring-white/10">
          <Search className="size-4 shrink-0 text-tertiary-foreground" aria-hidden />
          <span className="sr-only">Search fields</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              dataset === "hau"
                ? "Search a field: ER_TRAFFIC_TOT, ICU days, diversion…"
                : "Search a field: NETRV_MCAL_MC, charity care, staffed beds…"
            }
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="text-tertiary-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          )}
        </label>
        {!extract && (
          <div className="flex min-w-0 items-center gap-2">
            <FacilityPicker
              facilities={facilities}
              value={facilityId}
              onChange={(id) => void selectFacility(id)}
              latestYear={latestYear}
            />
            {facilityId && (
              <button
                type="button"
                onClick={() => void selectFacility(null)}
                aria-label="Stop showing hospital values"
                className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-card text-muted-foreground shadow-card ring-1 ring-black/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:ring-white/10"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterPill
          label="Section"
          summary={section ? (sections.get(section)?.title ?? null) : null}
          options={[{ value: "__all", label: "All sections" }, ...dictionary.sections.map((s) => ({ value: s.id, label: s.title }))]}
          selected={[section ?? "__all"]}
          onChange={([v]) => setSection(v === "__all" ? null : v)}
          searchable
        />
        {facilityData && !extract && years.length > 1 && (
          <>
            <FilterPill
              label="Year"
              summary={activeYear != null ? `${activeYear}${prevYear ? ` vs ${prevYear}` : ""}` : null}
              options={years.slice(1).reverse().map((y) => ({ value: String(y), label: `${y} vs ${years.filter((p) => p < y).at(-1)}` }))}
              selected={activeYear != null ? [String(activeYear)] : []}
              active={year != null && year !== years.at(-1)}
              onChange={([v]) => setYear(Number(v))}
            />
            <FilterPill
              label="Order"
              summary={sort === "change" ? "Biggest changes first" : "HCAI order"}
              options={[
                { value: "hcai", label: "HCAI order" },
                { value: "change", label: "Biggest changes first" },
              ]}
              selected={[sort]}
              active={sort !== "hcai"}
              onChange={([v]) => setSort(v as SortMode)}
            />
          </>
        )}
        {!extract && !showExtractInput && (
          <button
            type="button"
            onClick={() => setShowExtractInput(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-card px-3 text-[13px] ring-1 ring-black/8 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:ring-white/12"
          >
            <FileUp className="size-3.5" /> Translate an extract
          </button>
        )}
        {loadingFacility && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
            <Loader2 className="size-3.5 animate-spin" /> Loading values
          </span>
        )}
      </div>

      {showExtractInput && !extract && (
        <ExtractInput
          onLoad={(e) => {
            setExtract(e)
            setExtractRow(0)
            setShowExtractInput(false)
            setSort("hcai")
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
          <Link href={`/translate?source=${otherSource.slug}`} className="font-medium text-primary hover:underline">
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
        <p className="text-[13px] text-muted-foreground">
          Showing {facilityName}&apos;s {activeYear} values
          {prevYear != null && <> and the change from {prevYear}</>}.{" "}
          {campuses.length > 0 && (
            <>
              Includes the {new Intl.ListFormat("en-US").format(campuses)} campus{campuses.length === 1 ? "" : "es"} on the
              same license.{" "}
            </>
          )}
          {bigMoves > 0 && (
            <>
              <span className="font-medium text-foreground">{bigMoves}</span> field{bigMoves === 1 ? "" : "s"} moved by 20% or more.
            </>
          )}
          {facilityData.meta[activeYear]?.annualized && " This year was annualized from a partial-year report."}
        </p>
      )}

      {/* Benchmark metrics share this dictionary; list them first. */}
      {metrics.length > 0 && <MetricsList metrics={metrics} expanded={expanded} onToggle={toggle} />}

      {groups.map(({ section: s, rows: groupRows }) => (
        <section key={s?.id ?? "all"} aria-labelledby={s ? `section-${s.id}` : undefined} className="space-y-2">
          {s && (
            <div className="px-1">
              <h2 id={`section-${s.id}`} className="text-[13px] font-semibold tracking-tight">
                {s.title}
              </h2>
              <p className="text-xs text-muted-foreground">{s.summary}</p>
            </div>
          )}
          <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-card shadow-card">
            {groupRows.map(({ field, values }) => (
              <FieldRow
                key={field.code}
                field={field}
                section={sections.get(field.section)}
                values={values}
                expanded={expanded.has(field.code)}
                onToggle={() => toggle(field.code)}
                compareLabel={compareLabel}
              />
            ))}
          </ul>
        </section>
      ))}

      {rows.length === 0 && metrics.length === 0 && (
        <div className="rounded-2xl bg-card p-10 text-center shadow-card">
          <p className="font-medium">No fields match “{query}”.</p>
          <p className="mt-1 text-sm text-muted-foreground">Try a field code like CASH, or a plain word like “charity”.</p>
        </div>
      )}

      {unknownColumns.length > 0 && (
        <section className="rounded-2xl bg-card p-5 shadow-card">
          <h2 className="text-[13px] font-semibold">Columns not in this dictionary ({unknownColumns.length})</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            These may come from a different HCAI dataset (like the Quarterly or complete Annual Disclosure file), which
            this app doesn&apos;t cover yet.
          </p>
          <p className="mt-3 font-mono text-xs leading-relaxed text-muted-foreground">
            {unknownColumns.map((c) => c.header).join(" · ")}
          </p>
        </section>
      )}
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
    <section className="fade-up flex flex-col gap-3 rounded-2xl bg-card p-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
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
            className="h-8 rounded-full bg-primary/10 px-3 text-[13px] font-medium text-primary hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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

function MetricsList({
  metrics,
  expanded,
  onToggle,
}: {
  metrics: DictionaryMetric[]
  expanded: Set<string>
  onToggle: (id: string) => void
}) {
  return (
    <section aria-labelledby="section-metrics" className="space-y-2">
      <div className="px-1">
        <h2 id="section-metrics" className="text-[13px] font-semibold tracking-tight">
          Benchmark metrics
        </h2>
        <p className="text-xs text-muted-foreground">The ratios on the Benchmark tab, and how each is calculated from HCAI fields.</p>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-card shadow-card">
        {metrics.map((m) => {
          const open = expanded.has(m.id)
          return (
            <li key={m.id} id={`field-${m.id}`} className="scroll-mt-24">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => onToggle(m.id)}
                className={cn(
                  "grid w-full grid-cols-[1fr_auto] items-start gap-4 px-4 py-3.5 text-left transition-colors duration-150 sm:px-5",
                  "hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
                  open && "bg-muted/40"
                )}
              >
                <span>
                  <span className="block text-[15px] font-medium">{m.label}</span>
                  <span className="mt-0.5 block text-[13px] leading-relaxed text-muted-foreground">{m.summary}</span>
                </span>
                <ChevronRight className={cn("mt-1 size-4 text-tertiary-foreground transition-transform duration-200", open && "rotate-90")} />
              </button>
              {open && (
                <div className="fade-up grid gap-5 bg-muted/40 px-4 pt-1 pb-5 sm:grid-cols-2 sm:px-5">
                  <div className="space-y-3">
                    <p className="rounded-lg bg-card px-3 py-2 font-mono text-xs leading-relaxed ring-1 ring-border">{m.formula}</p>
                    {m.caution && <p className="text-[13px] leading-relaxed text-muted-foreground">{m.caution}</p>}
                  </div>
                  <div>
                    <p className="text-[13px] font-medium">Why this number moves</p>
                    <ul className="mt-2 space-y-2">
                      {m.drivers.map((d) => (
                        <li key={d} className="flex gap-2.5 text-[13px] leading-relaxed text-muted-foreground">
                          <span className="mt-2 size-1 shrink-0 rounded-full bg-tertiary-foreground" aria-hidden />
                          {d}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
