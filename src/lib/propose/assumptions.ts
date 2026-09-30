import { formatPercent, formatUsd } from "../format"
import { payerBlend, PAYERS, rampActive, type AdvancedSettings } from "./advanced"
import { benefitContext, type BreakEven, type Model } from "./analysis"
import { DEFAULT_COSTS, formatPayback, SCENARIOS, type Projection } from "./engine"
import type { AssumptionItem, Benefit } from "./module"
import type { HospitalWageIndex } from "./wage-index"

// A business case's assumption sheet (V7.6): everything the numbers rest on, in three kinds, so a reader can trace each
// figure back. Public data is what CMS or HCAI published; inputs are what the proposer entered or chose; outputs are
// what Padua worked out from the two. The always-visible panel, the printed sheet and the CSV all read this, so they
// never disagree. Nothing here computes anything the results don't already show.

export type AssumptionSheet = {
  publicData: AssumptionItem[]
  inputs: AssumptionItem[]
  outputs: AssumptionItem[]
}

export const SHEET_KINDS: { key: keyof AssumptionSheet; label: string; help: string }[] = [
  { key: "publicData", label: "Public data", help: "Published by CMS or HCAI" },
  { key: "inputs", label: "Your inputs", help: "Entered or chosen in this business case" },
  { key: "outputs", label: "Calculated", help: "Worked out by Padua from the two above" },
]

const wageIndexIn = (data: unknown) => (data as { wageIndex?: HospitalWageIndex | null } | null)?.wageIndex ?? null

function advancedInputs(adv: AdvancedSettings, model: Model): AssumptionItem[] {
  if (!adv.on) return []
  const mod = model.module
  const out: AssumptionItem[] = [{ label: "Advanced mode", value: "On" }]
  const blend = mod.payerMix ? payerBlend(adv.payerMix) : null
  if (blend) {
    for (const r of adv.payerMix.filter((x) => x.share > 0))
      out.push({ label: `Payer mix, ${PAYERS.find((p) => p.id === r.id)!.label}`, value: `${r.share}% of cases × ${r.multiplier == null ? "?" : r.multiplier.toFixed(2)} of Medicare` })
  }
  if (!mod.ownTiming && rampActive(adv)) out.push({ label: "Ramp-up", value: `From year ${adv.ramp.start}, full in year ${adv.ramp.full}` })
  if (adv.escalation.benefit || adv.escalation.cost) out.push({ label: "Escalation a year", value: `Benefit ${adv.escalation.benefit}%, running costs ${adv.escalation.cost}%` })
  if (adv.wageIndex && mod.wageIndex) out.push({ label: "Wage index adjustment", value: "On" })
  if (adv.sensitivity.on) out.push({ label: "Sensitivity", value: `±${adv.sensitivity.swing}% on ${adv.sensitivity.outcome === "roi" ? "ROI" : "NPV"}` })
  return out
}

export function buildAssumptionSheet({
  model,
  benefit,
  projections,
  facilityName,
  breakEvenResult,
  confirmed,
}: {
  model: Model
  benefit: Benefit
  projections: Projection[]
  facilityName: string | null
  breakEvenResult: BreakEven | null
  /** The benefit method is confirmed: until then the estimate isn't counted. */
  confirmed: boolean
}): AssumptionSheet {
  const { module: mod, costs, rates, advanced: adv } = model
  const ctx = benefitContext(model)
  const own = confirmed && mod.assumptions ? mod.assumptions(model.state as never, model.data as never, ctx) : { publicData: [], inputs: [] }

  const publicData = [...own.publicData]
  // Advanced mode's wage index is public data even when the module lists its own (dedupe by label).
  const wi = adv.on && adv.wageIndex && mod.wageIndex ? wageIndexIn(model.data) : null
  if (wi && !publicData.some((p) => p.label.startsWith("Wage index"))) publicData.push({ label: `Wage index, ${wi.hospital}`, value: wi.value.toFixed(4), source: `CMS ${wi.table}` })

  const inputs: AssumptionItem[] = [
    { label: "Hospital", value: facilityName ?? "None chosen" },
    { label: "Benefit method", value: confirmed ? mod.label : `${mod.label} (not yet confirmed)` },
    ...own.inputs,
    { label: "Capital outlay", value: formatUsd(costs.capital) },
    { label: "Implementation", value: formatUsd(costs.implementation) },
    { label: "Maintenance and running costs", value: `${formatUsd(costs.maintenance)} a year` },
    { label: "Useful life", value: `${costs.life} ${costs.life === 1 ? "year" : "years"}` },
    { label: "Discount rate", value: `${costs.discountRate}%${costs.discountRate !== DEFAULT_COSTS.discountRate ? ` (default ${DEFAULT_COSTS.discountRate}%)` : ""}` },
    { label: "Scenario rates", value: SCENARIOS.map((s) => `${s.label} ${rates[s.id]}%`).join(", ") },
    ...advancedInputs(adv, model),
  ]

  const expected = projections.find((p) => p.scenario === "expected")!
  const outputs: AssumptionItem[] = confirmed
    ? [
        { label: "Estimated benefit a year", value: formatUsd(benefit.annual) },
        { label: "Up-front cost", value: formatUsd(expected.upfront) },
        ...projections.map((p) => ({
          label: `${p.label}: payback, ROI, NPV`,
          value: `${formatPayback(p.paybackYears, costs.life)}; ${p.roi == null ? "—" : formatPercent(p.roi, 0)}; ${formatUsd(p.npv)}`,
        })),
      ]
    : []
  if (confirmed && breakEvenResult?.kind === "volume") outputs.push({ label: "Break-even volume (expected)", value: `${breakEvenResult.value}${breakEvenResult.detail ? ` (${breakEvenResult.detail})` : ""}` })
  if (confirmed && breakEvenResult?.kind === "unreachable") outputs.push({ label: "Break-even volume (expected)", value: "Not reachable within the useful life" })
  const blend = adv.on && mod.payerMix ? payerBlend(adv.payerMix) : null
  if (confirmed && blend && !blend.missing.length) outputs.push({ label: "Payer mix factor", value: `× ${blend.factor.toFixed(3)}` })
  return { publicData, inputs, outputs }
}
