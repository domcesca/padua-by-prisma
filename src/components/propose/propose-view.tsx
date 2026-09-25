"use client"

import { Check, Link2, Printer, TriangleAlert } from "lucide-react"
import { useEffect, useState } from "react"

import { FacilityPicker, type FacilityOption } from "@/components/benchmark/facility-picker"
import { PaduaMark } from "@/components/shell/padua-mark"
import { Segmented } from "@/components/shell/segmented"
import { APP_FULL_NAME } from "@/lib/brand"
import { formatPercent, formatUsd } from "@/lib/format"
import {
  formatPayback,
  MAX_LIFE,
  MAX_SCENARIO_RATE,
  projectAll,
  SCENARIOS,
  type CostInputs,
  type Projection,
  type ScenarioId,
  type ScenarioRates,
} from "@/lib/propose/engine"
import type { ProposalModule } from "@/lib/propose/module"
import { parseProposalSpec, proposalSpecToParams, type ProposalSpec } from "@/lib/propose/spec"
import { rememberSelection, useSelection } from "@/lib/selection"
import { cn } from "@/lib/utils"
import { CumulativeChart, SCENARIO_COLOR } from "./cumulative-chart"
import { MODULE_IDS, MODULES } from "./modules"
import { NumberField } from "./number-field"

// Module data is shared across hospitals' reference tables but carries hospital context, so it's
// cached per module + hospital for the session.
const dataCache = new Map<string, Promise<unknown>>()
function loadModuleData(module: ProposalModule, facilityId: string | null) {
  const url = `/api/propose/${module.id}${facilityId ? `?facility=${facilityId}` : ""}`
  let entry = dataCache.get(url)
  if (!entry) {
    entry = fetch(url).then((res) => {
      if (!res.ok) throw new Error(res.statusText)
      return res.json()
    })
    entry.catch(() => dataCache.delete(url))
    dataCache.set(url, entry)
  }
  return entry
}

export function ProposeView({ facilities, latestYear, search }: { facilities: FacilityOption[]; latestYear: number; search: string }) {
  const [draft, setSpec] = useState<ProposalSpec>(() => parseProposalSpec(new URLSearchParams(search), MODULE_IDS))
  // Every module keeps its inputs, so switching modules and back loses nothing.
  const [states, setStates] = useState<Record<string, unknown>>(() => {
    const params = new URLSearchParams(search)
    return Object.fromEntries(MODULES.map((m) => [m.id, m.fromParams(params)]))
  })
  const [data, setData] = useState<{ key: string; value?: unknown; failed?: boolean } | null>(null)
  const [focus, setFocus] = useState<ScenarioId>("expected")
  const [copied, setCopied] = useState(false)
  const selection = useSelection()

  // No hospital in the link: start from the one chosen on another tab.
  const remembered = selection?.facilityId && facilities.some((f) => f.id === selection.facilityId) ? selection.facilityId : null
  const spec = draft.facilityId || !remembered ? draft : { ...draft, facilityId: remembered }
  const mod = MODULES.find((m) => m.id === spec.module) ?? MODULES[0]
  const state = states[mod.id]
  const facility = facilities.find((f) => f.id === spec.facilityId) ?? null
  const dataKey = `${mod.id}|${spec.facilityId ?? ""}`
  const moduleData = mod.hasData && data?.key === dataKey ? (data.value ?? null) : null
  const dataError = mod.hasData && data?.key === dataKey && !!data.failed

  useEffect(() => {
    if (spec.facilityId) rememberSelection({ facilityId: spec.facilityId })
  }, [spec.facilityId])

  // Keep the URL in step, so reloading or sharing the link reproduces the proposal.
  // Every module's inputs go in (their keys don't overlap), so switching modules after a reload loses nothing.
  const query = proposalSpecToParams(spec, Object.assign({}, ...MODULES.map((m) => m.toParams(states[m.id])))).toString()
  useEffect(() => {
    window.history.replaceState(null, "", `/propose?${query}`)
  }, [query])

  useEffect(() => {
    if (!mod.hasData) return
    let live = true
    const key = `${mod.id}|${spec.facilityId ?? ""}`
    loadModuleData(mod, spec.facilityId).then(
      (value) => live && setData({ key, value }),
      () => live && setData({ key, failed: true })
    )
    return () => {
      live = false
    }
  }, [mod, spec.facilityId])

  const update = (patch: Partial<ProposalSpec>) => setSpec({ ...spec, ...patch })
  const setCost = (key: keyof CostInputs, value: number) => setSpec({ ...spec, costs: { ...spec.costs, [key]: value } })

  const benefit = mod.benefit(state, moduleData)
  const projections = projectAll(benefit.annual, spec.costs, spec.rates)
  const focused = projections.find((p) => p.scenario === focus)!
  const hasCost = spec.costs.capital + spec.costs.implementation + spec.costs.maintenance > 0
  const ready = !benefit.incomplete && hasCost
  const title = spec.name.trim() || "Untitled proposal"
  const Editor = mod.Editor

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
      {/* Printout header: what this is, for whom, and when. */}
      <div className="hidden print:block">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <PaduaMark size={22} className="text-foreground" />
          <span>
            <span className="font-semibold text-foreground">{APP_FULL_NAME}</span> · Proposal ·{" "}
            {new Date().toLocaleDateString("en-US", { dateStyle: "long" })}
          </span>
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {facility ? facility.name : "No hospital chosen"} · {mod.label} estimate · Useful life {spec.costs.life} years
        </p>
      </div>

      <section aria-labelledby="setup-title" className="space-y-3 print:hidden">
        <h2 id="setup-title" className="sr-only">
          Proposal setup
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <p className="mb-1 text-[13px] font-medium">Hospital</p>
            <FacilityPicker facilities={facilities} value={spec.facilityId} onChange={(id) => update({ facilityId: id })} latestYear={latestYear} />
          </div>
          <div>
            <label htmlFor="proposal-name" className="mb-1 block text-[13px] font-medium">
              Proposal name
            </label>
            <input
              id="proposal-name"
              value={spec.name}
              onChange={(e) => update({ name: e.target.value.slice(0, 120) })}
              placeholder="e.g. Robotic surgery program"
              className="glass h-11 w-full rounded-xl px-3.5 text-[15px] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
        <div>
          <p id="module-label" className="mb-1 text-[13px] font-medium">
            How the benefit is estimated
          </p>
          <div role="radiogroup" aria-labelledby="module-label" className="grid gap-2 sm:grid-cols-2">
            {MODULES.map((m) => {
              const on = m.id === mod.id
              const Icon = m.icon
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => update({ module: m.id })}
                  className={cn(
                    "glass flex items-start gap-3 rounded-xl px-3.5 py-3 text-left transition-shadow duration-200",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    on ? "ring-accent glow-soft" : "hover:glow-soft"
                  )}
                >
                  <Icon className={cn("mt-0.5 size-4 shrink-0", on ? "text-primary" : "text-tertiary-foreground")} />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium">{m.label}</span>
                    <span className="block text-[12px] leading-snug text-muted-foreground">{m.summary}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-5 print:hidden">
        <section aria-labelledby="benefit-title" className="glass min-w-0 rounded-2xl p-5 lg:col-span-3">
          <h2 id="benefit-title" className="mb-3 text-[15px] font-semibold tracking-tight">
            Benefit: {mod.label.toLowerCase()}
          </h2>
          {dataError ? (
            <p role="alert" className="text-sm text-muted-foreground">
              Couldn’t load this module’s data. Reload the page to try again.
            </p>
          ) : (
            <Editor
              state={state}
              onChange={(next) => setStates((s) => ({ ...s, [mod.id]: next }))}
              data={moduleData}
              context={{ facilityId: facility?.id ?? null, facilityName: facility?.name ?? null }}
            />
          )}
        </section>
        <section aria-labelledby="costs-title" className="glass min-w-0 space-y-3 rounded-2xl p-5 lg:col-span-2">
          <h2 id="costs-title" className="text-[15px] font-semibold tracking-tight">
            Costs
          </h2>
          <NumberField label="Capital outlay" prefix="$" value={spec.costs.capital} onChange={(v) => setCost("capital", v)} hint="Equipment, construction. Paid up front." />
          <NumberField
            label="Implementation"
            prefix="$"
            value={spec.costs.implementation}
            onChange={(v) => setCost("implementation", v)}
            hint="Installation, training, go-live. Paid up front."
          />
          <NumberField
            label="Maintenance and running costs"
            prefix="$"
            suffix="a year"
            value={spec.costs.maintenance}
            onChange={(v) => setCost("maintenance", v)}
            hint="Service contracts, licenses, added staff. Every year."
          />
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Useful life" suffix="years" value={spec.costs.life} onChange={(v) => setCost("life", Math.max(1, Math.round(v)))} min={1} max={MAX_LIFE} />
            <NumberField label="Discount rate (NPV)" suffix="%" value={spec.costs.discountRate} onChange={(v) => setCost("discountRate", v)} max={50} decimals={1} />
          </div>
        </section>
      </div>

      <section aria-labelledby="results-title" className="space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="results-title" className="text-xl font-semibold tracking-tight">
              Results
            </h2>
            <p className="text-[13px] text-muted-foreground print:hidden">
              Each scenario takes a share of the estimated benefit (edit the rates below); costs stay the same.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <ActionButton onClick={copyLink} icon={copied ? Check : Link2} label={copied ? "Copied" : "Copy link"} />
            <ActionButton onClick={() => window.print()} icon={Printer} label="Print or save PDF" />
          </div>
        </header>

        {!ready && (
          <p role="status" className="flex items-start gap-2 rounded-xl bg-black/4 px-4 py-3 text-[13px] dark:bg-white/6 print:hidden">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
            <span>
              {[benefit.incomplete, !hasCost && "Enter at least one cost."].filter(Boolean).join(" ")}{" "}
              <span className="text-muted-foreground">Results update as you type.</span>
            </span>
          </p>
        )}

        {/* Each scenario's rate sits over its card. */}
        <div className="print:hidden">
          <div className="grid gap-3 sm:grid-cols-3">
            {SCENARIOS.map((s) => (
              <NumberField
                key={s.id}
                label={`${s.label} rate`}
                suffix="% of estimate"
                value={spec.rates[s.id]}
                onChange={(v) => update({ rates: { ...spec.rates, [s.id]: v } })}
                max={MAX_SCENARIO_RATE}
                decimals={1}
              />
            ))}
          </div>
          {spec.rates.conservative > spec.rates.optimistic && (
            <p role="status" className="mt-1.5 text-xs text-warning">
              Conservative is set higher than Optimistic. That’s allowed, but check it’s intended.
            </p>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-3 print:grid-cols-3">
          {projections.map((p) => (
            <ScenarioCard key={p.scenario} p={p} life={spec.costs.life} blank={!benefit.annual && !hasCost} focused={p.scenario === focus} onFocus={() => setFocus(p.scenario)} />
          ))}
        </div>

        <section aria-label="Cumulative net benefit over time" className="glass min-w-0 rounded-2xl p-5 print:break-inside-avoid">
          <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-[15px] font-semibold tracking-tight">Cumulative net benefit</h3>
              <p className="text-xs text-muted-foreground">
                Up-front cost at the start, then each year’s benefit minus running costs. Payback is where a line crosses zero.
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
                {projections.map((p) => (
                  <span key={p.scenario} className="inline-flex items-center gap-1.5">
                    <span className="h-0.5 w-4 rounded-full" style={{ background: SCENARIO_COLOR[p.scenario] }} aria-hidden />
                    {p.label}
                  </span>
                ))}
              </div>
            </div>
            <Segmented
              label="Scenario to highlight"
              size="sm"
              value={focus}
              onChange={setFocus}
              options={SCENARIOS.map((s) => ({ value: s.id, label: s.label }))}
              className="print:hidden"
            />
          </header>
          <CumulativeChart projections={projections} focus={focus} />
        </section>

        <div className="grid gap-4 lg:grid-cols-5">
          <section aria-labelledby="table-title" className="glass min-w-0 rounded-2xl p-5 lg:col-span-3 print:break-inside-avoid">
            <h3 id="table-title" className="text-[15px] font-semibold tracking-tight">
              Year by year · {focused.label.toLowerCase()}
            </h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Benefit at {formatRate(focused.multiplier)} of the estimate.<span className="print:hidden"> Switch scenarios with the chart’s control above.</span>
            </p>
            <YearTable p={focused} />
          </section>
          <section aria-labelledby="inputs-title" className="glass min-w-0 rounded-2xl p-5 lg:col-span-2 print:break-inside-avoid">
            <h3 id="inputs-title" className="mb-3 text-[15px] font-semibold tracking-tight">
              What went in
            </h3>
            <Inputs costs={spec.costs} rates={spec.rates} lines={benefit.lines} annual={benefit.annual} />
          </section>
        </div>

        <div className="space-y-1.5 text-xs leading-relaxed text-tertiary-foreground">
          {benefit.notes.map((n) => (
            <p key={n}>{n}</p>
          ))}
          <p>
            Cash view: payback, cumulative net, ROI, and NPV use the up-front cost in year 0 and full benefit and running
            costs in each year after; no ramp-up, inflation, or taxes. ROI = (total benefit − total cost) ÷ total cost over
            the useful life. NPV discounts each year at {spec.costs.discountRate}%. Amortized net spreads the up-front cost
            evenly over {spec.costs.life} {spec.costs.life === 1 ? "year" : "years"}.
          </p>
          <p className="print:hidden">
            Nothing is saved on a server: this proposal lives in the page’s link. Copy the link to come back to it or share it,
            or print it to PDF.
          </p>
        </div>
      </section>
    </div>
  )
}

/** A scenario multiplier as a percent: 0.7 → "70%". */
const formatRate = (multiplier: number) => `${Number((multiplier * 100).toFixed(1))}%`

function ScenarioCard({
  p,
  life,
  blank,
  focused,
  onFocus,
}: {
  p: Projection
  life: number
  /** Nothing entered yet: no payback to speak of. */
  blank: boolean
  focused: boolean
  onFocus: () => void
}) {
  return (
    <button
      type="button"
      onClick={onFocus}
      aria-pressed={focused}
      className={cn(
        "widget fade-up flex flex-col gap-2 p-4 text-left transition-shadow duration-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none print:break-inside-avoid",
        focused ? "ring-accent glow-soft" : "hover:glow-soft"
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-tertiary-foreground uppercase">
          <span className="size-2 rounded-full" style={{ background: SCENARIO_COLOR[p.scenario] }} aria-hidden />
          {p.label} · {formatRate(p.multiplier)}
        </span>
      </span>
      <span>
        <span className="block text-xs text-muted-foreground">Payback</span>
        <span className="num block text-[26px] leading-tight font-semibold tracking-tight">{blank ? "—" : formatPayback(p.paybackYears, life)}</span>
      </span>
      <dl className="num grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
        <Stat label="ROI" value={p.roi == null ? "—" : formatPercent(p.roi, 0)} tone={p.roi} />
        <Stat label="NPV" value={formatUsd(p.npv, { compact: true })} tone={p.npv} />
        <Stat label="Benefit a year" value={formatUsd(p.annualBenefit, { compact: true })} />
        <Stat label="Net a year" value={formatUsd(p.annualNet, { compact: true })} tone={p.annualNet} />
        <Stat label="Amortized net" value={formatUsd(p.annualNetAfterAmortization, { compact: true })} tone={p.annualNetAfterAmortization} />
        <Stat label={`Net over ${life} yr`} value={formatUsd(p.cumulativeNet, { compact: true })} tone={p.cumulativeNet} />
      </dl>
    </button>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: number | null }) {
  return (
    <span className="min-w-0">
      <dt className="truncate text-[11px] text-muted-foreground">{label}</dt>
      <dd className={cn("font-medium", tone != null && tone < 0 && "text-destructive")}>{value}</dd>
    </span>
  )
}

function YearTable({ p }: { p: Projection }) {
  const cell = "px-2 py-1.5 text-right"
  return (
    <div className="-mx-2 overflow-x-auto">
      <table className="num w-full min-w-[30rem] text-[13px]">
        <thead>
          <tr className="border-b border-border text-[11px] text-muted-foreground">
            <th scope="col" className="px-2 py-1.5 text-left font-medium">Year</th>
            <th scope="col" className={cn(cell, "font-medium")}>Benefit</th>
            <th scope="col" className={cn(cell, "font-medium")}>Costs</th>
            <th scope="col" className={cn(cell, "font-medium")}>Net</th>
            <th scope="col" className={cn(cell, "font-medium")}>Cumulative</th>
            <th scope="col" className={cn(cell, "font-medium")}>Present value</th>
          </tr>
        </thead>
        <tbody>
          {p.rows.map((r) => (
            <tr key={r.year} className="border-b border-border/60 last:border-0">
              <th scope="row" className="px-2 py-1.5 text-left font-normal text-muted-foreground">
                {r.year === 0 ? "Start" : r.year}
              </th>
              <td className={cell}>{formatUsd(r.benefit)}</td>
              <td className={cell}>{formatUsd(-r.cost)}</td>
              <td className={cn(cell, r.net < 0 && "text-destructive")}>{formatUsd(r.net)}</td>
              <td className={cn(cell, "font-medium", r.cumulative < 0 && "text-destructive")}>{formatUsd(r.cumulative)}</td>
              <td className={cn(cell, "text-muted-foreground")}>{formatUsd(r.present)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border font-medium">
            <th scope="row" className="px-2 py-1.5 text-left">Total</th>
            <td className={cell}>{formatUsd(p.totalBenefit)}</td>
            <td className={cell}>{formatUsd(-p.totalCost)}</td>
            <td className={cell}>{formatUsd(p.cumulativeNet)}</td>
            <td className={cell} />
            <td className={cell}>NPV {formatUsd(p.npv)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function Inputs({
  costs,
  rates,
  lines,
  annual,
}: {
  costs: CostInputs
  rates: ScenarioRates
  lines: { label: string; detail?: string; amount: number }[]
  annual: number
}) {
  const row = (label: string, value: string, detail?: string) => (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="min-w-0">
        <span className="block text-[13px] leading-snug">{label}</span>
        {detail && <span className="num block text-[11px] text-muted-foreground">{detail}</span>}
      </dt>
      <dd className="num shrink-0 text-[13px] font-medium">{value}</dd>
    </div>
  )
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[11px] font-medium tracking-wide text-tertiary-foreground uppercase">Benefit a year (estimate, before scenario rates)</p>
        <dl className="divide-y divide-border/60">
          {lines.length ? lines.map((l) => <div key={l.label}>{row(l.label, formatUsd(l.amount), l.detail)}</div>) : row("None entered yet", "—")}
          {lines.length > 1 && row("Total", formatUsd(annual))}
        </dl>
      </div>
      <div>
        <p className="text-[11px] font-medium tracking-wide text-tertiary-foreground uppercase">Costs</p>
        <dl className="divide-y divide-border/60">
          {row("Capital outlay", formatUsd(costs.capital), "Up front")}
          {row("Implementation", formatUsd(costs.implementation), "Up front")}
          {row("Maintenance and running", formatUsd(costs.maintenance), "Each year")}
          {row("Useful life", `${costs.life} ${costs.life === 1 ? "year" : "years"}`)}
          {row("Discount rate", `${costs.discountRate}%`)}
          {row("Scenario rates", SCENARIOS.map((s) => `${rates[s.id]}%`).join(" / "), "Conservative / Expected / Optimistic, of the estimate")}
        </dl>
      </div>
    </div>
  )
}

function ActionButton({ onClick, icon: Icon, label }: { onClick: () => void; icon: typeof Printer; label: string }) {
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
