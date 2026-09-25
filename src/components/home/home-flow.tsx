"use client"

import {
  Activity,
  ArrowRight,
  BookOpenText,
  CalendarClock,
  ChartColumnBig,
  Check,
  HeartPulse,
  Landmark,
  Layers,
  Loader2,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { useRef, useState } from "react"

import { FacilityPicker, type FacilityOption } from "@/components/benchmark/facility-picker"
import { FilterPill } from "@/components/benchmark/filter-pill"
import { Segmented } from "@/components/shell/segmented"
import { CATEGORIES, CATEGORY_BY_ID, FUTURE_CATEGORIES, type MetricDef } from "@/lib/data/datasets"
import type { MetricCategory } from "@/lib/data/types"
import { rememberSelection, useSelection } from "@/lib/selection"
import { cn } from "@/lib/utils"

const ICONS: Record<string, LucideIcon> = {
  financial: Landmark,
  utilization: Activity,
  quality: HeartPulse,
  caseMix: Layers,
}

type PeerPreview = { count: number; description: string; note: string | null; hasFinancial: boolean; hasUtilization: boolean }

export function HomeFlow({
  facilities,
  catalog,
  years,
  latestYear,
  suggestions,
}: {
  facilities: FacilityOption[]
  catalog: MetricDef[]
  years: number[]
  latestYear: number
  suggestions: FacilityOption[]
}) {
  const [category, setCategory] = useState<MetricCategory | null>(null)
  const [facilityId, setFacilityId] = useState<string | null>(null)
  const [peers, setPeers] = useState<"similar" | "statewide">("similar")
  const [metrics, setMetrics] = useState<string[] | null>(null)
  const [since, setSince] = useState<number | null>(null)
  const [refineOpen, setRefineOpen] = useState(false)
  const [preview, setPreview] = useState<PeerPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const request = useRef<AbortController | null>(null)
  const selection = useSelection()

  const facility = facilities.find((f) => f.id === facilityId) ?? null
  const resume = selection?.facilityId ? facilities.find((f) => f.id === selection.facilityId) : null

  async function loadPreview(id: string | null, mode: "similar" | "statewide") {
    request.current?.abort()
    if (!id) return setPreview(null)
    const controller = new AbortController()
    request.current = controller
    setPreviewLoading(true)
    try {
      const res = await fetch(`/api/peers?facility=${id}${mode === "statewide" ? "&peers=statewide" : ""}`, {
        signal: controller.signal,
      })
      if (res.ok) setPreview((await res.json()) as PeerPreview)
    } catch {
      // Preview is a nicety; the destination page computes the real group.
    } finally {
      if (request.current === controller) setPreviewLoading(false)
    }
  }

  function chooseCategory(next: MetricCategory) {
    setCategory(next)
    setMetrics(null)
  }

  function chooseFacility(id: string) {
    setFacilityId(id)
    void loadPreview(id, peers)
  }

  function choosePeers(mode: "similar" | "statewide") {
    setPeers(mode)
    void loadPreview(facilityId, mode)
  }

  const categoryMetrics = category ? catalog.filter((m) => m.category === category && m.unit !== "share") : []
  const chosenMetrics = metrics ?? (category ? CATEGORY_BY_ID[category].defaultMetrics : [])
  const customMetrics = metrics != null && metrics.join(",") !== (category ? CATEGORY_BY_ID[category].defaultMetrics.join(",") : "")

  function toggleMetric(id: string) {
    // Added metrics go at the end, after the standard set.
    setMetrics(chosenMetrics.includes(id) ? chosenMetrics.filter((m) => m !== id) : [...chosenMetrics, id])
  }

  const ready = category != null && facilityId != null
  const benchmarkHref = (() => {
    if (!ready) return "/benchmark"
    const p = new URLSearchParams({ facility: facilityId })
    if (category === "utilization") p.set("view", "utilization")
    if (customMetrics && chosenMetrics.length) p.set("metrics", chosenMetrics.join(","))
    if (since != null) p.set("since", String(since))
    if (peers === "statewide") p.set("peers", "statewide")
    return `/benchmark?${p}`
  })()
  const withFacility = (href: string, extra: Record<string, string> = {}) =>
    facilityId ? `${href}?${new URLSearchParams({ ...extra, facility: facilityId })}` : href
  const noDataForCategory =
    preview && category ? (category === "financial" ? !preview.hasFinancial : !preview.hasUtilization) : false

  const remember = () => ready && rememberSelection({ facilityId, category })

  return (
    <div className="space-y-12">
      {/* Hero */}
      <header className="space-y-3 pt-2 md:pt-6">
        <p className="text-[13px] font-medium text-muted-foreground">HCAI Insights · California hospital data, made usable</p>
        <h1 className="text-[34px] leading-[1.1] font-semibold tracking-tight sm:text-[44px]">What do you want to look at?</h1>
        <p className="max-w-2xl text-[17px] leading-relaxed text-muted-foreground">
          Pick a topic and a hospital. You&apos;ll see it next to similar California hospitals, using HCAI&apos;s public
          financial and utilization reports.
        </p>
        {resume && (
          <Link
            href={`/benchmark?${new URLSearchParams({ facility: resume.id, ...(selection?.category === "utilization" ? { view: "utilization" } : {}) })}`}
            className="fade-up inline-flex max-w-full items-center gap-2 rounded-full bg-card px-4 py-2 text-[13px] shadow-card ring-1 ring-black/5 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:ring-white/10"
          >
            <span className="text-muted-foreground">Pick up where you left off:</span>
            <span className="truncate font-medium">
              {resume.name} · {CATEGORY_BY_ID[selection!.category].label}
            </span>
            <ArrowRight className="size-3.5 shrink-0 text-primary" />
          </Link>
        )}
      </header>

      {/* Step 1 */}
      <Step n={1} title="Choose a topic" done={category != null}>
        <div role="radiogroup" aria-label="Topic" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map((c) => {
            const Icon = ICONS[c.id]
            const selected = category === c.id
            const sample = c.defaultMetrics
              .slice(0, 3)
              .map((id) => catalog.find((m) => m.id === id)?.label)
              .filter(Boolean)
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => chooseCategory(c.id)}
                className={cn(
                  "choice-card group flex min-h-40 flex-col items-start gap-3 rounded-2xl bg-card p-5 text-left shadow-card ring-1 transition-[box-shadow,transform,background-color] duration-200",
                  "hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  selected ? "is-selected ring-primary/40" : "ring-black/5 dark:ring-white/10"
                )}
              >
                <span
                  className={cn(
                    "flex size-10 items-center justify-center rounded-xl transition-colors duration-200",
                    selected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                  )}
                >
                  <Icon className="size-5" strokeWidth={1.75} />
                </span>
                <span>
                  <span className="block text-[17px] font-semibold tracking-tight">{c.label}</span>
                  <span className="mt-0.5 block text-[13px] leading-relaxed text-muted-foreground">{c.description}</span>
                </span>
                <span className="mt-auto text-xs text-tertiary-foreground">{sample.join(" · ")}</span>
              </button>
            )
          })}
          {FUTURE_CATEGORIES.map((c) => {
            const Icon = ICONS[c.id]
            return (
              <div
                key={c.id}
                aria-disabled
                className="flex min-h-40 flex-col items-start gap-3 rounded-2xl border border-dashed border-border p-5 text-left"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-muted/60 text-tertiary-foreground">
                  <Icon className="size-5" strokeWidth={1.75} />
                </span>
                <span>
                  <span className="block text-[17px] font-semibold tracking-tight text-muted-foreground">{c.label}</span>
                  <span className="mt-0.5 block text-[13px] leading-relaxed text-tertiary-foreground">{c.description}</span>
                </span>
                <span className="mt-auto rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  Coming later
                </span>
              </div>
            )
          })}
        </div>
      </Step>

      {/* Step 2 */}
      <Step n={2} title="Which hospital?" done={facilityId != null}>
        <div className="max-w-2xl space-y-3">
          <FacilityPicker facilities={facilities} value={facilityId} onChange={chooseFacility} latestYear={latestYear} />
          {!facilityId && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-tertiary-foreground">Or try</span>
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => chooseFacility(s.id)}
                  className="rounded-full bg-card px-3 py-1.5 text-[13px] ring-1 ring-black/5 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:ring-white/10"
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
          {facility && (
            <p className="fade-up text-[13px] text-muted-foreground" aria-live="polite">
              {previewLoading && !preview ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="size-3.5 animate-spin" /> Finding similar hospitals…
                </span>
              ) : preview ? (
                <>
                  Will compare with <span className="font-medium text-foreground">{preview.count}</span>{" "}
                  {peers === "similar" ? "similar hospitals" : "hospitals"}:{" "}
                  {preview.description.charAt(0).toLowerCase() + preview.description.slice(1)}.
                  {noDataForCategory && (
                    <span className="text-warning">
                      {" "}
                      HCAI has no {category === "financial" ? "financial" : "utilization"} data for this hospital.
                    </span>
                  )}
                </>
              ) : null}
            </p>
          )}
        </div>
      </Step>

      {/* Step 3 */}
      <Step n={3} title="Refine" optional done={false}>
        {!refineOpen ? (
          <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted-foreground">
            <span>
              {peers === "similar" ? "Similar hospitals" : "All of California"} ·{" "}
              {customMetrics ? `${chosenMetrics.length} chosen metrics` : "standard metrics"} ·{" "}
              {since ? `since ${since}` : `${years[0]}–${years.at(-1)}`}
            </span>
            <button
              type="button"
              onClick={() => setRefineOpen(true)}
              className="font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Adjust
            </button>
          </div>
        ) : (
          <div className="fade-up grid gap-6 rounded-2xl bg-card p-5 shadow-card md:grid-cols-[auto_1fr]">
            <p className="text-[13px] font-medium md:pt-1.5">Compare with</p>
            <div className="space-y-1.5">
              <Segmented
                label="Peer group"
                size="sm"
                value={peers}
                onChange={choosePeers}
                options={[
                  { value: "similar", label: "Similar hospitals" },
                  { value: "statewide", label: "All of California" },
                ]}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Similar = same county (or nearest), same bed-size band, same ownership. You can fine-tune it on the next
                screen.
              </p>
            </div>

            <p className="text-[13px] font-medium md:pt-1">Metrics</p>
            {category ? (
              <div className="flex flex-wrap gap-1.5">
                {categoryMetrics.map((m) => {
                  const on = chosenMetrics.includes(m.id)
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleMetric(m.id)}
                      className={cn(
                        "inline-flex h-8 items-center gap-1 rounded-full px-3 text-[13px] ring-1 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        on
                          ? "bg-primary/10 text-primary ring-primary/20 dark:bg-primary/20"
                          : "bg-card text-muted-foreground ring-black/8 hover:bg-muted dark:ring-white/12"
                      )}
                    >
                      {on && <Check className="size-3.5" />}
                      {m.label}
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">Choose a topic first.</p>
            )}

            <p className="text-[13px] font-medium md:pt-1">Years</p>
            <div>
              <FilterPill
                label="Years"
                summary={since != null ? `Since ${since}` : `All years (${years[0]}–${years.at(-1)})`}
                active={since != null}
                options={[
                  { value: "all", label: `All years (${years[0]}–${years.at(-1)})` },
                  ...years.slice(0, -2).map((y) => ({ value: String(y), label: `Since ${y}` })),
                ]}
                selected={[since != null ? String(since) : "all"]}
                onChange={([v]) => setSince(v === "all" ? null : Number(v))}
              />
            </div>
          </div>
        )}
      </Step>

      {/* Go */}
      <div className="flex flex-col gap-4 border-t border-border pt-8 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={benchmarkHref}
          aria-disabled={!ready}
          tabIndex={ready ? undefined : -1}
          onClick={(e) => (ready ? remember() : e.preventDefault())}
          className={cn(
            "btn-primary inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-medium transition-[opacity,box-shadow,transform] duration-200",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
            ready ? "bg-primary text-primary-foreground hover:opacity-95 active:scale-[0.98]" : "cursor-not-allowed bg-muted text-muted-foreground"
          )}
        >
          {ready ? `Compare ${facility!.name}` : "Choose a topic and a hospital"}
          <ArrowRight className="size-4" />
        </Link>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
          <SecondaryLink
            href={withFacility("/build", category === "utilization" ? { category: "utilization" } : {})}
            icon={ChartColumnBig}
            enabled={ready}
            onClick={remember}
          >
            Build a chart
          </SecondaryLink>
          <SecondaryLink
            href={withFacility("/translate", { source: category ?? "financial" })}
            icon={BookOpenText}
            enabled={ready}
            onClick={remember}
          >
            Explain its numbers
          </SecondaryLink>
          <SecondaryLink href={withFacility("/deadlines")} icon={CalendarClock} enabled={facilityId != null} onClick={remember}>
            Filing deadlines
          </SecondaryLink>
        </div>
      </div>
    </div>
  )
}

function Step({
  n,
  title,
  optional,
  done,
  children,
}: {
  n: number
  title: string
  optional?: boolean
  done: boolean
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={`step-${n}`} className="space-y-4">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "step-badge flex size-7 items-center justify-center rounded-full text-[13px] font-semibold transition-colors duration-200",
            done ? "is-done bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}
          aria-hidden
        >
          {done ? <Check className="size-4" strokeWidth={2.5} /> : n}
        </span>
        <h2 id={`step-${n}`} className="text-[19px] font-semibold tracking-tight">
          {title}
          {optional && <span className="ml-2 text-[13px] font-normal text-tertiary-foreground">Optional</span>}
        </h2>
      </div>
      <div className="md:pl-10">{children}</div>
    </section>
  )
}

function SecondaryLink({
  href,
  icon: Icon,
  enabled,
  onClick,
  children,
}: {
  href: string
  icon: LucideIcon
  enabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-disabled={!enabled}
      tabIndex={enabled ? undefined : -1}
      onClick={(e) => (enabled ? onClick() : e.preventDefault())}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        enabled ? "text-primary hover:underline" : "cursor-not-allowed text-tertiary-foreground"
      )}
    >
      <Icon className="size-4" />
      {children}
    </Link>
  )
}
