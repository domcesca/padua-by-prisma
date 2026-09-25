"use client"

import { Info, Receipt, X } from "lucide-react"
import { useMemo, useState } from "react"

import { FilterPill } from "@/components/benchmark/filter-pill"
import { PickerPill } from "@/components/shell/grouped-picker"
import { Segmented } from "@/components/shell/segmented"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatInt, formatUsd } from "@/lib/format"
import { defineModule, type BenefitLine, type ModuleEditorProps } from "@/lib/propose/module"
import { DRG_SEARCH_NOTES } from "@/lib/propose/search-terms"
import { estimatedPayment, type ReimbursementData } from "@/lib/propose/reimbursement"
import { ippsLaborShare, ippsWagePayment } from "@/lib/propose/wage-index"
import { NumberField } from "../number-field"
import { SourceTag } from "../source-tag"

// New technology or service that brings in inpatient cases: pick the MS-DRGs it maps to, say how
// many more cases a year, and each case is valued at the DRG's national-average Medicare payment
// (relative weight × national standardized amount, from the latest IPPS Final Rule).

type Row = { code: string; mode: "cases" | "pct"; value: number }
type State = { drgs: Row[]; careCost: number }

const MAX_DRGS = 20

/** "470:30,216:10%" */
function toParams(s: State): Record<string, string> {
  const out: Record<string, string> = {}
  if (s.drgs.length) out.drg = s.drgs.map((r) => `${r.code}:${r.value}${r.mode === "pct" ? "%" : ""}`).join(",")
  if (s.careCost) out.care = String(s.careCost)
  return out
}

function fromParams(params: URLSearchParams): State {
  const drgs: Row[] = []
  for (const part of (params.get("drg") ?? "").split(",")) {
    const m = part.trim().match(/^(\d{3})(?::(\d+(?:\.\d+)?)(%)?)?$/)
    if (!m || drgs.some((r) => r.code === m[1])) continue
    drgs.push({ code: m[1], value: Math.min(1e6, Number(m[2] ?? 0)), mode: m[3] ? "pct" : "cases" })
  }
  const care = Number(params.get("care"))
  return { drgs: drgs.slice(0, MAX_DRGS), careCost: Number.isFinite(care) ? Math.min(100, Math.max(0, care)) : 0 }
}

type Computed = { code: string; label: string; payment: number; baseline: number | null; added: number; revenue: number }

/**
 * Payment per case: the national estimate, or with Advanced mode's wage index on (and a CMS wage index for the
 * hospital) the wage-adjusted one. `adjusted` is the wage index in use, or null for the national rate.
 */
function pricing(data: ReimbursementData, wageIndex: boolean) {
  const wi = wageIndex ? data.wageIndex : null
  return {
    adjusted: wi,
    pay: (weight: number) => (wi ? ippsWagePayment(weight, data.laborSplit, wi.value) : estimatedPayment(weight, data.rate)),
  }
}

function compute(s: State, data: ReimbursementData | null, wageIndex: boolean): Computed[] {
  if (!data) return []
  const { pay } = pricing(data, wageIndex)
  const byCode = new Map(data.drgs.map((d) => [d.code, d]))
  return s.drgs.flatMap((r) => {
    const d = byCode.get(r.code)
    if (!d) return []
    const payment = pay(d.weight)
    const baseline = data.baseline?.cases[r.code] ?? null
    const added = r.mode === "cases" ? r.value : baseline != null ? (baseline * r.value) / 100 : 0
    return [{ code: r.code, label: d.label, payment, baseline, added, revenue: added * payment }]
  })
}

const casesText = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 1 })} ${n === 1 ? "case" : "cases"}`

function Editor({ state, onChange, data, context }: ModuleEditorProps<State, ReimbursementData>) {
  // Browse by body system (CMS's Major Diagnostic Category), then search within it or across all of them.
  const [system, setSystem] = useState("all")
  const systems = useMemo(() => {
    const counts = new Map<string, { label: string; mdc: string | null; count: number }>()
    for (const d of data?.drgs ?? []) {
      const key = d.mdc ?? "none"
      const entry = counts.get(key) ?? { label: d.mdcName, mdc: d.mdc, count: 0 }
      entry.count++
      counts.set(key, entry)
    }
    return counts
  }, [data])
  const options = useMemo(
    () =>
      data?.drgs
        .filter((d) => system === "all" || (d.mdc ?? "none") === system)
        .map((d) => ({
          value: d.code,
          label: `${d.code} · ${d.label}`,
          hint: formatUsd(pricing(data, context.wageIndex).pay(d.weight), { compact: true }),
          group: d.mdcName,
          keywords: [d.type === "SURG" ? "surgical" : "medical", ...(d.mdc ? [`mdc ${d.mdc}`] : [])],
          tags: d.terms,
          leadTags: d.leadTerms,
        })) ?? [],
    [data, system, context.wageIndex]
  )
  const systemName = system === "all" ? null : (systems.get(system)?.label ?? null)
  const emptyText = (query: string) => {
    const q = query.trim().toLowerCase()
    const note = DRG_SEARCH_NOTES.find((n) => n.terms.some((t) => t === q || (q.length >= 3 && t.startsWith(q))))?.note
    if (note) return note
    if (systemName) return `No DRGs in ${systemName} match. Try all body systems.`
    return "No DRGs match. Try a condition or procedure, e.g. “stroke”, “joint replacement”, or “sepsis”."
  }

  if (!data) {
    return (
      <div className="space-y-3" aria-busy>
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-8 w-32 animate-pulse rounded-full bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
      </div>
    )
  }

  const rows = compute(state, data, context.wageIndex)
  const { adjusted } = pricing(data, context.wageIndex)
  const byCode = new Map(data.drgs.map((d) => [d.code, d]))
  const revenue = rows.reduce((sum, r) => sum + r.revenue, 0)
  const setRow = (code: string, patch: Partial<Row>) =>
    onChange({ ...state, drgs: state.drgs.map((r) => (r.code === code ? { ...r, ...patch } : r)) })
  const baselineYear = data.baseline?.year

  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        Pick the MS-DRGs the new cases will fall into and how many more a year. Each case is valued at the DRG’s{" "}
        {adjusted ? (
          <span className="font-medium text-foreground">Medicare payment, wage-index-adjusted for {adjusted.hospital}</span>
        ) : (
          <span className="font-medium text-foreground">national-average Medicare payment</span>
        )}{" "}
        for FY {data.fiscalYear}. <MethodInfo data={data} />
      </p>
      {context.wageIndex && <WageIndexNote data={data} facilityName={context.facilityName} />}

      <div className="flex flex-wrap items-center gap-2">
        <FilterPill
          label="Body system"
          summary={systemName ?? "All body systems"}
          active={systemName != null}
          options={[
            { value: "all", label: "All body systems", hint: String(data.drgs.length) },
            ...[...systems].map(([key, s]) => ({
              value: key,
              label: s.label,
              hint: `${s.mdc && s.mdc !== "PRE" ? `MDC ${s.mdc} · ` : ""}${s.count}`,
            })),
          ]}
          selected={[system]}
          onChange={([v]) => setSystem(v ?? "all")}
          searchable
          wide
        />
        <PickerPill
          noun="DRGs"
          label="Add DRGs"
          summary={state.drgs.length ? `${state.drgs.length} DRG${state.drgs.length === 1 ? "" : "s"} · add or remove` : null}
          active={false}
          options={options}
          selected={state.drgs.map((r) => r.code)}
          onChange={(codes) =>
            onChange({
              ...state,
              drgs: codes.map((code) => state.drgs.find((r) => r.code === code) ?? { code, mode: "cases", value: 0 }),
            })
          }
          multiple
          max={MAX_DRGS}
          wide
          emptyText={emptyText}
        />
        {context.facilityId && (
          <p className="text-xs text-muted-foreground">
            {data.baseline
              ? `Shows ${context.facilityName ?? "this hospital"}’s ${baselineYear} Medicare cases for each DRG.`
              : "CMS publishes no Medicare inpatient claims for this hospital (it may not be paid under IPPS), so there’s no baseline."}
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
          No DRGs yet. Pick a body system, or search in plain words (e.g. “aneurysm”, “joint replacement”, “sepsis”) or by DRG number.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => {
            const row = state.drgs.find((x) => x.code === r.code)!
            const d = byCode.get(r.code)!
            const peer = data.peers?.cases[r.code]
            return (
              <li key={r.code} className="surface rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] leading-snug font-medium">
                      <span className="num mr-1.5 text-muted-foreground">{r.code}</span>
                      {r.label}
                    </p>
                    <p className="num mt-0.5 text-xs text-muted-foreground">
                      Weight {d.weight.toFixed(4)} · {formatUsd(r.payment)} a case{d.gmlos != null && ` · typical stay ${d.gmlos} days`}
                    </p>
                    {context.facilityId && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {data.baseline &&
                          (r.baseline != null
                            ? `${baselineYear}: ${formatInt(r.baseline)} Medicare cases here`
                            : `${baselineYear}: fewer than 11 Medicare cases here`)}
                        {data.peers &&
                          (peer
                            ? `${data.baseline ? " · " : ""}peer median ${formatInt(peer.median)} (${peer.reporting} of ${data.peers.count} peers had 11+)`
                            : `${data.baseline ? " · " : ""}none of ${data.peers.count} peers had 11+`)}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onChange({ ...state, drgs: state.drgs.filter((x) => x.code !== r.code) })}
                    aria-label={`Remove DRG ${r.code}`}
                    className="-mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <div className="mt-2.5 flex flex-wrap items-end gap-2.5">
                  <NumberField
                    label={row.mode === "cases" ? "Added cases a year" : `Increase over ${baselineYear}`}
                    value={row.value}
                    onChange={(value) => setRow(r.code, { value })}
                    suffix={row.mode === "pct" ? "%" : undefined}
                    max={row.mode === "pct" ? 1000 : 1e6}
                    decimals={row.mode === "pct" ? 1 : 0}
                    className="w-40"
                  />
                  {r.baseline != null && (
                    <Segmented
                      label={`DRG ${r.code}: enter as`}
                      size="sm"
                      value={row.mode}
                      onChange={(mode) => setRow(r.code, { mode, value: 0 })}
                      options={[
                        { value: "cases", label: "Cases" },
                        { value: "pct", label: "% of current" },
                      ]}
                      className="mb-1"
                    />
                  )}
                  <div className="mb-1 ml-auto text-right">
                    <p className="num text-[14px] font-medium">{formatUsd(r.revenue)}</p>
                    <p className="num text-xs text-muted-foreground">
                      {casesText(r.added)} × {formatUsd(r.payment)}
                    </p>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border pt-3">
        <NumberField
          label="Cost of caring for the added patients"
          suffix="% of payment"
          value={state.careCost}
          onChange={(careCost) => onChange({ ...state, careCost })}
          max={100}
          decimals={1}
          className="w-full sm:w-64"
          hint="Leave at 0 to count revenue; set it to count margin instead."
        />
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Added revenue a year</p>
          <p className="num text-[20px] font-semibold tracking-tight">{formatUsd(revenue)}</p>
          {state.careCost > 0 && (
            <p className="num text-xs text-muted-foreground">
              {formatUsd(revenue * (1 - state.careCost / 100))} after cost of care
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/** Advanced mode's wage index: which one is in use, or why the national rate still is. */
function WageIndexNote({ data, facilityName }: { data: ReimbursementData; facilityName: string | null }) {
  const wi = data.wageIndex
  return (
    <p className="rounded-xl border border-dashed border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground">
      <SourceTag kind="data" className="mr-1.5">
        Advanced · wage index
      </SourceTag>
      {wi ? (
        <>
          {wi.hospital}’s {wi.year} IPPS wage index is <span className="num font-medium text-foreground">{wi.value.toFixed(4)}</span> (
          {wi.table}, CCN {wi.ccn}
          {wi.reportedWithName ? `, paid under ${wi.reportedWithName}’s Medicare number` : ""}). The labor-related{" "}
          {ippsLaborShare(data.laborSplit, wi.value)}% of the national rate is multiplied by it, as CMS does:{" "}
          <span className="num">
            weight × ({formatUsd((wi.value > 1 ? data.laborSplit.above : data.laborSplit.atMost).laborRelated, { cents: true })} × {wi.value.toFixed(4)} +{" "}
            {formatUsd((wi.value > 1 ? data.laborSplit.above : data.laborSplit.atMost).nonlaborRelated, { cents: true })})
          </span>
          . DSH, IME, outliers, and capital still aren’t applied.{" "}
          <a href={wi.sourcePage} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
            CMS source
          </a>
        </>
      ) : facilityName ? (
        `CMS publishes no IPPS wage index for ${facilityName} (critical access, children’s, cancer, psychiatric, rehabilitation, and long-term care hospitals aren’t paid under IPPS), so the national rate is used.`
      ) : (
        "Pick a hospital to apply its CMS wage index; until then the national rate is used."
      )}
    </p>
  )
}

function MethodInfo({ data }: { data: ReimbursementData }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="How the payment estimate works"
        className="inline-flex translate-y-0.5 items-center gap-0.5 rounded font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Info className="size-3.5" /> How it’s estimated
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 max-w-[calc(100vw-2rem)] space-y-2 text-[13px] leading-relaxed">
        <p className="font-medium">Relative weight × national standardized amount</p>
        <p className="text-muted-foreground">
          FY {data.fiscalYear} IPPS Final Rule (effective {data.effective}): each DRG’s relative weight (Table 5) times the
          national operating standardized amount, <span className="num text-foreground">{formatUsd(data.rate)}</span>{" "}
          (Table 1A, full update).
        </p>
        <p className="text-muted-foreground">
          This is a <span className="font-medium text-foreground">national estimate, not this hospital’s actual reimbursement.</span> Real
          Medicare payments also depend on the hospital’s wage index (California’s are mostly above 1), DSH and IME add-ons,
          outliers, transfers, and capital (about {formatUsd(data.capitalRate)} × weight more). Other payers pay differently again.
        </p>
        <p className="text-muted-foreground">
          Baseline cases are Original Medicare (fee-for-service) discharges from CMS; Medicare Advantage and other payers
          aren’t included, and CMS hides counts under 11.
        </p>
        <a href={data.sourcePage} target="_blank" rel="noreferrer" className="inline-block font-medium text-primary hover:underline">
          CMS FY {data.fiscalYear} Final Rule files
        </a>
      </PopoverContent>
    </Popover>
  )
}

export const reimbursementModule = defineModule<State, ReimbursementData>({
  id: "reimbursement",
  label: "Inpatient reimbursement",
  payerMix: true,
  wageIndex: true,
  volume: {
    label: "Added cases",
    scale: (s, k) => ({ ...s, drgs: s.drgs.map((r) => ({ ...r, value: r.value * k })) }),
    describe: (s, data, k) => {
      const entered = compute(s, data, false).reduce((t, r) => t + r.added, 0)
      return { value: `${casesText(Math.ceil(entered * k * 10) / 10)} a year`, detail: `${Math.round(k * 100)}% of the ${casesText(entered)} entered, in the same DRG mix` }
    },
  },
  drivers: (s) => [
    { id: "price", label: "Medicare payment per case" },
    ...(s.careCost ? [{ id: "care", label: "Cost of caring for the added patients", apply: (st: State, f: number) => ({ ...st, careCost: Math.min(100, st.careCost * f) }) }] : []),
  ],
  summary: "New technology or service that adds inpatient cases, valued by MS-DRG.",
  icon: Receipt,
  hasData: true,
  initial: () => ({ drgs: [], careCost: 0 }),
  toParams,
  fromParams,
  benefit: (s, data, { wageIndex }) => {
    if (!data) return { annual: 0, lines: [], notes: [], incomplete: "Loading the DRG table…" }
    const rows = compute(s, data, wageIndex)
    const { adjusted } = pricing(data, wageIndex)
    const lines: BenefitLine[] = rows.map((r) => ({
      label: `DRG ${r.code} · ${r.label}`,
      detail: `${casesText(r.added)} × ${formatUsd(r.payment)}${adjusted ? ` (wage-index-adjusted, ${adjusted.value.toFixed(4)})` : ""}`,
      amount: r.revenue,
    }))
    const revenue = rows.reduce((sum, r) => sum + r.revenue, 0)
    if (s.careCost > 0 && revenue) {
      lines.push({ label: "Cost of caring for the added patients", detail: `${s.careCost}% of payment`, amount: (-revenue * s.careCost) / 100 })
    }
    const split = adjusted && (adjusted.value > 1 ? data.laborSplit.above : data.laborSplit.atMost)
    const notes = [
      adjusted && split
        ? `Advanced: payment per case is wage-index-adjusted for ${adjusted.hospital}: FY ${data.fiscalYear} MS-DRG relative weight × (labor-related ${formatUsd(split.laborRelated, { cents: true })} × wage index ${adjusted.value.toFixed(4)} + non-labor ${formatUsd(split.nonlaborRelated, { cents: true })}), with the hospital’s wage index from CMS’s ${adjusted.table} (CCN ${adjusted.ccn}). Still an estimate, not the hospital’s actual reimbursement: DSH/IME, outliers, capital, and payer mix aren’t applied.`
        : `Payment per case = FY ${data.fiscalYear} MS-DRG relative weight × national operating standardized amount (${formatUsd(data.rate)}). A national Medicare estimate, not this hospital’s actual reimbursement: wage index, DSH/IME, outliers, capital, and payer mix aren’t applied.`,
    ]
    if (wageIndex && !adjusted) notes.push("Advanced: the wage index adjustment is on, but CMS publishes no IPPS wage index for this hospital (or none is picked), so the national rate is used.")
    if (!s.careCost) notes.push("Counts revenue, not margin: the cost of treating the added patients isn’t subtracted.")
    if (s.drgs.some((r) => r.mode === "pct") && data.baseline)
      notes.push(`Percent increases apply to ${data.baseline.year} Original Medicare (fee-for-service) discharges from CMS.`)
    return {
      annual: lines.reduce((sum, l) => sum + l.amount, 0),
      lines,
      notes,
      incomplete: !rows.length ? "Pick at least one DRG." : !revenue ? "Enter the added cases for at least one DRG." : undefined,
    }
  },
  Editor,
})
