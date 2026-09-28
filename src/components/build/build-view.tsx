"use client"

import { Check, Download, Link2, Loader2, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { MetricInfo } from "@/components/benchmark/metric-info"
import { FacilityPicker, type FacilityOption } from "@/components/benchmark/facility-picker"
import { ContextBar, type PeriodControl } from "@/components/shell/context-bar"
import { GroupedPicker } from "@/components/shell/grouped-picker"
import { LiveStatus } from "@/components/shell/live-status"
import { Segmented } from "@/components/shell/segmented"
import { StandingBadge } from "@/components/shell/standing"
import { StatusLine, type StatusLineProps } from "@/components/shell/status-line"
import { filtersToParams } from "@/lib/benchmark/filters"
import { DATASETS, type MetricDef } from "@/lib/data/datasets"
import type { SourceStatus } from "@/lib/data/freshness"
import { directionOf, metricStanding } from "@/lib/favorability"
import { CONTEXT_REASONS } from "@/lib/favorability/directions"
import { metricPickerOptions } from "@/lib/data/metric-options"
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
import { useDisplayMode } from "@/lib/display-mode"
import { rememberSelection } from "@/lib/selection"
import type { QualityFlag } from "@/lib/status"
import { cn } from "@/lib/utils"
import { ReportChart, ReportLegend, ReportTable } from "./report-chart"

/** Guided mode's plainer names for the groupings; the same three. */
const GROUP_LABEL_GUIDED: Record<GroupBy, string> = { year: "Over time", facility: "Ranked", peerGroup: "Against peers" }

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
  const peersKey = filtersToParams(spec.peers).toString()
  useEffect(() => {
    rememberSelection({ peers: peersKey })
  }, [peersKey])
  const guided = useDisplayMode() === "guided"

  async function update(patch: Partial<ReportSpec>) {
    const next = { ...spec, ...patch }
    if (!chartAllowed(next.chart, next.groupBy)) next.chart = "bar"
    next.compare = next.compare.filter((id) => id !== next.facilityId)
    setSpec(next)
    const params = specToParams(next)
    window.history.replaceState(null, "", `/reports/build?${params}`)
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

  const firstPanel = current?.panels.find((p) => byId.has(p.metricId))
  const barStatus = firstPanel && current ? panelStatus(firstPanel, byId.get(firstPanel.metricId)!, current.sources[byId.get(firstPanel.metricId)!.dataset], current.panels.length > 1) : null
  const period: PeriodControl = showYear
    ? {
        kind: "pick",
        label: "Year",
        summary: spec.year != null ? String(spec.year) : "Latest year",
        options: [{ value: "latest", label: "Latest reported" }, ...[...years].reverse().map((y) => ({ value: String(y), label: String(y) }))],
        selected: spec.year != null ? String(spec.year) : "latest",
        onChange: (v) => update({ year: v === "latest" ? null : Number(v) }),
      }
    : { kind: "text", text: `All years, ${years[0]}–${years.at(-1)}` }

  return (
    <div className="space-y-6">
    <ContextBar
      facilities={facilities}
      facilityId={spec.facilityId}
      onFacility={(id) => update({ facilityId: id })}
      latestYear={latestYear}
      period={spec.facilityId ? period : null}
      peers={
        showPeers
          ? {
              filters: spec.peers,
              applied: current?.peerGroup?.filters ?? null,
              count: current?.peerGroup?.count ?? null,
              description: current?.peerGroup?.description ?? null,
              note: current?.peerGroup?.note ?? null,
              onChange: (peers) => update({ peers }),
            }
          : null
      }
      status={barStatus}
      modeToggle
    />
    <div className="grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <LiveStatus
        message={
          loading
            ? `Building the report for ${facilityById.get(spec.facilityId ?? "")?.name ?? "the hospital"}…`
            : error
              ? error
              : current
                ? `${current.title}: ${current.panels.length} chart${current.panels.length === 1 ? "" : "s"} for ${current.subtitle}.`
                : ""
        }
      />
      {/* Controls */}
      <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
        <Field label="Metrics" hint={`Up to ${MAX_METRICS}; each gets its own chart.`}>
          <div className="glass rounded-2xl p-1.5">
            <GroupedPicker
              noun="metrics"
              options={metricPickerOptions(catalog, { acrossCategories: true })}
              selected={spec.metrics}
              onChange={(metrics) => update({ metrics: metrics.slice(0, MAX_METRICS) })}
              multiple
              max={MAX_METRICS}
            />
          </div>
        </Field>

        <Field label="Group by" hint={GROUP_HELP[spec.groupBy]}>
          <Segmented
            label="Group by"
            size="sm"
            value={spec.groupBy}
            onChange={(groupBy) => update({ groupBy })}
            options={(["year", "facility", "peerGroup"] as const).map((value) => ({
              value,
              label: guided ? GROUP_LABEL_GUIDED[value] : { year: "Year", facility: "Hospital", peerGroup: "Peer group" }[value],
            }))}
          />
        </Field>

        {!guided && (
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
        )}

        {spec.groupBy === "facility" && !guided && (
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

        {showCompare && !guided && (
          <Field label="Hospitals side by side" hint={`Up to ${MAX_COMPARE} more hospitals.`}>
            <div className="space-y-2">
              {spec.compare.map((id) => (
                <div key={id} className="glass-subtle flex h-9 items-center gap-2 rounded-lg px-3 text-[13px]">
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

      </div>

      {/* Result */}
      <div className="min-w-0 space-y-5">
        <div className="-mb-3 h-0.5" aria-hidden>
          {loading && <div className="loading-bar fade-up" />}
        </div>
        {error && (
          <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}
        {!spec.facilityId || !spec.metrics.length ? (
          <div className="glass rounded-2xl px-6 py-16 text-center">
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
                  {current.peerGroup && ` · peer group: ${current.peerGroup.count} hospitals`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
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
                  <section key={panel.metricId} aria-label={metric.label} className="glass fade-up min-w-0 rounded-2xl p-5">
                    <header className="mb-3 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-[15px] font-semibold tracking-tight">{metric.label}</h3>
                        <MetricInfo metric={metric} />
                        {panel.year != null && <span className="text-xs text-tertiary-foreground">{panel.year}</span>}
                      </div>
                      {typeof focusValue === "number" && panel.rowKind === "facility" && (
                        <RankLine panel={panel} metric={metric} value={focusValue} />
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
                    <PanelStatus panel={panel} metric={metric} source={current.sources[metric.dataset]} />
                  </section>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="grid gap-4" aria-busy>
            <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Building the report for {facilityById.get(spec.facilityId ?? "")?.name ?? "the hospital"}…
            </p>
            <div className="h-8 w-72 animate-pulse rounded-lg bg-muted" />
            <div className="glass h-80 animate-pulse rounded-2xl" />
          </div>
        )}
      </div>
    </div>
    </div>
  )
}

/** The standing label first (lib/favorability), then the rank among the hospitals charted as its evidence. */
function RankLine({ panel, metric, value }: { panel: ReportResult["panels"][number]; metric: MetricDef; value: number }) {
  const ranked = panel.rows.filter((r) => typeof r.value === "number")
  const rank = ranked.findIndex((r) => r.role === "focus") + 1
  const others = ranked.filter((r) => r.role !== "focus").map((r) => r.value as number)
  const below = others.filter((v) => v < value).length + others.filter((v) => v === value).length / 2
  const s = metricStanding(metric.id, others.length ? below / others.length : null, others.length)
  // Counted from the end the value is nearer, for a metric with a favorable direction ("3rd lowest", not "10th highest"
  // of 12), as rankText words percentiles; a context metric keeps counting from the top.
  const fromBottom = ranked.length - rank + 1
  const position = directionOf(metric.id) !== "context" && fromBottom < rank ? `${ordinalWord(fromBottom)} lowest` : `${ordinalWord(rank)} highest`
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {s && <StandingBadge standing={s} title={s === "depends" ? CONTEXT_REASONS[metric.id] : undefined} />}
      <p className="text-[13px] text-muted-foreground">
        {formatMetric(metric, value)} — {rank === 1 ? "highest" : rank === ranked.length ? "lowest" : position} of{" "}
        {ranked.length} hospitals charted.
      </p>
    </div>
  )
}

function panelStatus(panel: ReportResult["panels"][number], metric: MetricDef, source: SourceStatus | undefined, several = false): StatusLineProps {
  const published = panel.through != null ? source?.published[panel.through] : null
  const flags: QualityFlag[] = []
  if (panel.through == null) flags.push("unavailable")
  else if (panel.latestYear != null && panel.year == null && panel.through < panel.latestYear) flags.push("stale")
  if (panel.through != null && source?.provisional.includes(panel.through)) flags.push("provisional")
  if (source?.matched) flags.push("matched-record")
  return {
    through: panel.through != null ? String(panel.through) : null,
    periodType: DATASETS[metric.dataset].periodType,
    published: published ? `Published ${published}` : source?.sourceUpdated ? `Source updated ${source.sourceUpdated}` : null,
    processed: source ? `Processed ${source.processed}` : null,
    note: several ? `Shown for ${metric.label}; each chart has its own status line.` : null,
    flags,
    flagDetail: {
      stale: panel.through != null ? `This hospital's latest value is from ${panel.through}; the source has ${panel.latestYear}.` : undefined,
      "matched-record": source?.matched ?? undefined,
    },
  }
}

function PanelStatus({ panel, metric, source }: { panel: ReportResult["panels"][number]; metric: MetricDef; source?: SourceStatus }) {
  return <StatusLine className="mt-3 border-t border-border pt-2.5" {...panelStatus(panel, metric, source)} />
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
      className="glass-subtle inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors hover:bg-white/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:hover:bg-white/10"
    >
      <Icon className="size-3.5" />
      {children}
    </button>
  )
}
