"use client"

import { ArrowLeftRight, Check, Download, Link2, Loader2, TriangleAlert } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { FacilityPicker, type FacilityOption } from "@/components/benchmark/facility-picker"
import { FilterPill } from "@/components/benchmark/filter-pill"
import { MetricInfo } from "@/components/benchmark/metric-info"
import { PickerPill } from "@/components/shell/grouped-picker"
import { Segmented } from "@/components/shell/segmented"
import {
  correlateSpecToParams,
  describeR,
  lowerLabel,
  SMALL_SAMPLE,
  type CorrelateResult,
  type CorrelateSpec,
} from "@/lib/correlate/spec"
import { type MetricDef } from "@/lib/data/datasets"
import { metricPickerOptions } from "@/lib/data/metric-options"
import { rememberSelection } from "@/lib/selection"
import { cn } from "@/lib/utils"
import { ScatterPlot, ScatterTable } from "./scatter-plot"

export function CorrelateView({
  facilities,
  catalog,
  latestYear,
  initialSpec,
  initialResult,
  initialError,
}: {
  facilities: FacilityOption[]
  /** Trend metrics only (payer mix is a composition, not a number). */
  catalog: MetricDef[]
  latestYear: number
  initialSpec: CorrelateSpec
  initialResult: CorrelateResult | null
  initialError: string | null
}) {
  const [spec, setSpec] = useState(initialSpec)
  const [result, setResult] = useState(initialResult)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [view, setView] = useState<"chart" | "table">("chart")
  const [copied, setCopied] = useState(false)
  const request = useRef<AbortController | null>(null)
  const byId = new Map(catalog.map((m) => [m.id, m]))

  useEffect(() => {
    if (spec.facilityId) rememberSelection({ facilityId: spec.facilityId })
  }, [spec.facilityId])

  async function update(patch: Partial<CorrelateSpec>) {
    const next = { ...spec, ...patch }
    setSpec(next)
    const params = correlateSpecToParams(next)
    window.history.replaceState(null, "", `/correlate?${params}`)
    if (!next.facilityId) {
      setResult(null)
      return
    }
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/correlate?${params}`, { signal: controller.signal })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setResult(null)
        setError(body?.error ?? "Couldn’t compare those measures. Try again in a moment.")
        return
      }
      setResult(body as CorrelateResult)
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("Couldn’t compare those measures. Try again in a moment.")
    } finally {
      if (request.current === controller) setLoading(false)
    }
  }

  // Metrics grouped by topic, Medicare-lens versions in their own group.
  const metricOptions = (exclude: string) =>
    metricPickerOptions(
      catalog.filter((m) => m.id !== exclude),
      { acrossCategories: true }
    )
  const mx = byId.get(spec.x)
  const my = byId.get(spec.y)
  // While a new pair loads, the previous result stays up (dimmed), labeled by its own measures.
  const current = result
  const rx = current ? byId.get(current.spec.x) : undefined
  const ry = current ? byId.get(current.spec.y) : undefined
  const stats = current?.stats
  const small = current != null && current.points.length < SMALL_SAMPLE

  function downloadCsv() {
    if (!current || !rx || !ry) return
    const rows = [
      ["Hospital", "Year", rx.label, ry.label],
      ...current.points.map((p) => [p.name, String(current.year), String(p.x), String(p.y)]),
    ]
    const csv = rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `${rx.id}-vs-${ry.id}-${current.year}.csv`
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
    <div className="space-y-6">
      <div className="space-y-3">
        <FacilityPicker facilities={facilities} value={spec.facilityId} onChange={(id) => update({ facilityId: id, year: null })} latestYear={latestYear} />
        <div className="flex flex-wrap items-center gap-2">
          <PickerPill
            noun="measures"
            label="Across (horizontal)"
            summary={mx ? `Across: ${mx.label}` : null}
            active={false}
            options={metricOptions(spec.y)}
            selected={[spec.x]}
            onChange={([x]) => x && update({ x, year: null })}
            wide
          />
          <button
            type="button"
            aria-label="Swap the two measures"
            title="Swap axes"
            onClick={() => update({ x: spec.y, y: spec.x })}
            className="glass-subtle inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ArrowLeftRight className="size-3.5" />
          </button>
          <PickerPill
            noun="measures"
            label="Up (vertical)"
            summary={my ? `Up: ${my.label}` : null}
            active={false}
            options={metricOptions(spec.x)}
            selected={[spec.y]}
            onChange={([y]) => y && update({ y, year: null })}
            wide
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Peer group"
            value={spec.peers}
            onChange={(peers) => update({ peers, year: null })}
            options={[
              { value: "similar", label: "Similar hospitals" },
              { value: "statewide", label: "All of California" },
            ]}
          />
          {current && (
            <FilterPill
              label="Year"
              summary={spec.year != null ? String(current.year) : `Latest (${current.year})`}
              active={spec.year != null}
              options={[
                { value: "latest", label: "Latest with good coverage" },
                ...current.years.map((y) => ({ value: String(y.year), label: String(y.year), hint: `${y.n} hospitals` })),
              ]}
              selected={[spec.year != null ? String(spec.year) : "latest"]}
              onChange={([v]) => update({ year: v === "latest" ? null : Number(v) })}
            />
          )}
          {loading && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
              <Loader2 className="size-3.5 animate-spin" /> Updating
            </span>
          )}
        </div>
      </div>

      <div className="-my-3 h-0.5" aria-hidden>
        {loading && <div className="loading-bar fade-up" />}
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-black/4 px-4 py-3 text-sm text-muted-foreground dark:bg-white/6">
          {error} Try another pair of measures or widen the peer group.
        </p>
      )}

      {!spec.facilityId ? (
        <div className="glass rounded-2xl px-6 py-16 text-center">
          <p className="text-lg font-semibold tracking-tight">Choose a hospital to start.</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
            Its similar hospitals become the dots on the chart. Then pick the two measures you want to see side by side —
            for example case mix index against cost per adjusted discharge.
          </p>
        </div>
      ) : current && rx && ry ? (
        <div className={cn("space-y-4 transition-opacity duration-200", loading && "opacity-60")}>
          <div className="grid gap-4 lg:grid-cols-3">
            <section aria-label="Correlation" className="widget fade-up flex flex-col gap-1 p-5">
              <p className="text-[11px] font-medium tracking-wide text-tertiary-foreground uppercase">Correlation · {current.year}</p>
              {stats ? (
                <>
                  <p className="num text-[40px] leading-none font-semibold tracking-tight">
                    r = {fmtR(stats.r)}
                  </p>
                  <p className="text-[13px] font-medium">{describeR(stats.r)}</p>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    Across {stats.n} hospitals. Rank correlation ρ = {fmtR(stats.rho)}. {Math.round(stats.r2 * 100)}% of the spread in {lowerLabel(ry.label)} lines up with{" "}
                    {lowerLabel(rx.label)}.
                  </p>
                </>
              ) : (
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  One of the measures is the same for every hospital here, so there’s nothing to correlate.
                </p>
              )}
              {small && (
                <p className="mt-2 flex items-start gap-2 rounded-xl bg-black/4 px-3 py-2 text-[13px] leading-snug dark:bg-white/6">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                  <span>
                    <span className="font-medium">Small sample size — interpret with caution.</span>{" "}
                    <span className="text-muted-foreground">
                      Fewer than {SMALL_SAMPLE} hospitals; one unusual hospital can swing r a lot.
                      {spec.peers === "similar" && " Try All of California for a bigger group."}
                    </span>
                  </span>
                </p>
              )}
            </section>
            <section aria-label="Who's plotted" className="widget fade-up flex flex-col gap-1 p-5 lg:col-span-2">
              <p className="text-[11px] font-medium tracking-wide text-tertiary-foreground uppercase">Plotted</p>
              <p className="text-[15px] font-semibold tracking-tight">{current.facilityName}</p>
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                and {current.peerGroup.count} {spec.peers === "similar" ? "similar hospitals" : "hospitals statewide"}:{" "}
                {current.peerGroup.description.charAt(0).toLowerCase() + current.peerGroup.description.slice(1)}.
                {current.missing > 0 &&
                  ` ${current.missing} ${current.missing === 1 ? "hospital doesn’t" : "don’t"} report both measures for ${current.year} and ${current.missing === 1 ? "is" : "are"} left out.`}
              </p>
              {!current.focusReported && (
                <p className="text-[13px] text-warning">
                  {current.facilityName} doesn’t report both measures for {current.year}, so it isn’t on the chart.
                </p>
              )}
              {current.notes.map((n) => (
                <p key={n} className="text-xs leading-relaxed text-tertiary-foreground">
                  {n}
                </p>
              ))}
            </section>
          </div>

          <section aria-label={`${ry.label} against ${rx.label}`} className="glass fade-up min-w-0 rounded-2xl p-5">
            <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <h2 className="text-[15px] font-semibold tracking-tight">
                  {ry.label} <span className="font-normal text-muted-foreground">vs.</span> {lowerLabel(rx.label)}
                </h2>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                  <LegendDot className="size-3 bg-(--series-1)">{current.facilityName}</LegendDot>
                  <LegendDot className="size-2.5 bg-(--chart-2)/70">Other hospitals</LegendDot>
                  {stats && (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-0.5 w-4 rounded-full bg-(--muted-foreground)" aria-hidden />
                      Trend line
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Segmented
                  label="Show as"
                  size="sm"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: "chart", label: "Chart" },
                    { value: "table", label: "Table" },
                  ]}
                />
                <ActionButton onClick={copyLink} icon={copied ? Check : Link2} label={copied ? "Copied" : "Copy link"} />
                <ActionButton onClick={downloadCsv} icon={Download} label="CSV" />
              </div>
            </header>
            {view === "chart" ? (
              <>
                <ScatterPlot points={current.points} x={rx} y={ry} stats={stats ?? null} />
                <div className="sr-only">
                  <ScatterTable points={current.points} x={rx} y={ry} />
                </div>
              </>
            ) : (
              <ScatterTable points={current.points} x={rx} y={ry} />
            )}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                Across: {rx.label} <MetricInfo metric={rx} />
              </span>
              <span className="inline-flex items-center gap-1">
                Up: {ry.label} <MetricInfo metric={ry} />
              </span>
            </div>
          </section>

          <p className="text-xs leading-relaxed text-tertiary-foreground">
            r runs from −1 to 1: near 0 means no straight-line relationship, and the sign says whether the measures rise
            together or move in opposite directions. It shows association, not cause: hospitals differ in size, services,
            and patients all at once.
            {" "}The rank correlation (ρ) compares hospitals’ order instead of their values, so a few extreme hospitals can’t
            drive it; when r and ρ disagree, outliers are shaping r. The trend line is the least-squares fit.
          </p>
        </div>
      ) : !error ? (
        <div className="grid gap-4" aria-busy>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="widget h-40 animate-pulse" />
            <div className="widget h-40 animate-pulse lg:col-span-2" />
          </div>
          <div className="glass h-96 animate-pulse rounded-2xl" />
        </div>
      ) : null}
    </div>
  )
}


const fmtR = (r: number) => r.toFixed(2).replace("-", "−")

function LegendDot({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5">
      <span className={cn("shrink-0 rounded-full", className)} aria-hidden />
      <span className="truncate">{children}</span>
    </span>
  )
}

function ActionButton({ onClick, icon: Icon, label }: { onClick: () => void; icon: typeof Download; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-subtle inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors hover:bg-white/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:hover:bg-white/10"
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  )
}
