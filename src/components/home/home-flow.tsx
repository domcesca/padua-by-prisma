"use client"

import {
  Activity,
  ArrowRight,
  BookOpenText,
  CalendarClock,
  ChartColumnBig,
  ChartScatter,
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
import { AboutTool } from "@/components/shell/about-tool"
import { GroupedPicker } from "@/components/shell/grouped-picker"
import { Segmented } from "@/components/shell/segmented"
import { APP_ATTRIBUTION, APP_FULL_NAME, APP_SUMMARY } from "@/lib/brand"
import {
  CATEGORIES,
  CATEGORY_BY_ID,
  FUTURE_CATEGORIES,
  pickableMetrics,
  supportsUnits,
  UNIT_DEFAULT_METRICS,
  UNIT_METRIC_LABELS,
  UNIT_METRICS,
  type MetricDef,
} from "@/lib/data/datasets"
import { metricPickerOptions } from "@/lib/data/metric-options"
import type { FacilityUnit, MetricCategory } from "@/lib/data/types"
import { rememberSelection, useSelection } from "@/lib/selection"
import { cn } from "@/lib/utils"
import { WhereToLook } from "./where-to-look"

const ICONS: Record<string, LucideIcon> = {
  financial: Landmark,
  utilization: Activity,
  quality: HeartPulse,
  caseMix: Layers,
}

type PeerPreview = {
  count: number
  description: string
  note: string | null
  hasFinancial: boolean
  hasUtilization: boolean
  units: FacilityUnit[]
}

export function HomeFlow({
  facilities,
  catalog,
  years,
  latestYear,
}: {
  facilities: FacilityOption[]
  catalog: MetricDef[]
  years: number[]
  latestYear: number
}) {
  const [category, setCategory] = useState<MetricCategory | null>(null)
  const [facilityId, setFacilityId] = useState<string | null>(null)
  const [peers, setPeers] = useState<"similar" | "statewide">("similar")
  const [metrics, setMetrics] = useState<string[] | null>(null)
  const [since, setSince] = useState<number | null>(null)
  const [unit, setUnit] = useState<string | null>(null)
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
    if (!supportsUnits(next)) setUnit(null)
  }

  function chooseUnit(next: string | null) {
    setUnit(next)
    setMetrics(null)
  }

  function chooseFacility(id: string) {
    setFacilityId(id)
    setUnit(null)
    void loadPreview(id, peers)
  }

  function choosePeers(mode: "similar" | "statewide") {
    setPeers(mode)
    void loadPreview(facilityId, mode)
  }

  // Under a unit, only the metrics HCAI reports by bed classification.
  const categoryMetrics = unit
    ? UNIT_METRICS.map((id) => ({ value: id, label: UNIT_METRIC_LABELS[id] }))
    : category
      ? metricPickerOptions(pickableMetrics(catalog, category, "all"), { acrossCategories: false })
      : []
  const defaultMetrics = unit ? UNIT_DEFAULT_METRICS : category ? CATEGORY_BY_ID[category].defaultMetrics : []
  const chosenMetrics = metrics ?? defaultMetrics
  const customMetrics = metrics != null && metrics.join(",") !== defaultMetrics.join(",")
  const units = preview?.units ?? []
  const unitInfo = units.find((u) => u.id === unit)

  const ready = category != null && facilityId != null
  const benchmarkHref = (() => {
    if (!ready) return "/benchmark"
    const p = new URLSearchParams({ facility: facilityId })
    if (category !== "financial") p.set("view", category)
    if (unit && supportsUnits(category)) p.set("unit", unit)
    if (customMetrics && chosenMetrics.length) p.set("metrics", chosenMetrics.join(","))
    if (since != null) p.set("since", String(since))
    if (peers === "statewide") p.set("peers", "statewide")
    return `/benchmark?${p}`
  })()
  const withFacility = (href: string, extra: Record<string, string> = {}) =>
    facilityId ? `${href}?${new URLSearchParams({ ...extra, facility: facilityId })}` : href
  const noDataForCategory =
    preview && category && category !== "quality"
      ? category === "financial"
        ? !preview.hasFinancial
        : !preview.hasUtilization
      : false

  const remember = () => ready && rememberSelection({ facilityId, category })

  return (
    <div className="space-y-12">
      {/* Hero */}
      <header className="space-y-3 pt-2 md:pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-muted-foreground">
            {APP_FULL_NAME} · {APP_SUMMARY}
          </p>
          <AboutTool id="home" />
        </div>
        <h1 className="text-[34px] leading-[1.1] font-semibold tracking-tight sm:text-[44px]">What do you want to look at?</h1>
        <p className="max-w-2xl text-[17px] leading-relaxed text-muted-foreground">
          Pick a hospital, then a topic. You&apos;ll see it next to similar California hospitals, using HCAI&apos;s public
          financial and utilization reports and CMS and CDPH quality data.
        </p>
        {resume && (
          <Link
            href={`/benchmark?${new URLSearchParams({ facility: resume.id, ...(selection && selection.category !== "financial" ? { view: selection.category } : {}) })}`}
            className="glass fade-up inline-flex max-w-full items-center gap-2 rounded-full px-4 py-2 text-[13px] transition-shadow duration-200 hover:glow-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
      <Step n={1} title="Which hospital?" done={facilityId != null}>
        <div className="max-w-2xl space-y-3">
          <div data-tour="hospital">
            <FacilityPicker facilities={facilities} value={facilityId} onChange={chooseFacility} latestYear={latestYear} />
          </div>
          {facility && (
            <p className="fade-up text-[13px] text-muted-foreground" aria-live="polite">
              {previewLoading && !preview ? (
                <span className="flex max-w-xs flex-col gap-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="size-3.5 animate-spin" /> Finding similar hospitals…
                  </span>
                  <span className="loading-bar" />
                </span>
              ) : preview ? (
                <>
                  Will compare with <span className="font-medium text-foreground">{preview.count}</span>{" "}
                  {peers === "similar" ? "similar hospitals" : "hospitals"}:{" "}
                  {preview.description.charAt(0).toLowerCase() + preview.description.slice(1)}.
                </>
              ) : null}
            </p>
          )}
        </div>
      </Step>

      {facility && (
        <WhereToLook
          facilityId={facility.id}
          facilityName={facility.name}
          statewide={peers === "statewide"}
          metaById={Object.fromEntries(catalog.map((m) => [m.id, m]))}
        />
      )}

      {/* Step 2 */}
      <Step n={2} title={facility ? "Or explore a topic" : "Choose a topic"} done={category != null}>
        <div role="radiogroup" aria-label="Topic" data-tour="topic" className="scroll-mt-20 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                  "widget group flex min-h-40 flex-col items-start gap-3 p-5 text-left transition-[box-shadow,transform] duration-200",
                  "hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  selected ? "ring-accent glow" : "hover:glow-soft"
                )}
              >
                <span
                  className={cn(
                    "flex size-10 items-center justify-center rounded-xl transition-colors duration-200",
                    selected ? "bg-[image:var(--accent-gradient)] text-white" : "bg-black/5 text-foreground dark:bg-white/10"
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
                aria-disabled={c.partial ? undefined : true}
                className="flex min-h-40 flex-col items-start gap-3 rounded-[1.375rem] border border-dashed border-black/10 p-5 text-left dark:border-white/10"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-muted/60 text-tertiary-foreground">
                  <Icon className="size-5" strokeWidth={1.75} />
                </span>
                <span>
                  <span className="block text-[17px] font-semibold tracking-tight text-muted-foreground">{c.label}</span>
                  <span className="mt-0.5 block text-[13px] leading-relaxed text-tertiary-foreground">{c.description}</span>
                </span>
                {c.partial && (
                  <Link
                    href={`/benchmark?${new URLSearchParams({ view: c.partial.view, specialty: c.partial.specialty, ...(facilityId ? { facility: facilityId } : {}) })}`}
                    onClick={remember}
                    className="text-[13px] font-medium text-primary underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    Available now: {c.partial.label} →
                  </Link>
                )}
                <span className="mt-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {c.partial ? "All payers: coming later" : "Coming later"}
                </span>
              </div>
            )
          })}
        </div>
        {noDataForCategory && facility && (
          <p className="fade-up mt-3 text-[13px] text-warning" aria-live="polite">
            HCAI has no {category === "financial" ? "financial" : "utilization"} data for {facility.name}.
          </p>
        )}
      </Step>

      {/* Step 3 */}
      <Step n={3} title="View by unit" optional done={unit != null}>
        {!facility ? (
          <p className="text-[13px] text-muted-foreground">Choose a hospital to see its units.</p>
        ) : category && !supportsUnits(category) ? (
          <p className="text-[13px] text-muted-foreground">
            {category === "financial" ? "Financial" : "Quality"} data is reported for the whole hospital, so there&apos;s no
            unit to narrow to. Utilization can be narrowed to a unit.
          </p>
        ) : previewLoading && !preview ? (
          <p className="text-[13px] text-muted-foreground">Loading units…</p>
        ) : units.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">HCAI has no unit data on file for this hospital.</p>
        ) : (
          <div className="space-y-2">
            <div role="radiogroup" aria-label="Unit" className="flex flex-wrap gap-1.5">
              {[{ id: null, label: "Whole hospital", beds: null as number | null }, ...units].map((u) => {
                const on = unit === u.id
                return (
                  <button
                    key={u.id ?? "all"}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      chooseUnit(u.id)
                      if (u.id && !category) chooseCategory("utilization")
                    }}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] transition-[color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      on ? "glass-subtle ring-accent glow-soft text-foreground" : "glass-subtle text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {on && <Check className="size-3.5" />}
                    {u.label}
                    {u.beds != null && <span className="text-xs text-tertiary-foreground">{u.beds} beds</span>}
                  </button>
                )
              })}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {unitInfo
                ? `${unitInfo.description}: utilization for these beds only, compared with similar hospitals that have the same unit.`
                : "Skip this to see the whole hospital. Units are HCAI’s bed classifications; only ones this hospital has licensed beds in are listed."}
              {!category && " Choosing a unit picks Utilization."}
            </p>
          </div>
        )}
      </Step>

      {/* Step 4 */}
      <Step n={4} title="Refine" optional done={false}>
        {!refineOpen ? (
          <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted-foreground">
            <span>
              {peers === "similar" ? "Similar hospitals" : "All of California"} ·{" "}
              {unitInfo ? `${unitInfo.label} unit · ` : ""}
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
          <div className="glass fade-up grid gap-6 rounded-2xl p-5 md:grid-cols-[auto_1fr]">
            <p className="text-[13px] font-medium md:pt-1.5">Peer group</p>
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
              <div className="glass-subtle max-w-md rounded-2xl p-1.5">
                <GroupedPicker
                  key={`${category}-${unit ?? ""}`}
                  noun="metrics"
                  options={categoryMetrics}
                  selected={chosenMetrics}
                  onChange={setMetrics}
                  multiple
                  listClassName="max-h-60"
                />
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
          data-tour="compare"
          aria-disabled={!ready}
          tabIndex={ready ? undefined : -1}
          onClick={(e) => (ready ? remember() : e.preventDefault())}
          className={cn(
            "inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-medium",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
            ready ? "btn-accent active:scale-[0.98]" : "glass-subtle cursor-not-allowed text-muted-foreground"
          )}
        >
          {ready ? `Compare ${facility!.name}` : "Choose a hospital and a topic"}
          <ArrowRight className="size-4" />
        </Link>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
          <SecondaryLink
            href={withFacility("/build/report", category && category !== "financial" ? { category } : {})}
            icon={ChartColumnBig}
            enabled={ready}
            onClick={remember}
          >
            Build a chart
          </SecondaryLink>
          <SecondaryLink href={withFacility("/build/correlate")} icon={ChartScatter} enabled={facilityId != null} onClick={remember}>
            Correlate two measures
          </SecondaryLink>
          <SecondaryLink
            href={withFacility("/translate", { source: category === "utilization" ? "utilization" : "financial" })}
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

      {/* Placeholder attribution (see lib/brand.ts): wording to be confirmed. */}
      <p className="max-w-2xl text-xs leading-relaxed text-tertiary-foreground">{APP_ATTRIBUTION}</p>
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
            done ? "bg-[image:var(--accent-gradient)] text-white" : "glass-subtle text-muted-foreground"
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
