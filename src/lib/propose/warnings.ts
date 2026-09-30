import { formatUsd } from "../format"
import { rampActive } from "./advanced"
import { benefitContext, type Model } from "./analysis"
import { DEFAULT_COSTS, type Projection } from "./engine"
import type { Benefit } from "./module"
import type { FlowStep } from "./spec"

// Checks on a business case (V7.6) that flag, never block: the proposer can carry on, but sees what a reviewer would
// ask about. Each names the step where the input lives, so the flow can show it there and the panel can link to it.

export type Warning = { id: string; step: FlowStep; text: string }

/** Equipment rarely lasts longer than this; a longer life stretches the payback math. */
const LONG_LIFE = 15

export function proposalWarnings({
  model,
  benefit,
  projections,
  confirmed,
}: {
  model: Model
  benefit: Benefit
  projections: Projection[]
  confirmed: boolean
}): Warning[] {
  const { costs, advanced: adv, module: mod } = model
  const out: Warning[] = []
  const upfront = costs.capital + costs.implementation

  // Only once there's a benefit to weigh them against: a blank case isn't missing anything yet.
  if (confirmed && benefit.annual !== 0 && upfront + costs.maintenance === 0)
    out.push({ id: "zero-cost", step: 3, text: "No costs entered: payback reads as immediate and ROI can't be worked out. Most initiatives cost something up front or to run." })

  if (confirmed && mod.warnings) {
    for (const [i, text] of mod.warnings(model.state as never, model.data as never, benefitContext(model)).entries()) {
      // A module's useful-life check belongs with the costs; volume checks with the benefit.
      out.push({ id: `module-${i}`, step: text.startsWith("Useful life") ? 3 : 2, text })
    }
  }

  if (confirmed && benefit.annual < 0)
    out.push({ id: "negative-benefit", step: 2, text: `The estimated benefit is negative (${formatUsd(benefit.annual)} a year): what's subtracted outweighs what's gained.` })
  const expected = projections.find((p) => p.scenario === "expected")
  if (confirmed && expected && benefit.annual > 0 && expected.annualNet < 0)
    out.push({
      id: "negative-margin",
      step: 3,
      text: `Running costs exceed the benefit: the expected case loses ${formatUsd(-expected.annualNet)} a year before the up-front cost, so it never pays back.`,
    })

  if (costs.discountRate !== DEFAULT_COSTS.discountRate)
    out.push({
      id: "discount-rate",
      step: 3,
      text: `The discount rate is ${costs.discountRate}%, changed from the default ${DEFAULT_COSTS.discountRate}%. NPV moves with it; note the reason (the hospital's cost of capital, a finance policy).`,
    })

  if (adv.on && !mod.ownTiming && rampActive(adv) && adv.ramp.full > costs.life)
    out.push({ id: "life-ramp", step: 3, text: `Useful life: the ramp-up reaches full benefit in year ${adv.ramp.full}, after the ${costs.life}-year useful life ends.` })
  if (costs.capital > 0 && costs.life > LONG_LIFE)
    out.push({ id: "life-long", step: 3, text: `Useful life: ${costs.life} years is longer than most equipment lasts (10–15 years); a shorter life lowers ROI and NPV.` })

  return out
}
