"use client"

import { Check, Download, Link2, Loader2, Printer, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { MetricInfo } from "@/components/benchmark/metric-info"
import { FacilityPicker, type FacilityOption } from "@/components/benchmark/facility-picker"
import { ContextBar, type PeriodControl } from "@/components/shell/context-bar"
import { GroupedPicker } from "@/components/shell/grouped-picker"
import { GroupByChooser } from "./group-sketch"
import { LiveStatus } from "@/components/shell/live-status"
import { Segmented } from "@/components/shell/segmented"
import { StandingBadge, TrendText } from "@/components/shell/standing"
import { StatusLine, type StatusLineProps } from "@/components/shell/status-line"
import { filtersToParams } from "@/lib/benchmark/filters"
import { DATASETS, type MetricDef } from "@/lib/data/datasets"
import type { SourceStatus } from "@/lib/data/freshness"
import { CONTEXT_REASONS } from "@/lib/favorability/directions"
import { metricPickerOptions } from "@/lib/data/metric-options"
import { formatMetric } from "@/lib/format"
import {
  chartAllowed,
  isOverTime,
  MAX_COMPARE,
  MAX_METRICS,
  specToParams,
  type ChartKind,
  type GroupBy,
  type ReportResult,
  type ReportSpec,
} from "@/lib/report/spec"
import { latestChange, panelCommentary, rankOf } from "@/lib/report/commentary"
import { applyTemplate, matchingTemplate, REPORT_TEMPLATES, TEMPLATE_BY_ID, type ReportTemplateId } from "@/lib/report/templates"
import { useDisplayMode } from "@/lib/display-mode"
import { rememberSelection } from "@/lib/selection"
import type { QualityFlag } from "@/lib/status"
import { cn } from "@/lib/utils"
import { ReportChart, ReportLegend, ReportTable } from "./report-chart"

/** Guided mode's plainer names for the groupings; the same three. */
const GROUP_LABEL_GUIDED: Record<GroupBy, string> = { year: "Over time", facility: "Ranked", peerGroup: "Against peers" }

const GROUP_LABEL: Record<GroupBy, string> = { year: "Year", facility: "Hospital", peerGroup: "Peer group" }

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

  const validIds = new Set(catalog.map((m) => m.id))
  const activeTemplate = matchingTemplate(spec)
  const overTime = isOverTime(spec)
  function pickTemplate(id: ReportTemplateId) {
    void update(applyTemplate(spec, TEMPLATE_BY_ID[id], validIds))
  }

  const showCompare = spec.groupBy === "year" || (spec.groupBy === "facility" && spec.hospitals === "picked")
  const showPeers = !(spec.groupBy === "facility" && spec.hospitals === "picked")
  const current = result
  const focusName = facilityById.get(current?.spec.facilityId ?? "")?.name ?? "The hospital"

  function downloadCsv() {
    if (!result) return
    // The fifth column carries each chart's one-line summary, on its first row.
    const lines: string[][] = [["Metric", "Row", "Series", "Value", "Summary"]]
    const focusName = facilityById.get(result.spec.facilityId ?? "")?.name ?? "The hospital"
    for (const panel of result.panels) {
      const metric = byId.get(panel.metricId)
      if (!metric) continue
      const first = lines.length
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
      const summary = panelCommentary(panel, metric, focusName)
      if (lines.length > first) lines[first] = [...lines[first], summary]
      else lines.push([metric.label, "", "", "", summary])
    }
    const csv = lines.map((l) => l.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `${result.title.replace(/[^\w]+/g, "-").toLowerCase()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function printReport() {
    window.print()
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
  // The period is set under Time period (V7.5); the bar above just says what it is.
  const period: PeriodControl = {
    kind: "text",
    text: overTime
      ? spec.last != null
        ? `Latest ${spec.last} years of each measure`
        : `All years, ${years[0]}–${years.at(-1)}`
      : spec.year != null
        ? String(spec.year)
        : "Latest reported year",
  }

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
    <div className="grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)] print:block">
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
      {/* Settings: what's in the report, what it's compared with, over what period, and how it comes out (V7.5). */}
      <div className="space-y-7 print:hidden">
        <SettingsGroup title="Content">
          <Field label="Start from" hint={activeTemplate ? TEMPLATE_BY_ID[activeTemplate].purpose : "Your own settings. Pick a starting point to replace them."}>
            <TemplateChooser active={activeTemplate} onPick={pickTemplate} />
          </Field>
          <Field label="Measures" hint={`Up to ${MAX_METRICS}; each gets its own chart. Groups stay closed until you open one — or search to go straight to a measure.`}>
            <div className="glass rounded-2xl p-1.5">
              <GroupedPicker
                noun="measures"
                options={metricPickerOptions(catalog, { acrossCategories: true })}
                selected={spec.metrics}
                onChange={(metrics) => update({ metrics: metrics.slice(0, MAX_METRICS) })}
                multiple
                max={MAX_METRICS}
              />
            </div>
          </Field>
        </SettingsGroup>

        <SettingsGroup title="Comparison">
          <Field label="Compare by">
            <GroupByChooser
              value={spec.groupBy}
              chart={spec.chart}
              onChange={(groupBy) => update({ groupBy })}
              choices={(["year", "facility", "peerGroup"] as const).map((value) => ({
                value,
                label: guided ? GROUP_LABEL_GUIDED[value] : GROUP_LABEL[value],
                description: GROUP_HELP[value],
              }))}
            />
          </Field>

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

          {showPeers && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {current?.peerGroup
                ? `Peer group: ${current.peerGroup.count} hospitals, ${current.peerGroup.description.charAt(0).toLowerCase()}${current.peerGroup.description.slice(1)}. Change it in the bar above.`
                : "The peer group is set in the bar above."}
            </p>
          )}
        </SettingsGroup>

        <SettingsGroup title="Time period">
          {overTime ? (
            <Field label="Years" hint="Counted back from each measure’s own latest year, since measures end in different years.">
              <Segmented
                label="Years shown"
                size="sm"
                value={spec.last == null ? "all" : String(spec.last)}
                onChange={(v) => update({ last: v === "all" ? null : Number(v) })}
                options={[
                  { value: "3", label: "Latest 3" },
                  { value: "5", label: "Latest 5" },
                  { value: "all", label: `All (${years[0]}–)` },
                ]}
              />
            </Field>
          ) : (
            <Field label="Year" hint="One year, side by side. “Latest reported” is each measure’s newest year for this hospital.">
              <select
                aria-label="Year shown"
                value={spec.year != null ? String(spec.year) : "latest"}
                onChange={(e) => update({ year: e.target.value === "latest" ? null : Number(e.target.value) })}
                className="glass-subtle h-9 w-full rounded-lg px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="latest">Latest reported</option>
                {[...years].reverse().map((y) => (
                  <option key={y} value={String(y)}>
                    {y}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </SettingsGroup>

        <SettingsGroup title="Output">
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
          <Field label="Export" hint="The printout and the CSV include each chart’s summary line.">
            <div className="flex flex-wrap gap-2">
              <ActionButton onClick={printReport} icon={Printer} disabled={!current}>
                Print or save as PDF
              </ActionButton>
              <ActionButton onClick={downloadCsv} icon={Download} disabled={!current}>
                CSV
              </ActionButton>
              <ActionButton onClick={copyLink} icon={copied ? Check : Link2}>
                {copied ? "Copied" : "Copy link"}
              </ActionButton>
            </div>
          </Field>
        </SettingsGroup>
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
              {!spec.facilityId ? "Choose a hospital to start." : "Choose one or more measures."}
            </p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Start from a template under Content, or pick measures yourself, then what to compare them with. Every chart
              has a table view, a one-line summary, and can be printed or downloaded as CSV.
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
              {loading && <Loader2 className="size-4 animate-spin text-muted-foreground print:hidden" aria-hidden />}
            </header>
            {current.peerGroup && (
              <p className="-mt-2 text-xs text-muted-foreground">Peer group: {current.peerGroup.description}.</p>
            )}
            <p className="-mt-2 hidden text-xs text-muted-foreground print:block">
              {period.kind === "text" && `${period.text}. `}Prepared {new Date().toLocaleDateString("en-US", { dateStyle: "long" })} with Padua by Prisma from
              public HCAI, CMS and CDPH data; each chart&apos;s status line gives its source and dates.
            </p>
            <div className={cn("grid gap-4", current.panels.length > 1 && current.panels[0].rowKind === "year" && "xl:grid-cols-2")}>
              {current.panels.map((panel) => {
                const metric = byId.get(panel.metricId)
                if (!metric) return null
                const focusValue = panel.rows.find((r) => r.role === "focus")?.value
                const summary = panelCommentary(panel, metric, focusName)
                return (
                  <section key={panel.metricId} aria-label={metric.label} className="glass fade-up min-w-0 rounded-2xl p-5 print:break-inside-avoid">
                    <header className="mb-3 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-[15px] font-semibold tracking-tight">{metric.label}</h3>
                        <MetricInfo metric={metric} />
                        {panel.year != null && <span className="text-xs text-tertiary-foreground">{panel.year}</span>}
                      </div>
                      {/* On screen, the summary line with its standing or trend marker; printed, the same as a sentence. */}
                      <div className="print:hidden">
                        {typeof focusValue === "number" && panel.rowKind === "facility" && <RankLine panel={panel} metric={metric} />}
                        {panel.rowKind === "year" && <YearSummary panel={panel} metric={metric} />}
                      </div>
                      <p className={cn("text-[13px] leading-relaxed text-muted-foreground print:block print:text-foreground", panel.rowKind !== "stat" && "hidden")}>
                        {summary}
                      </p>
                      {current.spec.chart !== "table" && <ReportLegend panel={panel} chart={current.spec.chart} />}
                    </header>
                    <ReportChart panel={panel} metric={metric} chart={current.spec.chart} />
                    {current.spec.chart !== "table" && (
                      <div className="sr-only">
                        <ReportTable panel={panel} metric={metric} scroll={false} />
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
function RankLine({ panel, metric }: { panel: ReportResult["panels"][number]; metric: MetricDef }) {
  const r = rankOf(panel, metric.id)
  if (!r) return null
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {r.standing && <StandingBadge standing={r.standing} title={r.standing === "depends" ? CONTEXT_REASONS[metric.id] : undefined} />}
      <p className="text-[13px] text-muted-foreground">
        {formatMetric(metric, r.value)} — {r.position} of {r.count} hospitals charted.
      </p>
    </div>
  )
}

/**
 * A by-year chart in one line, for anyone who can't see it: the selected hospital's latest value, its change from the
 * year before in the cards' own words (lib/favorability trend: "Improving from 3.1% in 2023"), and the peer median.
 * The printout and CSV say the same as a sentence (lib/report/commentary).
 */
function YearSummary({ panel, metric }: { panel: ReportResult["panels"][number]; metric: MetricDef }) {
  const c = latestChange(panel, metric)
  if (!c) return null
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-muted-foreground">
      <span>
        {c.name}: <span className="num font-medium text-foreground">{formatMetric(metric, c.value)}</span> in {c.year}
      </span>
      {c.trend && c.prior && (
        <TrendText trend={c.trend} rising={c.value > c.prior.value}>
          from {formatMetric(metric, c.prior.value)} in {c.prior.year}
        </TrendText>
      )}
      {c.median != null && <span>· Peer median {formatMetric(metric, c.median)}</span>}
    </p>
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

const csvNumber = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? String(v) : "")

/** One of the four settings groups: Content, Comparison, Time period, Output. */
function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  const id = `settings-${title.toLowerCase().replace(/\W+/g, "-")}`
  return (
    <section aria-labelledby={id} className="space-y-4 border-t border-border pt-4 first:border-0 first:pt-0">
      <h2 id={id} className="text-xs font-semibold tracking-wide text-tertiary-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  )
}

/** Starting points (lib/report/templates): pressing one fills in the settings; the current match shows as pressed. */
function TemplateChooser({ active, onPick }: { active: ReportTemplateId | null; onPick: (id: ReportTemplateId) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Report templates">
      {REPORT_TEMPLATES.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-pressed={active === t.id}
          title={t.purpose}
          onClick={() => onPick(t.id)}
          className={cn(
            "inline-flex min-h-8 items-center rounded-full px-3 text-left text-[12px] font-medium transition-[background-color,box-shadow] duration-200",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            active === t.id ? "surface ring-accent glow-soft text-foreground" : "glass-subtle text-muted-foreground hover:text-foreground"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

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
  disabled,
}: {
  onClick: () => void
  icon: typeof Download
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="glass-subtle inline-flex h-8 disabled:pointer-events-none disabled:opacity-50 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors hover:bg-white/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:hover:bg-white/10"
    >
      <Icon className="size-3.5" />
      {children}
    </button>
  )
}
