import {
  DEFAULT_COSTS,
  DEFAULT_SCENARIO_RATES,
  MAX_LIFE,
  MAX_SCENARIO_RATE,
  SCENARIOS,
  type CostInputs,
  type ScenarioRates,
} from "./engine"
import { outputToParam, parseOutput, type OutputConfig } from "./output"

// A proposal lives in the URL: no accounts, nothing saved on the server. Reloading keeps it and
// the link can be sent on. Module inputs ride along under their module's own keys.

export type ProposalSpec = {
  facilityId: string | null
  name: string
  /** "Describe what you're proposing": free text the module suggestion reads. */
  description: string
  module: string
  /** The module was picked by hand, so the description's suggestion no longer changes it. */
  manualModule: boolean
  costs: CostInputs
  /** Conservative / Expected / Optimistic, as percents of the estimate. */
  rates: ScenarioRates
  /** What the printout includes, and in what order. */
  output: OutputConfig
}

export const DEFAULT_MODULE = "reimbursement"
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
  return {
    facilityId: params.get("facility")?.match(/^\d{9}$/) ? params.get("facility") : null,
    name: (params.get("name") ?? "").slice(0, 120),
    description: (params.get("desc") ?? "").slice(0, 300),
    module: mod && modules.includes(mod) ? mod : DEFAULT_MODULE,
    // Links from before the intake had a module but no description: that module was chosen by hand.
    manualModule: params.get("pick") === "manual" || (params.has("module") && !params.has("desc") && !params.has("out")),
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
  for (const [key, param] of Object.entries(COST_KEYS) as [keyof CostInputs, string][]) {
    if (spec.costs[key] !== DEFAULT_COSTS[key]) params.set(param, String(spec.costs[key]))
  }
  if (SCENARIOS.some((s) => spec.rates[s.id] !== DEFAULT_SCENARIO_RATES[s.id])) {
    params.set("scen", SCENARIOS.map((s) => spec.rates[s.id]).join(","))
  }
  params.set("out", outputToParam(spec.output))
  for (const [k, v] of Object.entries(moduleParams)) if (v) params.set(k, v)
  return params
}
