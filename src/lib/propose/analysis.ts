import { missingText, payerBlend, yearFactors, type AdvancedSettings, type SensitivityOutcome } from "./advanced"
import { MAX_LIFE, project, SCENARIOS, type CostInputs, type Projection, type ScenarioRates } from "./engine"
import type { Benefit, BenefitContext, ProposalModule } from "./module"

// The whole model in one place: a module's benefit (with Advanced mode's payer mix) run through the engine. The page
// uses it for the results, and Advanced mode's break-even volume and sensitivity analysis re-run it with one input
// changed at a time. Nothing here adds data or assumptions: both read-outs are the same model, re-computed.

export type Model = {
  module: ProposalModule
  state: unknown
  data: unknown
  costs: CostInputs
  rates: ScenarioRates
  advanced: AdvancedSettings
}

export const benefitContext = (m: Pick<Model, "costs" | "advanced">): BenefitContext => ({
  life: m.costs.life,
  advanced: m.advanced.on,
  wageIndex: m.advanced.on && m.advanced.wageIndex,
})

/** Payer-mix weighting for reimbursement modules: one more benefit line, so the lines still add up to the total. */
export function withPayerMix(benefit: Benefit, mod: ProposalModule, adv: AdvancedSettings): Benefit {
  const blend = adv.on && mod.payerMix ? payerBlend(adv.payerMix) : null
  if (!blend || !benefit.annual) return benefit
  if (blend.missing.length)
    return { ...benefit, incomplete: benefit.incomplete ?? `Advanced payer mix: enter what ${missingText(blend.missing)} vs Medicare.` }
  return {
    ...benefit,
    annual: benefit.annual * blend.factor,
    lines: [...benefit.lines, { label: "Payer mix adjustment (advanced)", detail: `× ${blend.factor.toFixed(3)} blended: ${blend.detail}`, amount: benefit.annual * (blend.factor - 1) }],
  }
}

/** The module's benefit as the results use it. */
export const modelBenefit = (m: Model) => withPayerMix(m.module.benefit(m.state, m.data, benefitContext(m)), m.module, m.advanced)

const expectedRate = (rates: ScenarioRates) => Math.max(0, Number.isFinite(rates.expected) ? rates.expected : 0) / 100

/** The expected scenario's projection, with the benefit optionally scaled (a price change). */
function expected(m: Model, benefitScale = 1): Projection {
  const annual = modelBenefit(m).annual * benefitScale
  const factors = yearFactors(m.advanced, m.costs.life, !!m.module.ownTiming)
  const s = SCENARIOS.find((x) => x.id === "expected")!
  return project(annual, m.costs, { ...s, multiplier: expectedRate(m.rates) }, factors)
}

// -- Break-even volume --------------------------------------------------------------------------------------------------

export type BreakEven =
  /** k: the multiple of the entered volume at which the expected scenario pays back within the useful life. */
  | { kind: "volume"; k: number; value: string; detail?: string }
  /** Even many times the entered volume doesn't pay back (the benefit doesn't grow with volume, or costs outrun it). */
  | { kind: "unreachable" }
  | { kind: "unavailable" }

const MAX_K = 1000

/**
 * The smallest multiple k of the entered volume whose expected scenario ends the useful life with cumulative cash at
 * or above zero (payback within the life). Scans upward and then bisects, so it also handles benefits that aren't
 * straight lines in volume (penalties are capped and all-or-nothing).
 */
export function breakEven(m: Model): BreakEven {
  const vol = m.module.volume
  if (!vol) return { kind: "unavailable" }
  const net = (k: number) => expected({ ...m, state: vol.scale(m.state, k, m.data) }).cumulativeNet
  const grid = [...Array.from({ length: 41 }, (_, i) => i * 0.05), ...Array.from({ length: 40 }, (_, i) => 2 * 1.2 ** (i + 1))].filter((k) => k <= MAX_K)
  let prev = 0
  for (const k of grid) {
    if (net(k) >= 0) {
      if (k === 0) return { kind: "volume", k: 0, ...vol.describe(m.state, m.data, 0) }
      let [lo, hi] = [prev, k]
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2
        if (net(mid) >= 0) hi = mid
        else lo = mid
      }
      return { kind: "volume", k: hi, ...vol.describe(m.state, m.data, hi) }
    }
    prev = k
  }
  return { kind: "unreachable" }
}

// -- Sensitivity (tornado) ----------------------------------------------------------------------------------------------

export type SensitivityBar = {
  id: string
  label: string
  /** What the input was set to at each end, when that's clearer than "−20%" (e.g. useful life in whole years). */
  lowText?: string
  highText?: string
  /** The outcome with the input lowered and raised. */
  low: number
  high: number
}

export type Sensitivity = {
  outcome: SensitivityOutcome
  swing: number
  base: number
  /** Ranked by how far the outcome moves, largest first; inputs that don't move it are left out. */
  bars: SensitivityBar[]
  /** Inputs that were tried but don't move the outcome (zero, or not used by it). */
  flat: string[]
}

type Variant = { state?: unknown; costs?: CostInputs; advanced?: AdvancedSettings; benefitScale?: number; text?: [string, string] }

export function sensitivity(m: Model): Sensitivity | null {
  const { swing, outcome } = m.advanced.sensitivity
  const read = (p: Projection) => (outcome === "roi" ? p.roi : p.npv)
  const base = read(expected(m))
  if (base == null) return null
  const run = (v: Variant) => {
    const model = { ...m, state: v.state ?? m.state, costs: v.costs ?? m.costs, advanced: v.advanced ?? m.advanced }
    return read(expected(model, v.benefitScale ?? 1)) ?? base
  }
  const s = swing / 100
  const inputs: { id: string; label: string; at: (f: number) => Variant }[] = []

  const vol = m.module.volume
  if (vol) inputs.push({ id: "volume", label: vol.label, at: (f) => ({ state: vol.scale(m.state, f, m.data) }) })
  for (const d of m.module.drivers?.(m.state, m.data, benefitContext(m)) ?? []) {
    inputs.push({ id: d.id, label: d.label, at: (f) => (d.apply ? { state: d.apply(m.state, f) } : { benefitScale: f }) })
  }
  const c = m.costs
  inputs.push({
    id: "upfront",
    label: "Up-front cost",
    at: (f) => ({ costs: { ...c, capital: c.capital * f, implementation: c.implementation * f } }),
  })
  inputs.push({ id: "running", label: "Running costs", at: (f) => ({ costs: { ...c, maintenance: c.maintenance * f } }) })
  inputs.push({
    id: "life",
    label: "Useful life",
    at: (f) => {
      const life = Math.min(MAX_LIFE, Math.max(1, Math.round(c.life * f)))
      return { costs: { ...c, life }, text: [`${life} yr`, `${life} yr`] }
    },
  })
  if (outcome === "npv") inputs.push({ id: "discount", label: "Discount rate", at: (f) => ({ costs: { ...c, discountRate: c.discountRate * f } }) })
  const esc = m.advanced.on ? m.advanced.escalation : { benefit: 0, cost: 0 }
  if (esc.benefit)
    inputs.push({ id: "escb", label: "Benefit growth", at: (f) => ({ advanced: { ...m.advanced, escalation: { ...esc, benefit: esc.benefit * f } } }) })
  if (esc.cost) inputs.push({ id: "escc", label: "Running-cost growth", at: (f) => ({ advanced: { ...m.advanced, escalation: { ...esc, cost: esc.cost * f } } }) })

  const bars: SensitivityBar[] = []
  const flat: string[] = []
  for (const input of inputs) {
    const lo = input.at(1 - s)
    const hi = input.at(1 + s)
    const bar: SensitivityBar = { id: input.id, label: input.label, low: run(lo), high: run(hi) }
    if (input.id === "life") [bar.lowText, bar.highText] = [lo.text![0], hi.text![0]]
    if (Math.abs(bar.high - bar.low) < (outcome === "roi" ? 1e-6 : 0.5)) flat.push(input.label)
    else bars.push(bar)
  }
  bars.sort((a, b) => Math.abs(b.high - b.low) - Math.abs(a.high - a.low))
  return { outcome, swing, base, bars, flat }
}
