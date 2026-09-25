// Propose's shared financial math. Every proposal, whatever module estimates its benefit, runs
// through here: an up-front outlay, a yearly benefit and upkeep over the useful life, and the
// usual summary numbers. Pure functions, no data access, so it runs on the client as you type.
//
// Conventions (spelled out on the page, too):
//  * Year 0 is the outlay: capital plus implementation. Years 1..life each bring the full
//    annual benefit and maintenance; there's no ramp-up in V6.0.
//  * Cash, not accounting: payback, cumulative net, ROI, and NPV use cash flows. Straight-line
//    amortization of the outlay is shown alongside as the annual accounting view.
//  * Scenarios scale the module's annual benefit only (by an editable rate, 70% / 100% / 130% unless changed);
//    costs are taken as given.
//  * Advanced mode (optional): per-year factors on the benefit (ramp-up, escalation) and on running costs
//    (escalation). Without them every year is the same, exactly as above; with them the per-year stats on the cards
//    ("benefit a year", "net a year") are averages over the useful life.

export type CostInputs = {
  /** Equipment, construction: paid up front. */
  capital: number
  /** Training, installation, go-live: paid up front. */
  implementation: number
  /** Service contracts, licenses, supplies: every year of the useful life. */
  maintenance: number
  /** Years the investment is expected to pay out over (and be amortized across). */
  life: number
  /** Annual discount rate for NPV, as a percent. */
  discountRate: number
}

export const DEFAULT_COSTS: CostInputs = { capital: 0, implementation: 0, maintenance: 0, life: 5, discountRate: 5 }
export const MAX_LIFE = 30

export type ScenarioId = "conservative" | "expected" | "optimistic"

export const SCENARIOS: { id: ScenarioId; label: string }[] = [
  { id: "conservative", label: "Conservative" },
  { id: "expected", label: "Expected" },
  { id: "optimistic", label: "Optimistic" },
]

/** Each scenario's benefit as a percent of the module's estimate. */
export type ScenarioRates = Record<ScenarioId, number>
export const DEFAULT_SCENARIO_RATES: ScenarioRates = { conservative: 70, expected: 100, optimistic: 130 }
export const MAX_SCENARIO_RATE = 1000

/** Optional per-year multipliers, index 0 = year 1. Missing entries (or no factors at all) mean 1. */
export type YearFactors = { benefit?: number[]; cost?: number[] }

export type YearRow = {
  year: number
  benefit: number
  cost: number
  net: number
  cumulative: number
  /** This year's net, discounted to today. */
  present: number
}

export type Projection = {
  scenario: ScenarioId
  label: string
  multiplier: number
  /** Benefit a year (the average over the life when year factors apply). */
  annualBenefit: number
  upfront: number
  /** Benefit minus maintenance a year (the average over the life when year factors apply). */
  annualNet: number
  /** Up-front cost spread evenly over the useful life. */
  annualAmortization: number
  /** Annual net after amortization: the yearly accounting view. */
  annualNetAfterAmortization: number
  rows: YearRow[]
  /** Cumulative cash net at the end of the useful life. */
  cumulativeNet: number
  totalBenefit: number
  totalCost: number
  /** Years (fractional) until cumulative net turns non-negative; null if it never does within the life. */
  paybackYears: number | null
  /** (total benefit − total cost) ÷ total cost over the life; null when there's no cost. */
  roi: number | null
  npv: number
}

const clean = (n: number) => (Number.isFinite(n) ? n : 0)

export function project(
  annualBenefit: number,
  costs: CostInputs,
  scenario: { id: ScenarioId; label: string; multiplier: number },
  factors?: YearFactors
): Projection {
  const life = Math.min(MAX_LIFE, Math.max(1, Math.round(clean(costs.life))))
  const capital = Math.max(0, clean(costs.capital))
  const implementation = Math.max(0, clean(costs.implementation))
  const maintenance = Math.max(0, clean(costs.maintenance))
  const rate = Math.max(0, clean(costs.discountRate)) / 100
  const benefit = clean(annualBenefit) * scenario.multiplier
  const upfront = capital + implementation
  const factor = (list: number[] | undefined, year: number) => (list ? Math.max(0, clean(list[year - 1] ?? 1)) : 1)

  const rows: YearRow[] = [{ year: 0, benefit: 0, cost: upfront, net: -upfront, cumulative: -upfront, present: -upfront }]
  for (let year = 1; year <= life; year++) {
    const b = benefit * factor(factors?.benefit, year)
    const c = maintenance * factor(factors?.cost, year)
    const net = b - c
    rows.push({ year, benefit: b, cost: c, net, cumulative: rows[year - 1].cumulative + net, present: net / (1 + rate) ** year })
  }

  // Payback: when cumulative cash turns non-negative for good. Never negative → immediate; still negative at the
  // end → not within the life. Otherwise interpolate within the year after the last negative one.
  let paybackYears: number | null
  const lastNegative = rows.findLastIndex((r) => r.cumulative < 0)
  if (lastNegative < 0) paybackYears = 0
  else if (lastNegative >= life) paybackYears = null
  else {
    const next = rows[lastNegative + 1]
    paybackYears = next.net > 0 ? lastNegative + -rows[lastNegative].cumulative / next.net : lastNegative + 1
  }

  const years = rows.slice(1)
  const totalBenefit = years.reduce((t, r) => t + r.benefit, 0)
  const totalCost = upfront + years.reduce((t, r) => t + r.cost, 0)
  const annualNet = (totalBenefit - (totalCost - upfront)) / life
  return {
    scenario: scenario.id,
    label: scenario.label,
    multiplier: scenario.multiplier,
    annualBenefit: totalBenefit / life,
    upfront,
    annualNet,
    annualAmortization: upfront / life,
    annualNetAfterAmortization: annualNet - upfront / life,
    rows,
    cumulativeNet: rows[life].cumulative,
    totalBenefit,
    totalCost,
    paybackYears,
    roi: totalCost > 0 ? (totalBenefit - totalCost) / totalCost : null,
    npv: rows.reduce((sum, r) => sum + r.present, 0),
  }
}

/** All three scenarios for one annual benefit, conservative first. */
export const projectAll = (annualBenefit: number, costs: CostInputs, rates: ScenarioRates = DEFAULT_SCENARIO_RATES, factors?: YearFactors) =>
  SCENARIOS.map((s) => project(annualBenefit, costs, { ...s, multiplier: Math.max(0, clean(rates[s.id])) / 100 }, factors))

/** "2.4 years", "under a month", or null → "not within N years". */
export function formatPayback(years: number | null, life: number) {
  if (years == null) return `Not within ${life} ${life === 1 ? "year" : "years"}`
  if (years === 0) return "Immediate"
  if (years < 1 / 12) return "Under a month"
  if (years < 1) return `${Math.round(years * 12)} months`
  return `${years.toFixed(1)} years`
}
