import type { YearFactors } from "./engine"

// Advanced mode: optional refinements on top of a module's estimate. Off by default, and every field's default
// leaves the result exactly as the basic model has it:
//   * Payer mix (inpatient and outpatient reimbursement): the national Medicare estimate × a blended multiplier,
//     Σ share × multiplier. Medicare is 1× by definition (the estimate is a Medicare rate); every other payer's
//     multiplier is the proposer's, since contract rates aren't public. Nothing entered → no adjustment.
//   * Ramp-up (every module but avoided penalties, which has its own CMS-based timing): the benefit starts in
//     `start` and reaches full in `full`, straight-line between. Default 1 → 1: full benefit from year 1.
//   * Escalation: benefits and running costs grow by a percent a year from year 2. Default 0%.
// Year-by-year effects go to the engine as per-year factors (engine.ts `YearFactors`).
//
// In the link: `adv=1` when on; `pm=medicare:40:1,medical:30:0.6,…` (share %, multiplier), `ramp=2-3`, `esc=3,4`
// (benefit %, cost %) whenever set, so turning Advanced off and on again keeps them.

export const PAYERS = [
  { id: "medicare", label: "Medicare" },
  { id: "medical", label: "Medi-Cal" },
  { id: "commercial", label: "Commercial" },
  { id: "other", label: "Other and self-pay" },
] as const
export type PayerId = (typeof PAYERS)[number]["id"]

export type PayerRow = { id: PayerId; share: number; multiplier: number | null }

export type AdvancedSettings = {
  on: boolean
  payerMix: PayerRow[]
  ramp: { start: number; full: number }
  escalation: { benefit: number; cost: number }
}

export const MAX_ESCALATION = 25

const defaultPayers = (): PayerRow[] => PAYERS.map((p) => ({ id: p.id, share: 0, multiplier: p.id === "medicare" ? 1 : null }))

export const defaultAdvanced = (): AdvancedSettings => ({
  on: false,
  payerMix: defaultPayers(),
  ramp: { start: 1, full: 1 },
  escalation: { benefit: 0, cost: 0 },
})

const num = (raw: string | undefined, min: number, max: number) => {
  const n = Number(raw)
  return raw != null && raw.trim() !== "" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null
}

export function parseAdvanced(params: URLSearchParams, maxLife: number): AdvancedSettings {
  const adv = defaultAdvanced()
  adv.on = params.get("adv") === "1"
  for (const part of (params.get("pm") ?? "").split(",")) {
    const [id, share, mult] = part.split(":")
    const row = adv.payerMix.find((r) => r.id === id)
    if (!row) continue
    row.share = num(share, 0, 100) ?? 0
    row.multiplier = row.id === "medicare" ? (num(mult, 0, 10) ?? 1) : num(mult, 0, 10)
  }
  const ramp = (params.get("ramp") ?? "").match(/^(\d+)-(\d+)$/)
  if (ramp) {
    const start = Math.min(maxLife, Math.max(1, Number(ramp[1])))
    adv.ramp = { start, full: Math.min(maxLife, Math.max(start, Number(ramp[2]))) }
  }
  const [eb, ec] = (params.get("esc") ?? "").split(",")
  adv.escalation = { benefit: num(eb, -MAX_ESCALATION, MAX_ESCALATION) ?? 0, cost: num(ec, -MAX_ESCALATION, MAX_ESCALATION) ?? 0 }
  return adv
}

export function advancedToParams(adv: AdvancedSettings, params: URLSearchParams) {
  if (adv.on) params.set("adv", "1")
  const mixed = adv.payerMix.filter((r) => r.share || (r.multiplier != null && !(r.id === "medicare" && r.multiplier === 1)))
  if (mixed.length) params.set("pm", mixed.map((r) => `${r.id}:${r.share}:${r.multiplier ?? ""}`).join(","))
  if (adv.ramp.start !== 1 || adv.ramp.full !== 1) params.set("ramp", `${adv.ramp.start}-${adv.ramp.full}`)
  if (adv.escalation.benefit || adv.escalation.cost) params.set("esc", `${adv.escalation.benefit},${adv.escalation.cost}`)
}

// -- Payer mix ------------------------------------------------------------------------------------------------------

export type PayerBlend = {
  factor: number
  /** Share entered in total, percent (normalized to 100 in the blend). */
  total: number
  /** Payers with a share but no multiplier yet. */
  missing: string[]
  /** "40% Medicare × 1.00, …" */
  detail: string
}

/** The blended multiplier, or null when no shares are entered (no adjustment). */
export function payerBlend(rows: PayerRow[]): PayerBlend | null {
  const used = rows.filter((r) => r.share > 0)
  const total = used.reduce((t, r) => t + r.share, 0)
  if (!total) return null
  const label = (id: PayerId) => PAYERS.find((p) => p.id === id)!.label
  const missing = used.filter((r) => r.multiplier == null).map((r) => label(r.id))
  const factor = used.reduce((t, r) => t + (r.share / total) * (r.multiplier ?? 0), 0)
  const detail = used.map((r) => `${Number(r.share.toFixed(1))}% ${label(r.id)} × ${r.multiplier == null ? "?" : r.multiplier.toFixed(2)}`).join(", ")
  return { factor, total, missing, detail }
}

// -- Timing ---------------------------------------------------------------------------------------------------------

/** Straight-line ramp: 0 before `start`, full from `full`, even steps between. */
export const rampShare = (year: number, start: number, full: number) =>
  year < start ? 0 : year >= full ? 1 : (year - start + 1) / (full - start + 1)

export const rampActive = (adv: AdvancedSettings) => adv.ramp.start !== 1 || adv.ramp.full !== 1

/**
 * Per-year factors for the engine, or undefined when nothing advanced applies (so the basic path is untouched).
 * `ownTiming`: the module phases its benefit in itself (avoided penalties), so the ramp here is skipped.
 */
export function yearFactors(adv: AdvancedSettings, life: number, ownTiming: boolean): YearFactors | undefined {
  if (!adv.on) return undefined
  const ramp = !ownTiming && rampActive(adv)
  const { benefit: gb, cost: gc } = adv.escalation
  if (!ramp && !gb && !gc) return undefined
  const years = Array.from({ length: life }, (_, i) => i + 1)
  return {
    benefit: years.map((y) => (ramp ? rampShare(y, adv.ramp.start, adv.ramp.full) : 1) * (1 + gb / 100) ** (y - 1)),
    cost: years.map((y) => (1 + gc / 100) ** (y - 1)),
  }
}

/** "Medi-Cal", "Medi-Cal and Commercial", "Medi-Cal, Commercial, and Other and self-pay": who still needs a multiplier. */
export const missingText = (names: string[]) =>
  `${new Intl.ListFormat("en-US", { style: "long", type: "conjunction" }).format(names)} ${names.length === 1 ? "pays" : "pay"}`
