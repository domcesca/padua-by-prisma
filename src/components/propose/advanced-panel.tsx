"use client"

import { ChevronDown, SlidersHorizontal } from "lucide-react"
import { useState } from "react"

import {
  defaultAdvanced,
  MAX_ESCALATION,
  missingText,
  PAYERS,
  payerBlend,
  rampActive,
  type AdvancedSettings,
  type PayerId,
} from "@/lib/propose/advanced"
import { MAX_LIFE } from "@/lib/propose/engine"
import type { ProposalModule } from "@/lib/propose/module"
import type { PayerMixData } from "@/lib/propose/module-data"
import { cn } from "@/lib/utils"
import { NumberField } from "./number-field"
import { SourceTag } from "./source-tag"

/**
 * The Advanced switch and, when on, three optional refinements, each folded until opened. Off, or on with every
 * field at its default, the estimate is exactly the basic one.
 */
export function AdvancedPanel({
  value,
  onChange,
  module,
  facilityId,
}: {
  value: AdvancedSettings
  onChange: (next: AdvancedSettings) => void
  module: ProposalModule
  facilityId: string | null
}) {
  const blend = payerBlend(value.payerMix)
  const escalated = !!(value.escalation.benefit || value.escalation.cost)
  const set = (patch: Partial<AdvancedSettings>) => onChange({ ...value, ...patch })

  return (
    <section aria-labelledby="advanced-title" className="glass rounded-2xl p-5 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h2 id="advanced-title" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <SlidersHorizontal className="size-4 text-tertiary-foreground" aria-hidden /> Advanced
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Optional refinements and read-outs, each switched on separately. Off, or left at their defaults, they change nothing.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={value.on}
          aria-labelledby="advanced-title"
          onClick={() => set({ on: !value.on })}
          className={cn(
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            value.on ? "bg-primary" : "bg-black/15 dark:bg-white/20"
          )}
        >
          <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform", value.on ? "translate-x-6" : "translate-x-1")} />
        </button>
      </div>

      {value.on && (
        <div className="mt-4 space-y-2">
          <Fold title="Payer mix" status={module.payerMix ? (!blend ? "Not set" : blend.missing.length ? "Multipliers needed" : `× ${blend.factor.toFixed(3)} blended`) : "Not used by this method"}>
            {module.payerMix ? (
              <PayerMix value={value} onChange={onChange} facilityId={facilityId} />
            ) : (
              <p className="text-xs text-muted-foreground">
                Payer mix applies to inpatient and outpatient reimbursement, whose estimates are Medicare rates. Other methods
                aren’t payer-rated, so it’s ignored here.
              </p>
            )}
          </Fold>

          <Fold
            title="Wage index"
            status={module.wageIndex ? (value.wageIndex ? "On: hospital’s CMS wage index" : "Off: national rate") : "Not used by this method"}
          >
            {module.wageIndex ? (
              <div className="space-y-2">
                <Toggle label="Adjust for this hospital’s wage index" checked={value.wageIndex} onChange={(wageIndex) => set({ wageIndex })} />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  The estimate uses CMS’s flat national rate. On, the labor-related share of that rate is multiplied by the
                  hospital’s own CMS wage index, the way Medicare pays it (IPPS Table 2 for inpatient, the OPPS impact file
                  for outpatient). California’s wage indexes are well above 1, so this usually raises the estimate. The benefit
                  section shows the index used. <SourceTag kind="data">CMS</SourceTag>
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                The wage index applies to inpatient and outpatient reimbursement, which are priced at national Medicare rates.
              </p>
            )}
          </Fold>

          <Fold
            title="Ramp-up"
            status={module.ownTiming ? "Set in the benefit section" : rampActive(value) ? `Year ${value.ramp.start} → full in year ${value.ramp.full}` : "Full from year 1"}
          >
            {module.ownTiming ? (
              <p className="text-xs text-muted-foreground">
                Avoided penalties already phases in with CMS’s scoring windows; move its timing under “Phase-in timing” in the
                benefit section (shown once a reduction is entered).
              </p>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-end gap-2.5">
                  <NumberField
                    label="Benefit starts in year"
                    value={value.ramp.start}
                    onChange={(v) => {
                      const start = Math.min(MAX_LIFE, Math.max(1, Math.round(v) || 1))
                      set({ ramp: { start, full: Math.max(start, value.ramp.full) } })
                    }}
                    min={1}
                    max={MAX_LIFE}
                    className="w-44"
                  />
                  <NumberField
                    label="Full benefit from year"
                    value={value.ramp.full}
                    onChange={(v) => set({ ramp: { ...value.ramp, full: Math.min(MAX_LIFE, Math.max(value.ramp.start, Math.round(v) || 1)) } })}
                    min={1}
                    max={MAX_LIFE}
                    className="w-44"
                  />
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Straight line in between: e.g. starts in year 1, full in year 3 gives 33%, 67%, then 100%. Years before the start
                  bring nothing. Default 1 and 1: the full benefit from year 1, as the basic model assumes.
                </p>
              </div>
            )}
          </Fold>

          <Fold
            title="Escalation"
            status={escalated ? `Benefit ${pct(value.escalation.benefit)}, costs ${pct(value.escalation.cost)} a year` : "None (flat)"}
          >
            <div className="space-y-2">
              <div className="flex flex-wrap items-end gap-2.5">
                <NumberField
                  label="Benefit grows"
                  suffix="% a year"
                  value={value.escalation.benefit}
                  onChange={(benefit) => set({ escalation: { ...value.escalation, benefit } })}
                  min={-MAX_ESCALATION}
                  max={MAX_ESCALATION}
                  decimals={1}
                  className="w-44"
                />
                <NumberField
                  label="Running costs grow"
                  suffix="% a year"
                  value={value.escalation.cost}
                  onChange={(cost) => set({ escalation: { ...value.escalation, cost } })}
                  min={-MAX_ESCALATION}
                  max={MAX_ESCALATION}
                  decimals={1}
                  className="w-44"
                />
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Compounds from year 2 (year 1 is the amount entered). Running costs are the yearly maintenance; the up-front cost
                isn’t escalated. <SourceTag kind="assumption" />
              </p>
            </div>
          </Fold>

          <Fold
            title="Break-even volume"
            status={value.breakeven ? (module.volume ? "Shown with the results" : "Not used by this method") : "Off"}
          >
            <div className="space-y-2">
              <Toggle label="Show break-even volume" checked={value.breakeven} onChange={(breakeven) => set({ breakeven })} />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Solves backward for the least volume ({module.volume ? module.volume.label.toLowerCase() : "cases, services, or savings"}) that
                pays back the costs within the useful life, in the expected scenario. Shown as one number under the scenario cards.
                Nothing new is assumed: it’s the same model, re-run.
              </p>
            </div>
          </Fold>

          <Fold
            title="Sensitivity"
            status={value.sensitivity.on ? `±${value.sensitivity.swing}% on ${value.sensitivity.outcome === "roi" ? "ROI" : "NPV"}` : "Off"}
          >
            <div className="space-y-2">
              <Toggle
                label="Show the sensitivity (tornado) chart"
                checked={value.sensitivity.on}
                onChange={(on) => set({ sensitivity: { ...value.sensitivity, on } })}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Moves each input (volume, prices, costs, useful life, discount rate) up and down by a fixed percent, one at a
                time, and ranks them by how much the NPV or ROI changes. Pick the swing and outcome on the chart.
              </p>
            </div>
          </Fold>

          {module.advancedExtras?.length ? (
            <p className="px-1 pt-1 text-xs leading-relaxed text-muted-foreground">
              {module.label} also has advanced options in its benefit section: {new Intl.ListFormat("en-US", { type: "conjunction" }).format(module.advancedExtras)}.
            </p>
          ) : null}

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => onChange({ ...defaultAdvanced(), on: true })}
              className="text-[12px] font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Reset advanced settings
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

const pct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}%`

/** A labeled switch for one advanced option. */
export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-medium">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          checked ? "bg-primary" : "bg-black/15 dark:bg-white/20"
        )}
      >
        <span className={cn("inline-block size-3.5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[18px]" : "translate-x-[3px]")} />
      </button>
      {label}
    </label>
  )
}

function Fold({ title, status, children }: { title: string; status: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="surface rounded-xl">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
          {title}
          <span className="text-[12px] font-normal text-muted-foreground">{status}</span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

function PayerMix({ value, onChange, facilityId }: { value: AdvancedSettings; onChange: (next: AdvancedSettings) => void; facilityId: string | null }) {
  const [loading, setLoading] = useState(false)
  const [source, setSource] = useState<string | null>(null)
  const blend = payerBlend(value.payerMix)
  const setRow = (id: PayerId, patch: { share?: number; multiplier?: number | null }) =>
    onChange({ ...value, payerMix: value.payerMix.map((r) => (r.id === id ? { ...r, ...patch } : r)) })

  async function useHospitalMix() {
    if (!facilityId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/propose/payermix?facility=${facilityId}`)
      const mix = (await res.json()) as PayerMixData
      if (mix) {
        onChange({ ...value, payerMix: value.payerMix.map((r) => ({ ...r, share: mix.shares[r.id] })) })
        setSource(`Shares from the hospital’s ${mix.year} HCAI report, by gross charges.`)
      } else setSource("HCAI has no payer mix for this hospital; enter the shares yourself.")
    } catch {
      setSource("Couldn’t load the hospital’s payer mix; enter the shares yourself.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2.5">
      <p className="text-xs leading-relaxed text-muted-foreground">
        The estimate is a Medicare rate. Enter each payer’s share of the added volume and what it pays relative to Medicare
        (e.g. 0.70 for 70% of Medicare, 1.80 for 180%). Contract rates aren’t public, so the multipliers are yours; Medicare
        is 1.00 by definition. <SourceTag kind="assumption" />
      </p>
      <div className="overflow-x-auto">
        <table className="num w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] text-muted-foreground">
              <th className="py-1 font-medium">Payer</th>
              <th className="py-1 font-medium">Share</th>
              <th className="py-1 font-medium">vs Medicare</th>
            </tr>
          </thead>
          <tbody>
            {PAYERS.map((p) => {
              const r = value.payerMix.find((x) => x.id === p.id)!
              return (
                <tr key={p.id}>
                  <td className="py-1 pr-2 leading-tight">{p.label}</td>
                  <td className="py-1 pr-2">
                    <NumberField label={`${p.label} share`} hideLabel suffix="%" value={r.share} onChange={(share) => setRow(p.id, { share })} max={100} decimals={1} className="w-24" />
                  </td>
                  <td className="py-1">
                    <MultiplierField label={`${p.label} rate multiplier`} value={r.multiplier} onChange={(multiplier) => setRow(p.id, { multiplier })} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {facilityId ? (
          <button
            type="button"
            onClick={useHospitalMix}
            disabled={loading}
            className="glass-subtle inline-flex h-8 items-center rounded-full px-3 text-[12px] font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
          >
            {loading ? "Loading…" : "Use this hospital’s payer mix"}
          </button>
        ) : (
          <span />
        )}
        {blend && !blend.missing.length && (
          <p className="text-right text-[13px]">
            Blended: <span className="num font-semibold">× {blend.factor.toFixed(3)}</span>
          </p>
        )}
      </div>
      {source && <p className="text-xs text-muted-foreground">{source}</p>}
      {blend && Math.abs(blend.total - 100) > 0.05 && (
        <p className="text-xs text-warning">Shares add up to {Number(blend.total.toFixed(1))}%; they’re scaled to 100% in the blend.</p>
      )}
      {blend && blend.missing.length > 0 && <p className="text-xs text-warning">Enter what {missingText(blend.missing)} vs Medicare.</p>}
    </div>
  )
}

/** A multiplier that can be blank (not entered yet), unlike NumberField's blank-means-0. */
function MultiplierField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <div className="glass-subtle flex h-10 w-24 items-center gap-1 rounded-xl px-3 focus-within:ring-2 focus-within:ring-ring">
      <span className="text-sm text-muted-foreground">×</span>
      <input
        aria-label={label}
        inputMode="decimal"
        placeholder="—"
        value={draft ?? (value == null ? "" : String(value))}
        onFocus={() => setDraft(value == null ? "" : String(value))}
        onBlur={() => setDraft(null)}
        onChange={(e) => {
          setDraft(e.target.value)
          const t = e.target.value.replace(/[^\d.]/g, "")
          if (t === "" || t === ".") return onChange(null)
          const n = Number(t)
          if (Number.isFinite(n)) onChange(Math.min(10, Math.max(0, n)))
        }}
        className="num min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-tertiary-foreground"
      />
    </div>
  )
}
