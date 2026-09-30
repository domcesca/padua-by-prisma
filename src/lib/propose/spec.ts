import {
  DEFAULT_COSTS,
  DEFAULT_SCENARIO_RATES,
  MAX_LIFE,
  MAX_SCENARIO_RATE,
  SCENARIOS,
  type CostInputs,
  type ScenarioRates,
} from "./engine"
import { advancedToParams, parseAdvanced, type AdvancedSettings } from "./advanced"
import { outputToParam, parseOutput, type OutputConfig } from "./output"

// A proposal lives in the URL: no accounts, nothing saved on the server. Reloading keeps it and
// the link can be sent on. Module inputs ride along under their module's own keys.
//
// V7.6: the guided flow's step (`step=1..4`) and whether the benefit method is confirmed (`pick=manual`, picked by
// hand; `pick=confirmed`, the suggestion accepted) ride along too. A link without `step` predates the flow: it opens
// where its contents say (results if it has costs, the benefit step if it has a method, else the start), and a method
// it names counts as confirmed, since the old page applied it. Links from Compare's hospital priorities carry
// `pick=manual`, so they land on the benefit step with the method already confirmed and the inputs prefilled.

export type ProposalSpec = {
  facilityId: string | null
  name: string
  /** "Describe what you're proposing": free text the module suggestion reads. */
  description: string
  module: string
  /** The module was picked by hand, so the description's suggestion no longer changes it. */
  manualModule: boolean
  /** V7.6: the proposer confirmed how the benefit is estimated (picking by hand confirms too). */
  confirmed: boolean
  /** V7.6: the guided flow's step, 1–4. */
  step: FlowStep
  costs: CostInputs
  /** Conservative / Expected / Optimistic, as percents of the estimate. */
  rates: ScenarioRates
  /** What the printout includes, and in what order. */
  output: OutputConfig
  /** Advanced mode: payer mix, ramp-up, escalation. Off (and inert) by default. */
  advanced: AdvancedSettings
}

export const DEFAULT_MODULE = "reimbursement"

export type FlowStep = 1 | 2 | 3 | 4
export const FLOW_STEPS: { step: FlowStep; label: string; short: string }[] = [
  { step: 1, label: "Define the initiative", short: "Define" },
  { step: 2, label: "Estimate benefits", short: "Benefits" },
  { step: 3, label: "Enter costs and assumptions", short: "Costs" },
  { step: 4, label: "Review scenarios", short: "Review" },
]
const COST_KEYS: Record<keyof CostInputs, string> = {
  capital: "capital",
  implementation: "impl",
  maintenance: "maint",
  life: "life",
  discountRate: "rate",
}

function num(raw: string | null, fallback: number, min: number, max: number) {
  if (raw == null || raw.trim() === "") return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

export function parseProposalSpec(params: URLSearchParams, modules: string[]): ProposalSpec {
  const mod = params.get("module")
  const pick = params.get("pick")
  // Links from before the intake had a module but no description: that module was chosen by hand.
  const manualModule = pick === "manual" || (params.has("module") && !params.has("desc") && !params.has("out"))
  const legacy = !params.has("step")
  const hasCost = ["capital", "impl", "maint"].some((k) => Number(params.get(k)) > 0)
  const rawStep = Number(params.get("step"))
  const step: FlowStep = !legacy && [1, 2, 3, 4].includes(rawStep) ? (rawStep as FlowStep) : legacy && hasCost ? 4 : legacy && params.has("module") ? 2 : 1
  return {
    facilityId: params.get("facility")?.match(/^\d{9}$/) ? params.get("facility") : null,
    name: (params.get("name") ?? "").slice(0, 120),
    description: (params.get("desc") ?? "").slice(0, 300),
    module: mod && modules.includes(mod) ? mod : DEFAULT_MODULE,
    manualModule,
    confirmed: manualModule || pick === "confirmed" || (legacy && params.has("module") && !!mod && modules.includes(mod)),
    step,
    costs: {
      capital: num(params.get(COST_KEYS.capital), DEFAULT_COSTS.capital, 0, 1e10),
      implementation: num(params.get(COST_KEYS.implementation), DEFAULT_COSTS.implementation, 0, 1e10),
      maintenance: num(params.get(COST_KEYS.maintenance), DEFAULT_COSTS.maintenance, 0, 1e10),
      life: Math.round(num(params.get(COST_KEYS.life), DEFAULT_COSTS.life, 1, MAX_LIFE)),
      discountRate: num(params.get(COST_KEYS.discountRate), DEFAULT_COSTS.discountRate, 0, 50),
    },
    rates: parseRates(params.get("scen")),
    // A link with a proposal but no output setting predates it: keep its full printout.
    output: parseOutput(params.get("out"), params.has("module")),
    advanced: parseAdvanced(params, MAX_LIFE),
  }
}

/** "scen=60,100,140": conservative, expected, optimistic. A missing or bad part keeps its default. */
function parseRates(raw: string | null): ScenarioRates {
  const parts = (raw ?? "").split(",")
  return Object.fromEntries(
    SCENARIOS.map((s, i) => [s.id, num(parts[i] ?? null, DEFAULT_SCENARIO_RATES[s.id], 0, MAX_SCENARIO_RATE)])
  ) as ScenarioRates
}

export function proposalSpecToParams(spec: ProposalSpec, moduleParams: Record<string, string>) {
  const params = new URLSearchParams()
  if (spec.facilityId) params.set("facility", spec.facilityId)
  if (spec.name.trim()) params.set("name", spec.name.trim())
  if (spec.description.trim()) params.set("desc", spec.description.trim())
  params.set("module", spec.module)
  if (spec.manualModule) params.set("pick", "manual")
  else if (spec.confirmed) params.set("pick", "confirmed")
  params.set("step", String(spec.step))
  for (const [key, param] of Object.entries(COST_KEYS) as [keyof CostInputs, string][]) {
    if (spec.costs[key] !== DEFAULT_COSTS[key]) params.set(param, String(spec.costs[key]))
  }
  if (SCENARIOS.some((s) => spec.rates[s.id] !== DEFAULT_SCENARIO_RATES[s.id])) {
    params.set("scen", SCENARIOS.map((s) => spec.rates[s.id]).join(","))
  }
  params.set("out", outputToParam(spec.output))
  advancedToParams(spec.advanced, params)
  for (const [k, v] of Object.entries(moduleParams)) if (v) params.set(k, v)
  return params
}
