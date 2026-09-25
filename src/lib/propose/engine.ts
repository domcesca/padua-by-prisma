// Propose's shared financial math. Every proposal, whatever module estimates its benefit, runs
// through here: an up-front outlay, a yearly benefit and upkeep over the useful life, and the
// usual summary numbers. Pure functions, no data access, so it runs on the client as you type.
//
// Conventions (spelled out on the page, too):
//  * Year 0 is the outlay: capital plus implementation. Years 1..life each bring the full
//    annual benefit and maintenance; there's no ramp-up in V6.0.
//  * Cash, not accounting: payback, cumulative net, ROI, and NPV use cash flows. Straight-line
//    amortization of the outlay is shown alongside as the annual accounting view.
//  * Scenarios scale the module's annual benefit only; costs are taken as given.

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

export const SCENARIOS: { id: ScenarioId; label: string; multiplier: number }[] = [
  { id: "conservative", label: "Conservative", multiplier: 0.7 },
  { id: "expected", label: "Expected", multiplier: 1 },
  { id: "optimistic", label: "Optimistic", multiplier: 1.3 },
]

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
  annualBenefit: number
  upfront: number
  /** Benefit minus maintenance, each year. */
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

export function project(annualBenefit: number, costs: CostInputs, scenario: (typeof SCENARIOS)[number]): Projection {
  const life = Math.min(MAX_LIFE, Math.max(1, Math.round(clean(costs.life))))
  const capital = Math.max(0, clean(costs.capital))
  const implementation = Math.max(0, clean(costs.implementation))
  const maintenance = Math.max(0, clean(costs.maintenance))
  const rate = Math.max(0, clean(costs.discountRate)) / 100
  const benefit = clean(annualBenefit) * scenario.multiplier
  const upfront = capital + implementation
  const annualNet = benefit - maintenance

  const rows: YearRow[] = [{ year: 0, benefit: 0, cost: upfront, net: -upfront, cumulative: -upfront, present: -upfront }]
  for (let year = 1; year <= life; year++) {
    const cumulative = rows[year - 1].cumulative + annualNet
    rows.push({ year, benefit, cost: maintenance, net: annualNet, cumulative, present: annualNet / (1 + rate) ** year })
  }

  let paybackYears: number | null = null
  if (upfront <= 0 && annualNet >= 0) paybackYears = 0
  else {
    const hit = rows.findIndex((r) => r.year > 0 && r.cumulative >= 0)
    if (hit > 0 && annualNet > 0) paybackYears = hit - 1 + -rows[hit - 1].cumulative / annualNet
  }

  const totalBenefit = benefit * life
  const totalCost = upfront + maintenance * life
  return {
    scenario: scenario.id,
    label: scenario.label,
    multiplier: scenario.multiplier,
    annualBenefit: benefit,
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
export const projectAll = (annualBenefit: number, costs: CostInputs) => SCENARIOS.map((s) => project(annualBenefit, costs, s))

/** "2.4 years", "under a month", or null → "not within N years". */
export function formatPayback(years: number | null, life: number) {
  if (years == null) return `Not within ${life} ${life === 1 ? "year" : "years"}`
  if (years === 0) return "Immediate"
  if (years < 1 / 12) return "Under a month"
  if (years < 1) return `${Math.round(years * 12)} months`
  return `${years.toFixed(1)} years`
}
