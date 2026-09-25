"use client"

import { Check, Download, Link2, Loader2, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { MetricInfo } from "@/components/benchmark/metric-info"
import { FacilityPicker, type FacilityOption } from "@/components/benchmark/facility-picker"
import { FilterPill } from "@/components/benchmark/filter-pill"
import { Segmented } from "@/components/shell/segmented"
import { CATEGORIES, type MetricDef } from "@/lib/data/datasets"
import { formatMetric } from "@/lib/format"
import {
  chartAllowed,
  MAX_COMPARE,
  MAX_METRICS,
  specToParams,
  type ChartKind,
  type GroupBy,
  type ReportResult,
  type ReportSpec,
} from "@/lib/report/spec"
import { rememberSelection } from "@/lib/selection"
import { cn } from "@/lib/utils"
import { ReportChart, ReportLegend, ReportTable } from "./report-chart"

const GROUP_HELP: Record<GroupBy, string> = {
  year: "A trend for this hospital, with any hospitals you add and the peer median.",
  facility: "Hospitals side by side for one year, ranked.",
  peerGroup: "This hospital against its peer group’s median and middle 50%.",
}

export function BuildView({
  facilities,
  catalog,
  years,
  latestYear,
  initialSpec,
  initialResult,
}: {
  facilities: FacilityOption[]
  /** Trend metrics only. */
  catalog: MetricDef[]
  years: number[]
  latestYear: number
  initialSpec: ReportSpec
  initialResult: ReportResult | null
}) {
  const [spec, setSpec] = useState(initialSpec)
  const [result, setResult] = useState(initialResult)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const request = useRef<AbortController | null>(null)
  const byId = new Map(catalog.map((m) => [m.id, m]))
  const facilityById = new Map(facilities.map((f) => [f.id, f]))

  useEffect(() => {
    if (spec.facilityId) rememberSelection({ facilityId: spec.facilityId })
  }, [spec.facilityId])

  async function update(patch: Partial<ReportSpec>) {
    const next = { ...spec, ...patch }
    if (!chartAllowed(next.chart, next.groupBy)) next.chart = "bar"
    next.compare = next.compare.filter((id) => id !== next.facilityId)
    setSpec(next)
    const params = specToParams(next)
    window.history.replaceState(null, "", `/build?${params}`)
    if (!next.facilityId || !next.metrics.length) {
      setResult(null)
      return
    }
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/report?${params}`, { signal: controller.signal })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? res.statusText)
      setResult((await res.json()) as ReportResult)
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("Couldn’t build that report. Try again in a moment.")
    } finally {
      if (request.current === controller) setLoading(false)
    }
  }

  function toggleMetric(id: string) {
    const on = spec.metrics.includes(id)
    if (!on && spec.metrics.length >= MAX_METRICS) return
    void update({ metrics: on ? spec.metrics.filter((m) => m !== id) : [...spec.metrics, id] })
  }

  const showCompare = spec.groupBy === "year" || (spec.groupBy === "facility" && spec.hospitals === "picked")
  const showYear = spec.groupBy === "facility" || (spec.groupBy === "peerGroup" && spec.chart === "bar")
  const showPeers = !(spec.groupBy === "facility" && spec.hospitals === "picked")
  const current = result

  function downloadCsv() {
    if (!result) return
    const lines: string[][] = [["Metric", "Row", "Series", "Value"]]
    for (const panel of result.panels) {
      const metric = byId.get(panel.metricId)!
      for (const row of panel.rows) {
        if (panel.rowKind === "year") {
          for (const s of panel.series) lines.push([metric.label, row.label, s.label, csvNumber(row[s.key])])
          if ("p25" in row) {
            lines.push([metric.label, row.label, "Peer 25th percentile", csvNumber(row.p25)])
            lines.push([metric.label, row.label, "Peer 75th percentile", csvNumber(row.p75)])
          }
        } else {
          lines.push([metric.label, row.label, panel.year != null ? String(panel.year) : "", csvNumber(row.value)])
        }
      }
    }
    const csv = lines.map((l) => l.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `${result.title.replace(/[^\w]+/g, "-").toLowerCase()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard blocked; the URL bar still has the link.
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)]">
      {/* Controls */}
      <div className="space-y-6 lg:sticky lg:top-8 lg:self-start">
        <Field label="Hospital">
          <FacilityPicker facilities={facilities} value={spec.facilityId} onChange={(id) => update({ facilityId: id })} latestYear={latestYear} />
        </Field>

        <Field label="Metrics" hint={`Up to ${MAX_METRICS}; each gets its own chart.`}>
          <div className="space-y-3">
            {CATEGORIES.map((c) => (
              <div key={c.id} className="space-y-1.5">
                <p className="text-[11px] font-medium tracking-wide text-tertiary-foreground uppercase">{c.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {catalog
                    .filter((m) => m.category === c.id)
                    .map((m) => {
                      const on = spec.metrics.includes(m.id)
                      const full = !on && spec.metrics.length >= MAX_METRICS
                      return (
                        <button
                          key={m.id}
                          type="button"
                          aria-pressed={on}
                          disabled={full}
                          onClick={() => toggleMetric(m.id)}
                          className={cn(
                            "chip inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] ring-1 transition-colors duration-150",
                            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40",
                            on
                              ? "is-on bg-primary/10 text-primary ring-primary/25 dark:bg-primary/20"
                              : "bg-card text-muted-foreground ring-black/8 hover:bg-muted hover:text-foreground dark:ring-white/12"
                          )}
                        >
                          {on && <Check className="size-3" />}
                          {m.label}
                        </button>
                      )
                    })}
                </div>
              </div>
            ))}
          </div>
        </Field>

        <Field label="Group by" hint={GROUP_HELP[spec.groupBy]}>
          <Segmented
            label="Group by"
            size="sm"
            value={spec.groupBy}
            onChange={(groupBy) => update({ groupBy })}
            options={[
              { value: "year", label: "Year" },
              { value: "facility", label: "Hospital" },
              { value: "peerGroup", label: "Peer group" },
            ]}
          />
        </Field>

        <Field label="Show as">
          <Segmented
            label="Chart type"
            size="sm"
            value={spec.chart}
            onChange={(chart: ChartKind) => update({ chart })}
            options={[
              ...(chartAllowed("line", spec.groupBy) ? [{ value: "line" as const, label: "Line" }] : []),
              { value: "bar", label: "Bar" },
              { value: "table", label: "Table" },
            ]}
          />
        </Field>

        {spec.groupBy === "facility" && (
          <Field label="Hospitals">
            <Segmented
              label="Which hospitals"
              size="sm"
              value={spec.hospitals}
              onChange={(hospitals) => update({ hospitals })}
              options={[
                { value: "peers", label: "Its peer group" },
                { value: "picked", label: "Pick them" },
              ]}
            />
          </Field>
        )}

        {showPeers && (
          <Field label="Peer group">
            <Segmented
              label="Peer group"
              size="sm"
              value={spec.peers}
              onChange={(peers) => update({ peers })}
              options={[
                { value: "similar", label: "Similar hospitals" },
                { value: "statewide", label: "All of California" },
              ]}
            />
          </Field>
        )}

        {showCompare && (
          <Field label="Compare with" hint={`Up to ${MAX_COMPARE} more hospitals.`}>
            <div className="space-y-2">
              {spec.compare.map((id) => (
                <div key={id} className="flex h-9 items-center gap-2 rounded-lg bg-card px-3 text-[13px] ring-1 ring-black/5 dark:ring-white/10">
                  <span className="flex-1 truncate">{facilityById.get(id)?.name ?? id}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${facilityById.get(id)?.name ?? id}`}
                    onClick={() => update({ compare: spec.compare.filter((c) => c !== id) })}
                    className="text-tertiary-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
              {spec.compare.length < MAX_COMPARE && (
                <FacilityPicker
                  key={spec.compare.join(",")}
                  facilities={facilities.filter((f) => f.id !== spec.facilityId && !spec.compare.includes(f.id))}
                  value={null}
                  onChange={(id) => update({ compare: [...spec.compare, id] })}
                  latestYear={latestYear}
                  placeholder="Add a hospital"
                  className="h-9 text-[13px]"
                />
              )}
            </div>
          </Field>
        )}

        {showYear && (
          <Field label="Year">
            <FilterPill
              label="Year"
              summary={spec.year != null ? String(spec.year) : "Latest"}
              active={spec.year != null}
              options={[{ value: "latest", label: "Latest reported" }, ...[...years].reverse().map((y) => ({ value: String(y), label: String(y) }))]}
              selected={[spec.year != null ? String(spec.year) : "latest"]}
              onChange={([v]) => update({ year: v === "latest" ? null : Number(v) })}
            />
          </Field>
        )}
      </div>

      {/* Result */}
      <div className="min-w-0 space-y-5">
        {error && (
          <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}
        {!spec.facilityId || !spec.metrics.length ? (
          <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center">
            <p className="text-lg font-semibold tracking-tight">
              {!spec.facilityId ? "Choose a hospital to start." : "Choose one or more metrics."}
            </p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Pick from the metrics on the left, then how to group them. Every chart has a table view and can be downloaded
              as CSV.
            </p>
          </div>
        ) : current ? (
          <div className={cn("space-y-5 transition-opacity duration-200", loading && "opacity-60")}>
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <h2 className="text-2xl font-semibold tracking-tight">{current.title}</h2>
                <p className="text-sm text-muted-foreground">
                  {current.subtitle}
                  {current.peerGroup &&
                    ` · peer group: ${current.peerGroup.count} ${current.spec.peers === "similar" ? "similar hospitals" : "hospitals statewide"}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Updating" />}
                <ActionButton onClick={copyLink} icon={copied ? Check : Link2}>
                  {copied ? "Copied" : "Copy link"}
                </ActionButton>
                <ActionButton onClick={downloadCsv} icon={Download}>
                  CSV
                </ActionButton>
              </div>
            </header>
            {current.peerGroup && (
              <p className="-mt-2 text-xs text-muted-foreground">Peer group: {current.peerGroup.description}.</p>
            )}
            <div className={cn("grid gap-4", current.panels.length > 1 && current.panels[0].rowKind === "year" && "xl:grid-cols-2")}>
              {current.panels.map((panel) => {
                const metric = byId.get(panel.metricId)
                if (!metric) return null
                const focusValue = panel.rows.find((r) => r.role === "focus")?.value
                return (
                  <section key={panel.metricId} aria-label={metric.label} className="fade-up min-w-0 rounded-2xl bg-card p-5 shadow-card">
                    <header className="mb-3 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-[15px] font-semibold tracking-tight">{metric.label}</h3>
                        <MetricInfo metric={metric} />
                        {panel.year != null && <span className="text-xs text-tertiary-foreground">{panel.year}</span>}
                      </div>
                      {typeof focusValue === "number" && panel.rowKind === "facility" && (
                        <p className="text-[13px] text-muted-foreground">
                          {rankSentence(panel, metric, focusValue)}
                        </p>
                      )}
                      {current.spec.chart !== "table" && <ReportLegend panel={panel} />}
                    </header>
                    <ReportChart panel={panel} metric={metric} chart={current.spec.chart} />
                    {current.spec.chart !== "table" && (
                      <div className="sr-only">
                        <ReportTable panel={panel} metric={metric} />
                      </div>
                    )}
                    {panel.note && <p className="mt-3 text-xs text-tertiary-foreground">{panel.note}</p>}
                  </section>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="grid gap-4" aria-busy>
            <div className="h-8 w-72 animate-pulse rounded-lg bg-muted" />
            <div className="h-80 animate-pulse rounded-2xl bg-card shadow-card" />
          </div>
        )}
      </div>
    </div>
  )
}

function rankSentence(panel: ReportResult["panels"][number], metric: MetricDef, value: number) {
  const ranked = panel.rows.filter((r) => typeof r.value === "number")
  const rank = ranked.findIndex((r) => r.role === "focus") + 1
  return `${formatMetric(metric, value)} — ${rank === 1 ? "highest" : rank === ranked.length ? "lowest" : `${ordinalWord(rank)} highest`} of ${ranked.length}.`
}

function ordinalWord(n: number) {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

const csvNumber = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? String(v) : "")

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-medium">{label}</p>
      {children}
      {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  )
}

function ActionButton({
  onClick,
  icon: Icon,
  children,
}: {
  onClick: () => void
  icon: typeof Download
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-full bg-card px-3 text-[13px] ring-1 ring-black/8 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:ring-white/12"
    >
      <Icon className="size-3.5" />
      {children}
    </button>
  )
}
