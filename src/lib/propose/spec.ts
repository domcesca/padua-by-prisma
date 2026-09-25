import { DEFAULT_COSTS, MAX_LIFE, type CostInputs } from "./engine"

// A proposal lives in the URL: no accounts, nothing saved on the server. Reloading keeps it and
// the link can be sent on. Module inputs ride along under their module's own keys.

export type ProposalSpec = {
  facilityId: string | null
  name: string
  module: string
  costs: CostInputs
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
    module: mod && modules.includes(mod) ? mod : DEFAULT_MODULE,
    costs: {
      capital: num(params.get(COST_KEYS.capital), DEFAULT_COSTS.capital, 0, 1e10),
      implementation: num(params.get(COST_KEYS.implementation), DEFAULT_COSTS.implementation, 0, 1e10),
      maintenance: num(params.get(COST_KEYS.maintenance), DEFAULT_COSTS.maintenance, 0, 1e10),
      life: Math.round(num(params.get(COST_KEYS.life), DEFAULT_COSTS.life, 1, MAX_LIFE)),
      discountRate: num(params.get(COST_KEYS.discountRate), DEFAULT_COSTS.discountRate, 0, 50),
    },
  }
}

export function proposalSpecToParams(spec: ProposalSpec, moduleParams: Record<string, string>) {
  const params = new URLSearchParams()
  if (spec.facilityId) params.set("facility", spec.facilityId)
  if (spec.name.trim()) params.set("name", spec.name.trim())
  params.set("module", spec.module)
  for (const [key, param] of Object.entries(COST_KEYS) as [keyof CostInputs, string][]) {
    if (spec.costs[key] !== DEFAULT_COSTS[key]) params.set(param, String(spec.costs[key]))
  }
  for (const [k, v] of Object.entries(moduleParams)) if (v) params.set(k, v)
  return params
}
