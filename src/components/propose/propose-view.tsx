"use client"

import { Check, ChevronDown, Link2, Printer, TriangleAlert } from "lucide-react"
import { useEffect, useMemo, useState, type CSSProperties } from "react"

import { FacilityPicker, type FacilityOption } from "@/components/benchmark/facility-picker"
import { FacilityFlagNote } from "@/components/shell/facility-flag-note"
import { PaduaMark } from "@/components/shell/padua-mark"
import { Segmented } from "@/components/shell/segmented"
import { APP_FULL_NAME } from "@/lib/brand"
import { facilityFlag } from "@/lib/facility-flag"
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
import { payerBlend, rampActive, SWINGS, yearFactors, type AdvancedSettings } from "@/lib/propose/advanced"
import { breakEven, modelBenefit, sensitivity, type BreakEven, type Model } from "@/lib/propose/analysis"
import { suggestModule } from "@/lib/propose/intake"
import type { ProposalModule } from "@/lib/propose/module"
import type { HospitalWageIndex } from "@/lib/propose/wage-index"
import { matchingPreset, PRESETS, type SectionId } from "@/lib/propose/output"
import { parseProposalSpec, proposalSpecToParams, type ProposalSpec } from "@/lib/propose/spec"
import { rememberSelection, useSelection } from "@/lib/selection"
import { cn } from "@/lib/utils"
import { AdvancedPanel } from "./advanced-panel"
import { CumulativeChart, SCENARIO_COLOR } from "./cumulative-chart"
import { ModuleIntake } from "./module-intake"
import { MODULE_IDS, MODULES } from "./modules"
import { NumberField } from "./number-field"
import { PrintoutPanel } from "./printout-panel"
import { SensitivityChart } from "./sensitivity-chart"

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
  const [draft, setSpec] = useState<ProposalSpec>(() => {
    const params = new URLSearchParams(search)
    const parsed = parseProposalSpec(params, MODULE_IDS)
    // A link with a description but no module yet: start on the suggested one.
    const suggested = params.has("module") ? null : suggestModule(parsed.description)
    return suggested ? { ...parsed, module: suggested.module } : parsed
  })
  // Every module keeps its inputs, so switching modules and back loses nothing.
  const [states, setStates] = useState<Record<string, unknown>>(() => {
    const params = new URLSearchParams(search)
    return Object.fromEntries(MODULES.map((m) => [m.id, m.fromParams(params)]))
  })
  const [data, setData] = useState<{ key: string; value?: unknown; failed?: boolean } | null>(null)
  const [focus, setFocus] = useState<ScenarioId>("expected")
  const [copied, setCopied] = useState(false)
  // The module picker's open state, once toggled by hand; until then it follows the suggestion.
  const [pickerOpen, setPickerOpen] = useState<boolean | null>(null)
  const [printoutOpen, setPrintoutOpen] = useState(false)
  const selection = useSelection()

  // No hospital in the link: start from the one chosen on another tab.
  const remembered = selection?.facilityId && facilities.some((f) => f.id === selection.facilityId) ? selection.facilityId : null
  const spec = draft.facilityId || !remembered ? draft : { ...draft, facilityId: remembered }
  const mod = MODULES.find((m) => m.id === spec.module) ?? MODULES[0]
  const state = states[mod.id]
  const facility = facilities.find((f) => f.id === spec.facilityId) ?? null
  const facilityFlagNow = facility ? facilityFlag(facility, latestYear) : null
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
  const suggestion = useMemo(() => suggestModule(spec.description), [spec.description])
  // A confident suggestion folds the picker; no suggestion (or nothing typed) leaves it open, as before.
  const moduleListOpen = pickerOpen ?? !suggestion
  function describe(text: string) {
    const next = suggestModule(text)
    update({ description: text, ...(next && !spec.manualModule ? { module: next.module } : {}) })
  }
  const pickModule = (id: string) => update({ module: id, manualModule: id !== suggestion?.module })
  const setCost = (key: keyof CostInputs, value: number) => setSpec({ ...spec, costs: { ...spec.costs, [key]: value } })

  const adv = spec.advanced
  const model: Model = { module: mod, state, data: moduleData, costs: spec.costs, rates: spec.rates, advanced: adv }
  const benefit = modelBenefit(model)
  const factors = yearFactors(adv, spec.costs.life, !!mod.ownTiming)
  const projections = projectAll(benefit.annual, spec.costs, spec.rates, factors)
  const advancedNotes = advancedNotesFor(adv, mod)
  const showBreakEven = adv.on && adv.breakeven
  const showSensitivity = adv.on && adv.sensitivity.on
  const focused = projections.find((p) => p.scenario === focus)!
  const hasCost = spec.costs.capital + spec.costs.implementation + spec.costs.maintenance > 0
  const ready = !benefit.incomplete && hasCost
  // Advanced read-outs: the same model re-run, so only once there's something to re-run.
  const breakEvenResult = showBreakEven && ready ? breakEven(model) : null
  const sensitivityResult = showSensitivity && ready ? sensitivity(model) : null
  const title = spec.name.trim() || "Untitled proposal"
  const Editor = mod.Editor
  const preset = matchingPreset(spec.output)
  // Print order and visibility per section (the screen shows everything, in its usual layout).
  const printSlot = (id: SectionId): { className: string; style: CSSProperties } => {
    const i = spec.output.sections.findIndex((s) => s.id === id)
    const on = spec.output.sections[i]?.on ?? false
    return { className: cn("print:order-(--print-order)", !on && "print:hidden"), style: { "--print-order": i + 1 } as CSSProperties }
  }
  const assumptions = printSlot("assumptions")
  const keyAssumptions = spec.output.assumptions === "key"

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
        {facilityFlagNow && <FacilityFlagNote flag={facilityFlagNow} className="mt-2" />}
      </div>

      <section aria-labelledby="setup-title" className="space-y-3 print:hidden">
        <h2 id="setup-title" className="sr-only">
          Proposal setup
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <p className="mb-1 text-[13px] font-medium">Hospital</p>
            <FacilityPicker facilities={facilities} value={spec.facilityId} onChange={(id) => update({ facilityId: id })} latestYear={latestYear} />
            {facilityFlagNow && <FacilityFlagNote flag={facilityFlagNow} className="mt-2" />}
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
        <div data-tour="propose-method">
        <ModuleIntake
          modules={MODULES}
          current={mod}
          description={spec.description}
          suggestion={suggestion}
          manual={spec.manualModule}
          open={moduleListOpen}
          onDescription={describe}
          onPick={pickModule}
          onToggle={() => setPickerOpen(!moduleListOpen)}
        />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-5 print:hidden">
        <section aria-labelledby="benefit-title" data-tour="propose-benefit" className="glass min-w-0 rounded-2xl p-5 lg:col-span-3">
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
              context={{
                facilityId: facility?.id ?? null,
                facilityName: facility?.name ?? null,
                life: spec.costs.life,
                advanced: adv.on,
                wageIndex: adv.on && adv.wageIndex,
              }}
            />
          )}
        </section>
        <section aria-labelledby="costs-title" data-tour="propose-costs" className="glass min-w-0 space-y-3 rounded-2xl p-5 lg:col-span-2">
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

      <AdvancedPanel value={adv} onChange={(advanced) => update({ advanced })} module={mod} facilityId={spec.facilityId} />

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
          <div data-tour="propose-print" className="flex flex-wrap items-center gap-2 print:hidden">
            <ActionButton onClick={copyLink} icon={copied ? Check : Link2} label={copied ? "Copied" : "Copy link"} />
            <button
              type="button"
              onClick={() => setPrintoutOpen(!printoutOpen)}
              aria-expanded={printoutOpen}
              aria-controls="printout-panel"
              className="glass-subtle inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors hover:bg-white/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:hover:bg-white/10"
            >
              Printout: {preset ? PRESETS[preset].label : "Customized"}
              <ChevronDown className={cn("size-3.5 transition-transform", printoutOpen && "rotate-180")} aria-hidden />
            </button>
            <ActionButton onClick={() => window.print()} icon={Printer} label="Print or save PDF" />
          </div>
        </header>

        {printoutOpen && (
          <div id="printout-panel" className="print:hidden">
            <PrintoutPanel value={spec.output} onChange={(output) => update({ output })} unavailable={showSensitivity ? [] : ["sensitivity"]} />
          </div>
        )}

        {!ready && (
          <p role="status" className="flex items-start gap-2 rounded-xl bg-black/4 px-4 py-3 text-[13px] dark:bg-white/6 print:hidden">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
            <span>
              {[benefit.incomplete, !hasCost && "Enter at least one cost."].filter(Boolean).join(" ")}{" "}
              <span className="text-muted-foreground">Results update as you type.</span>
            </span>
          </p>
        )}

        <div className="space-y-4 print:flex print:flex-col print:gap-4 print:space-y-0">
        {benefit.caution && (
          <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-[13px] leading-relaxed print:order-first print:break-inside-avoid">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
            <span>{benefit.caution}</span>
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

        <div style={printSlot("scenarios").style} className={cn("space-y-3", printSlot("scenarios").className)}>
        <div data-tour="propose-scenarios" className="grid gap-3 md:grid-cols-3 print:grid-cols-3">
          {projections.map((p) => (
            <ScenarioCard
              key={p.scenario}
              p={p}
              life={spec.costs.life}
              averaged={!!factors}
              blank={!benefit.annual && !hasCost}
              focused={p.scenario === focus}
              onFocus={() => setFocus(p.scenario)}
            />
          ))}
        </div>
        {showBreakEven && <BreakEvenLine result={breakEvenResult} ready={ready} life={spec.costs.life} expectedRate={spec.rates.expected} module={mod} />}
        </div>

        <section
          data-tour="propose-chart"
          aria-label="Cumulative net benefit over time"
          style={printSlot("chart").style}
          className={cn("glass min-w-0 rounded-2xl p-5 print:break-inside-avoid", printSlot("chart").className)}
        >
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

        {showSensitivity && (
          <section
            aria-labelledby="sensitivity-title"
            style={printSlot("sensitivity").style}
            className={cn("glass min-w-0 rounded-2xl p-5 print:break-inside-avoid", printSlot("sensitivity").className)}
          >
            <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <h3 id="sensitivity-title" className="text-[15px] font-semibold tracking-tight">
                  Sensitivity · expected scenario
                </h3>
                <p className="max-w-xl text-xs text-muted-foreground">
                  Each input lowered and raised {adv.sensitivity.swing}% on its own, everything else as entered. The longest bars are the
                  assumptions the {adv.sensitivity.outcome === "roi" ? "ROI" : "NPV"} depends on most.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 print:hidden">
                <Segmented
                  label="Outcome"
                  size="sm"
                  value={adv.sensitivity.outcome}
                  onChange={(outcome) => update({ advanced: { ...adv, sensitivity: { ...adv.sensitivity, outcome } } })}
                  options={[
                    { value: "npv", label: "NPV" },
                    { value: "roi", label: "ROI" },
                  ]}
                />
                <Segmented
                  label="Swing"
                  size="sm"
                  value={String(adv.sensitivity.swing)}
                  onChange={(v) => update({ advanced: { ...adv, sensitivity: { ...adv.sensitivity, swing: Number(v) } } })}
                  options={SWINGS.map((n) => ({ value: String(n), label: `±${n}%` }))}
                />
              </div>
            </header>
            {!ready ? (
              <p className="text-[13px] text-muted-foreground">Shows once the benefit and costs are entered.</p>
            ) : !sensitivityResult ? (
              <p className="text-[13px] text-muted-foreground">ROI needs a cost to divide by; switch to NPV or enter a cost.</p>
            ) : sensitivityResult.bars.length ? (
              <>
                <SensitivityChart result={sensitivityResult} />
                {sensitivityResult.flat.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    No effect at ±{adv.sensitivity.swing}% (zero, or not part of the {adv.sensitivity.outcome === "roi" ? "ROI" : "NPV"}):{" "}
                    {sensitivityResult.flat.join(", ")}.
                  </p>
                )}
              </>
            ) : (
              <p className="text-[13px] text-muted-foreground">No input moves the outcome at ±{adv.sensitivity.swing}%.</p>
            )}
          </section>
        )}

        <div className="grid gap-4 lg:grid-cols-5 print:contents">
          <section
            aria-labelledby="table-title"
            style={printSlot("table").style}
            className={cn("glass min-w-0 rounded-2xl p-5 lg:col-span-3 print:break-inside-avoid", printSlot("table").className)}
          >
            <h3 id="table-title" className="text-[15px] font-semibold tracking-tight">
              Year by year · {focused.label.toLowerCase()}
            </h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Benefit at {formatRate(focused.multiplier)} of the estimate.<span className="print:hidden"> Switch scenarios with the chart’s control above.</span>
            </p>
            <YearTable p={focused} />
          </section>
          <section
            aria-labelledby="inputs-title"
            style={assumptions.style}
            className={cn("glass min-w-0 rounded-2xl p-5 lg:col-span-2 print:break-inside-avoid", assumptions.className, keyAssumptions && "print:hidden")}
          >
            <h3 id="inputs-title" className="mb-3 text-[15px] font-semibold tracking-tight">
              What went in
            </h3>
            <Inputs costs={spec.costs} rates={spec.rates} lines={benefit.lines} annual={benefit.annual} advanced={advancedRows(adv, mod, moduleData, breakEvenResult)} />
          </section>
        </div>

        {/* The board summary's short assumptions box: printout only (the screen always has the full list). */}
        {keyAssumptions && (
          <section style={assumptions.style} className={cn("hidden print:block print:break-inside-avoid", assumptions.className)} aria-label="Key assumptions">
            <KeyAssumptions costs={spec.costs} rates={spec.rates} annual={benefit.annual} moduleLabel={mod.label} advanced={advancedRows(adv, mod, moduleData, breakEvenResult)} />
          </section>
        )}

        <div data-tour="propose-notes" className="space-y-1.5 text-xs leading-relaxed text-tertiary-foreground print:order-last">
          {[...benefit.notes, ...advancedNotes].map((n) => (
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
        </div>
      </section>
    </div>
  )
}

// -- Advanced mode ----------------------------------------------------------------------------------------------------

function advancedNotesFor(adv: AdvancedSettings, mod: ProposalModule) {
  if (!adv.on) return []
  const notes: string[] = []
  const blend = mod.payerMix ? payerBlend(adv.payerMix) : null
  if (blend && !blend.missing.length)
    notes.push(`Advanced: payer mix applied to the national Medicare estimate (blended × ${blend.factor.toFixed(3)}). Shares and rate multipliers are the proposer’s assumptions, not published rates.`)
  if (!mod.ownTiming && rampActive(adv))
    notes.push(`Advanced: the benefit ramps up straight-line from year ${adv.ramp.start} to full in year ${adv.ramp.full} (proposer’s assumption).`)
  if (adv.escalation.benefit || adv.escalation.cost)
    notes.push(`Advanced: benefits change ${adv.escalation.benefit}% and running costs ${adv.escalation.cost}% a year, compounding from year 2 (proposer’s assumption); card figures marked “avg” are averages over the useful life.`)
  if (adv.breakeven)
    notes.push("Advanced: break-even volume re-runs this model’s expected scenario with every volume input scaled together (same mix, same prices and costs) to find the least volume whose cumulative cash reaches zero by the end of the useful life.")
  if (adv.sensitivity.on)
    notes.push(`Advanced: sensitivity re-runs the expected scenario with one input at a time lowered and raised ${adv.sensitivity.swing}%, everything else as entered. It shows which assumptions matter most, not how likely each change is.`)
  return notes
}

/** The module data's CMS wage index, for reimbursement modules that have one. */
const wageIndexIn = (data: unknown) => (data as { wageIndex?: HospitalWageIndex | null } | null)?.wageIndex ?? null

/** Advanced settings in force, for "What went in" and the key-assumptions box. */
function advancedRows(adv: AdvancedSettings, mod: ProposalModule, data: unknown, breakEvenResult: BreakEven | null): [string, string][] {
  if (!adv.on) return []
  const rows: [string, string][] = []
  if (adv.wageIndex && mod.wageIndex) {
    const wi = wageIndexIn(data)
    rows.push(wi ? [`Wage-index-adjusted for ${wi.hospital}`, `${wi.value.toFixed(4)} (${wi.year})`] : ["Wage index", "None published: national rate"])
  }
  if (breakEvenResult?.kind === "volume") rows.push(["Break-even volume", breakEvenResult.value])
  if (breakEvenResult?.kind === "unreachable") rows.push(["Break-even volume", "Not reachable within the useful life"])
  const blend = mod.payerMix ? payerBlend(adv.payerMix) : null
  if (blend && !blend.missing.length) rows.push(["Payer mix", `× ${blend.factor.toFixed(3)} blended`])
  if (!mod.ownTiming && rampActive(adv)) rows.push(["Ramp-up", `Year ${adv.ramp.start} → full in year ${adv.ramp.full}`])
  if (adv.escalation.benefit || adv.escalation.cost) rows.push(["Escalation", `Benefit ${adv.escalation.benefit}% · costs ${adv.escalation.cost}% a year`])
  return rows
}

/** Advanced mode's break-even volume: the one number, beside the scenario cards. */
function BreakEvenLine({
  result,
  ready,
  life,
  expectedRate,
  module,
}: {
  result: BreakEven | null
  ready: boolean
  life: number
  expectedRate: number
  module: ProposalModule
}) {
  const within = `within the ${life}-year useful life`
  return (
    <div className="glass flex flex-wrap items-center justify-between gap-x-6 gap-y-1 rounded-2xl px-5 py-3 print:break-inside-avoid">
      <div>
        <p className="text-[11px] font-medium tracking-wide text-tertiary-foreground uppercase">Break-even volume · expected scenario</p>
        <p className="text-xs text-muted-foreground">
          The least volume that pays back {within}, with costs and prices as entered{expectedRate !== 100 ? ` and the benefit at ${expectedRate}% of the estimate` : ""}.
        </p>
      </div>
      <div className="text-right">
        {!ready || !result ? (
          <p className="text-[13px] text-muted-foreground">Shows once the benefit and costs are entered.</p>
        ) : result.kind === "volume" ? (
          <>
            <p className="num text-[22px] leading-tight font-semibold tracking-tight">{result.value}</p>
            {result.detail && <p className="num text-xs text-muted-foreground">{result.detail}</p>}
          </>
        ) : result.kind === "unreachable" ? (
          <p className="max-w-xs text-[13px] font-medium">Not reachable: even 1,000 times the volume entered doesn’t pay back {within}.</p>
        ) : (
          <p className="max-w-xs text-[13px] text-muted-foreground">{module.label} has no volume to solve for.</p>
        )}
      </div>
    </div>
  )
}

/** A scenario multiplier as a percent: 0.7 → "70%". */
const formatRate = (multiplier: number) => `${Number((multiplier * 100).toFixed(1))}%`

function ScenarioCard({
  p,
  life,
  averaged,
  blank,
  focused,
  onFocus,
}: {
  p: Projection
  life: number
  /** Benefits or costs vary by year (Advanced), so the per-year stats are averages. */
  averaged: boolean
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
        <Stat label={averaged ? "Avg benefit a year" : "Benefit a year"} value={formatUsd(p.annualBenefit, { compact: true })} />
        <Stat label={averaged ? "Avg net a year" : "Net a year"} value={formatUsd(p.annualNet, { compact: true })} tone={p.annualNet} />
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
  advanced,
}: {
  costs: CostInputs
  rates: ScenarioRates
  lines: { label: string; detail?: string; amount: number }[]
  annual: number
  advanced: [string, string][]
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
      {advanced.length > 0 && (
        <div>
          <p className="text-[11px] font-medium tracking-wide text-tertiary-foreground uppercase">Advanced settings</p>
          <dl className="divide-y divide-border/60">{advanced.map(([label, value]) => <div key={label}>{row(label, value)}</div>)}</dl>
        </div>
      )}
    </div>
  )
}

/** The board summary's assumptions: the few numbers a reader needs, with the full list left to the finance version. */
function KeyAssumptions({
  costs,
  rates,
  annual,
  moduleLabel,
  advanced,
}: {
  costs: CostInputs
  rates: ScenarioRates
  annual: number
  moduleLabel: string
  advanced: [string, string][]
}) {
  const items: [string, string][] = [
    ["Benefit a year (estimate)", `${formatUsd(annual)} · ${moduleLabel.toLowerCase()}`],
    ["Up-front cost", formatUsd(costs.capital + costs.implementation)],
    ["Running cost a year", formatUsd(costs.maintenance)],
    ["Useful life · discount rate", `${costs.life} ${costs.life === 1 ? "year" : "years"} · ${costs.discountRate}%`],
    ["Scenario rates", SCENARIOS.map((s) => `${rates[s.id]}%`).join(" / ")],
    ...advanced,
  ]
  return (
    <div className="rounded-2xl border border-border p-4">
      <h3 className="mb-2 text-[15px] font-semibold tracking-tight">Key assumptions</h3>
      <dl className="num grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13px]">
        {items.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
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
