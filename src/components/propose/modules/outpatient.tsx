"use client"

import { Info, Stethoscope, TriangleAlert, X } from "lucide-react"
import { useMemo, useState } from "react"

import { FilterPill } from "@/components/benchmark/filter-pill"
import { PickerPill } from "@/components/shell/grouped-picker"
import { Segmented } from "@/components/shell/segmented"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatInt, formatUsd } from "@/lib/format"
import { defineModule, type BenefitLine, type ModuleEditorProps } from "@/lib/propose/module"
import type { OutpatientData, RevenueScope } from "@/lib/propose/outpatient"
import { APC_SEARCH_NOTES } from "@/lib/propose/search-terms"
import { oppsWageRate } from "@/lib/propose/wage-index"
import { NumberField } from "../number-field"
import { SourceTag } from "../source-tag"

// Outpatient and professional billing: a technology or service that adds outpatient visits, scans, or procedures.
// Pick the APCs (CMS's outpatient payment groups) the services fall in and how many more a year; each is valued at
// the APC's national OPPS payment rate (Addendum A). The physician's professional fee, when the hospital collects it,
// is the proposer's figure: CMS's fee schedule is keyed by CPT, which the AMA licenses, so it isn't built in.

type Row = { code: string; mode: "count" | "pct"; value: number; pro: number }
type State = { apcs: Row[]; scope: RevenueScope; careCost: number }

const MAX_APCS = 20
const PFS_LOOKUP = "https://www.cms.gov/medicare/physician-fee-schedule/search"

const SCOPES: { value: RevenueScope; label: string; help: string }[] = [
  {
    value: "facility",
    label: "Hospital only",
    help: "The hospital’s outpatient (facility) payment. Right when the physicians bill for themselves: independent or private practice.",
  },
  {
    value: "both",
    label: "Hospital + physician",
    help: "Facility and professional payments. Right when the hospital employs the physicians (or bills for them), so it collects both.",
  },
  {
    value: "professional",
    label: "Physician only",
    help: "Professional payments only, e.g. a service in a physician practice the hospital owns that isn’t billed as hospital outpatient.",
  },
]

const SCOPE_NOTES: Record<RevenueScope, string> = {
  facility: "Counts the hospital’s (facility) payment only, as when the physicians bill for themselves; physician fees aren’t included.",
  both: "Counts hospital and physician payments, as when the hospital employs or bills for the physicians.",
  professional: "Counts physician (professional) payments only; the hospital’s facility payment isn’t included.",
}

/** APC levels are set by CPT codes this app can't carry; the proposer has to confirm them. Shown wherever the numbers are. */
const LEVEL_CAUTION =
  "Confirm each APC level with your coding or revenue integrity team before relying on this estimate. APCs come in levels (e.g. Level 2 vs Level 3 Imaging without Contrast) paid at very different rates, and the level a service lands in is set by its billing code, which Padua can’t check."

const includesFacility = (s: RevenueScope) => s !== "professional"
const includesPro = (s: RevenueScope) => s !== "facility"

/** "5523:1200,5024:10%" plus professional rates "5523:45.5" */
function toParams(s: State): Record<string, string> {
  const out: Record<string, string> = {}
  if (s.apcs.length) out.apc = s.apcs.map((r) => `${r.code}:${r.value}${r.mode === "pct" ? "%" : ""}`).join(",")
  const pro = s.apcs.filter((r) => r.pro)
  if (pro.length) out.apcpro = pro.map((r) => `${r.code}:${r.pro}`).join(",")
  if (s.scope !== "facility") out.opscope = s.scope
  if (s.careCost) out.opcare = String(s.careCost)
  return out
}

function fromParams(params: URLSearchParams): State {
  const pro = new Map<string, number>()
  for (const part of (params.get("apcpro") ?? "").split(",")) {
    const m = part.trim().match(/^(\d{4}):(\d+(?:\.\d+)?)$/)
    if (m) pro.set(m[1], Math.min(1e6, Number(m[2])))
  }
  const apcs: Row[] = []
  for (const part of (params.get("apc") ?? "").split(",")) {
    const m = part.trim().match(/^(\d{4})(?::(\d+(?:\.\d+)?)(%)?)?$/)
    if (!m || apcs.some((r) => r.code === m[1])) continue
    apcs.push({ code: m[1], value: Math.min(1e7, Number(m[2] ?? 0)), mode: m[3] ? "pct" : "count", pro: pro.get(m[1]) ?? 0 })
  }
  const scope = params.get("opscope")
  const care = Number(params.get("opcare"))
  return {
    apcs: apcs.slice(0, MAX_APCS),
    scope: scope === "both" || scope === "professional" ? scope : "facility",
    careCost: Number.isFinite(care) ? Math.min(100, Math.max(0, care)) : 0,
  }
}

type Computed = { code: string; title: string; rate: number; pro: number; baseline: number | null; added: number; facility: number; professional: number }

/** The hospital-side rate: national, or wage-adjusted with Advanced mode's wage index on and one published for the hospital. */
function pricing(data: OutpatientData, wageIndex: boolean) {
  const wi = wageIndex ? data.wageIndex : null
  return { adjusted: wi, rate: (national: number) => (wi ? oppsWageRate(national, data.laborShare, wi.value) : national) }
}

function compute(s: State, data: OutpatientData | null, wageIndex: boolean): Computed[] {
  if (!data) return []
  const price = pricing(data, wageIndex).rate
  const byCode = new Map(data.apcs.map((a) => [a.code, a]))
  return s.apcs.flatMap((r) => {
    const a = byCode.get(r.code)
    if (!a) return []
    const baseline = data.baseline?.services[r.code] ?? null
    const added = r.mode === "count" ? r.value : baseline != null ? (baseline * r.value) / 100 : 0
    return [
      {
        code: r.code,
        title: a.title,
        rate: price(a.rate),
        pro: r.pro,
        baseline,
        added,
        facility: includesFacility(s.scope) ? added * price(a.rate) : 0,
        professional: includesPro(s.scope) ? added * r.pro : 0,
      },
    ]
  })
}

const servicesText = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 1 })} ${n === 1 ? "service" : "services"}`

function Editor({ state, onChange, data, context }: ModuleEditorProps<State, OutpatientData>) {
  const [group, setGroup] = useState("all")
  const groups = useMemo(() => {
    const counts = new Map<string, number>()
    for (const a of data?.apcs ?? []) counts.set(a.group, (counts.get(a.group) ?? 0) + 1)
    return counts
  }, [data])
  const options = useMemo(
    () =>
      data?.apcs
        .filter((a) => group === "all" || a.group === group)
        .map((a) => ({
          value: a.code,
          label: `${a.code} · ${a.title}`,
          hint: formatUsd(pricing(data, context.wageIndex).rate(a.rate), { compact: true }),
          group: a.group,
          keywords: [`apc ${a.code}`],
          tags: a.terms,
          leadTags: a.leadTerms,
        })) ?? [],
    [data, group, context.wageIndex]
  )
  const emptyText = (query: string) => {
    const q = query.trim().toLowerCase()
    const note = APC_SEARCH_NOTES.find((n) => n.terms.some((t) => t === q || (q.length >= 3 && t.startsWith(q))))?.note
    if (note) return note
    if (group !== "all") return `No APCs in ${group} match. Try all service groups.`
    return "No APCs match. Try a service in plain words, e.g. “ct scan”, “ed visit”, or “colonoscopy”."
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
  const baselineSet = new Set(data.baselineApcs)
  const facility = rows.reduce((t, r) => t + r.facility, 0)
  const professional = rows.reduce((t, r) => t + r.professional, 0)
  const revenue = facility + professional
  const setRow = (code: string, patch: Partial<Row>) => onChange({ ...state, apcs: state.apcs.map((r) => (r.code === code ? { ...r, ...patch } : r)) })
  const scope = SCOPES.find((s) => s.value === state.scope)!
  const baselineYear = data.baseline?.year

  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        Pick the outpatient payment groups (APCs) the added services fall in and how many more a year. The hospital’s side is
        valued at each APC’s{" "}
        {adjusted ? (
          <span className="font-medium text-foreground">Medicare outpatient rate, wage-index-adjusted for {adjusted.hospital}</span>
        ) : (
          <span className="font-medium text-foreground">national Medicare outpatient rate</span>
        )}{" "}
        for CY {data.calendarYear}. <MethodInfo data={data} />
      </p>
      {context.wageIndex && <WageIndexNote data={data} facilityName={context.facilityName} />}

      <div className="surface space-y-2 rounded-xl p-3">
        <p className="text-[13px] font-medium">Whose revenue counts</p>
        <Segmented
          label="Whose revenue counts"
          size="sm"
          value={state.scope}
          onChange={(v) => onChange({ ...state, scope: v })}
          options={SCOPES.map((s) => ({ value: s.value, label: s.label }))}
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
          {scope.help} <span className="font-medium text-foreground">This changes the estimate a lot</span>: pick the
          arrangement the proposal really has.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterPill
          label="Service group"
          summary={group === "all" ? "All service groups" : group}
          active={group !== "all"}
          options={[
            { value: "all", label: "All service groups", hint: String(data.apcs.length) },
            ...[...groups].map(([g, n]) => ({ value: g, label: g, hint: String(n) })),
          ]}
          selected={[group]}
          onChange={([v]) => setGroup(v ?? "all")}
          wide
        />
        <PickerPill
          noun="APCs"
          label="Add APCs"
          summary={state.apcs.length ? `${state.apcs.length} APC${state.apcs.length === 1 ? "" : "s"} · add or remove` : null}
          active={false}
          options={options}
          selected={state.apcs.map((r) => r.code)}
          onChange={(codes) =>
            onChange({ ...state, apcs: codes.map((code) => state.apcs.find((r) => r.code === code) ?? { code, mode: "count", value: 0, pro: 0 }) })
          }
          multiple
          max={MAX_APCS}
          wide
          emptyText={emptyText}
        />
      </div>

      {rows.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2.5 text-xs leading-relaxed">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
          <span>{LEVEL_CAUTION}</span>
        </p>
      )}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
          No APCs yet. Search in plain words (e.g. “ct scan”, “ed visit”, “colonoscopy”) or by APC number. APCs come in
          levels, and which level a service lands in depends on its billing code: confirm with your coding team.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => {
            const row = state.apcs.find((x) => x.code === r.code)!
            const peer = data.peers?.services[r.code]
            const published = baselineSet.has(r.code)
            return (
              <li key={r.code} className="surface rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] leading-snug font-medium">
                      <span className="num mr-1.5 text-muted-foreground">{r.code}</span>
                      {r.title}
                    </p>
                    <p className="num mt-0.5 text-xs text-muted-foreground">{formatUsd(r.rate, { compact: r.rate >= 100000 })} a service, {adjusted ? "wage-index-adjusted" : "national rate"}</p>
                    {context.facilityId && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {!published
                          ? "CMS publishes per-hospital counts only for comprehensive (procedure) APCs, so there’s no baseline for this one."
                          : data.baseline
                            ? `${baselineYear}: ${r.baseline != null ? `${formatInt(r.baseline)} Medicare services here` : "fewer than 11 Medicare services here"}${
                                data.peers ? (peer ? ` · peer median ${formatInt(peer.median)} (${peer.reporting} of ${data.peers.count} peers had 11+)` : ` · none of ${data.peers.count} peers had 11+`) : ""
                              }`
                            : "CMS publishes no Medicare outpatient services for this hospital."}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onChange({ ...state, apcs: state.apcs.filter((x) => x.code !== r.code) })}
                    aria-label={`Remove APC ${r.code}`}
                    className="-mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <div className="mt-2.5 flex flex-wrap items-end gap-2.5">
                  <NumberField
                    label={row.mode === "count" ? "Added services a year" : `Increase over ${baselineYear}`}
                    value={row.value}
                    onChange={(value) => setRow(r.code, { value })}
                    suffix={row.mode === "pct" ? "%" : undefined}
                    max={row.mode === "pct" ? 1000 : 1e7}
                    decimals={row.mode === "pct" ? 1 : 0}
                    className="w-40"
                  />
                  {r.baseline != null && (
                    <Segmented
                      label={`APC ${r.code}: enter as`}
                      size="sm"
                      value={row.mode}
                      onChange={(mode) => setRow(r.code, { mode, value: 0 })}
                      options={[
                        { value: "count", label: "Services" },
                        { value: "pct", label: "% of current" },
                      ]}
                      className="mb-1"
                    />
                  )}
                  {includesPro(state.scope) && (
                    <NumberField
                      label="Physician payment per service"
                      prefix="$"
                      value={row.pro}
                      onChange={(pro) => setRow(r.code, { pro })}
                      max={1e6}
                      decimals={2}
                      className="w-52"
                      hint={<SourceTag kind="assumption" />}
                    />
                  )}
                  <div className="mb-1 ml-auto text-right">
                    <p className="num text-[14px] font-medium">{formatUsd(r.facility + r.professional)}</p>
                    <p className="num text-xs text-muted-foreground">
                      {servicesText(r.added)} ×{" "}
                      {state.scope === "both" ? `(${formatUsd(r.rate)} + ${formatUsd(r.pro)})` : formatUsd(state.scope === "facility" ? r.rate : r.pro)}
                    </p>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {includesPro(state.scope) && rows.length > 0 && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Physician payments are your figures. For Medicare, look each billing code up in CMS’s{" "}
          <a href={PFS_LOOKUP} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
            Physician Fee Schedule Look-Up
          </a>{" "}
          (use the facility rate, since the service is done in the hospital) and enter the average across the codes in each APC.
        </p>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border pt-3">
        <NumberField
          label="Cost of providing the added services"
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
          {state.scope === "both" && revenue > 0 && (
            <p className="num text-xs text-muted-foreground">
              {formatUsd(facility)} hospital + {formatUsd(professional)} physician
            </p>
          )}
          {state.careCost > 0 && <p className="num text-xs text-muted-foreground">{formatUsd(revenue * (1 - state.careCost / 100))} after cost of care</p>}
        </div>
      </div>
    </div>
  )
}

/** Advanced mode's wage index: which one is in use, or why the national rate still is. */
function WageIndexNote({ data, facilityName }: { data: OutpatientData; facilityName: string | null }) {
  const wi = data.wageIndex
  const labor = Math.round(data.laborShare * 100)
  return (
    <p className="rounded-xl border border-dashed border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground">
      <SourceTag kind="data" className="mr-1.5">
        Advanced · wage index
      </SourceTag>
      {wi ? (
        <>
          {wi.hospital}’s {wi.year} OPPS wage index is <span className="num font-medium text-foreground">{wi.value.toFixed(4)}</span> ({wi.table}, CCN{" "}
          {wi.ccn}
          {wi.reportedWithName ? `, paid under ${wi.reportedWithName}’s Medicare number` : ""}). As CMS does, {labor}% of each national rate
          is multiplied by it: <span className="num">rate × ({(labor / 100).toFixed(2)} × {wi.value.toFixed(4)} + {(1 - labor / 100).toFixed(2)})</span>.
          Physician payments are your own figures and aren’t adjusted.{" "}
          <a href={wi.sourcePage} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
            CMS source
          </a>
        </>
      ) : facilityName ? (
        `CMS publishes no OPPS wage index for ${facilityName} (critical access, children’s, and cancer hospitals aren’t in CMS’s OPPS file), so the national rate is used.`
      ) : (
        "Pick a hospital to apply its CMS wage index; until then the national rate is used."
      )}
    </p>
  )
}

function MethodInfo({ data }: { data: OutpatientData }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="How the outpatient estimate works"
        className="inline-flex translate-y-0.5 items-center gap-0.5 rounded font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Info className="size-3.5" /> How it’s estimated
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-[70vh] w-96 max-w-[calc(100vw-2rem)] space-y-2 overflow-y-auto text-[13px] leading-relaxed">
        <p className="font-medium">National APC payment rate</p>
        <p className="text-muted-foreground">
          Hospital side: each APC’s national unadjusted payment rate from CMS’s OPPS Addendum A ({data.quarter} update, CY{" "}
          {data.calendarYear}
          {data.conversionFactor && `; relative weight × conversion factor ${formatUsd(data.conversionFactor)}`}). It includes the
          patient’s copay.
        </p>
        <p className="text-muted-foreground">
          This is a <span className="font-medium text-foreground">national estimate, not this hospital’s actual reimbursement.</span> Real
          payments also depend on the wage index (about 60% of the rate; California’s are mostly above 1), discounts when several
          procedures are done together, services packaged into others, and outliers. Critical access hospitals aren’t paid this
          way, and other payers pay differently.
        </p>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Why APCs, not CPT codes:</span> CPT codes and descriptions are licensed by the
          AMA for internal use only, so Padua works at the APC level. Each APC is a level (e.g. “Level 3 Imaging without
          Contrast”) covering many codes; which level a service lands in depends on its code, so confirm it with your coding or
          revenue integrity team.
        </p>
        <p className="text-muted-foreground">
          Physician payments are the proposer’s figures: CMS’s fee schedule is keyed by CPT, so it isn’t built in.
        </p>
        <p className="text-muted-foreground">
          Baseline services are Original Medicare (fee-for-service) outpatient services from CMS, published per hospital only for
          comprehensive (procedure) APCs; CMS hides counts under 11.
        </p>
        <a href={data.sourcePage} target="_blank" rel="noreferrer" className="inline-block font-medium text-primary hover:underline">
          CMS OPPS Addendum A ({data.quarter})
        </a>
      </PopoverContent>
    </Popover>
  )
}

export const outpatientModule = defineModule<State, OutpatientData>({
  id: "outpatient",
  label: "Outpatient reimbursement",
  payerMix: true,
  wageIndex: true,
  volume: {
    label: "Added services",
    scale: (s, k) => ({ ...s, apcs: s.apcs.map((r) => ({ ...r, value: r.value * k })) }),
    describe: (s, data, k) => {
      const entered = compute(s, data, false).reduce((t, r) => t + r.added, 0)
      return { value: `${servicesText(Math.ceil(entered * k * 10) / 10)} a year`, detail: `${Math.round(k * 100)}% of the ${servicesText(entered)} entered, in the same APC mix` }
    },
  },
  drivers: (s) => [
    { id: "price", label: "Payment per service" },
    ...(s.careCost ? [{ id: "care", label: "Cost of providing the added services", apply: (st: State, f: number) => ({ ...st, careCost: Math.min(100, st.careCost * f) }) }] : []),
  ],
  summary: "Added outpatient visits, scans, or procedures, valued by APC; physician fees optional.",
  icon: Stethoscope,
  hasData: true,
  initial: () => ({ apcs: [], scope: "facility", careCost: 0 }),
  toParams,
  fromParams,
  benefit: (s, data, { wageIndex }) => {
    if (!data) return { annual: 0, lines: [], notes: [], incomplete: "Loading the APC table…" }
    const rows = compute(s, data, wageIndex)
    const { adjusted } = pricing(data, wageIndex)
    const lines: BenefitLine[] = []
    for (const r of rows) {
      if (includesFacility(s.scope))
        lines.push({ label: `APC ${r.code} · ${r.title}${s.scope === "both" ? " (hospital)" : ""}`, detail: `${servicesText(r.added)} × ${formatUsd(r.rate)}${adjusted ? ` (wage-index-adjusted, ${adjusted.value.toFixed(4)})` : ""} · level to confirm with coding`, amount: r.facility })
      if (includesPro(s.scope))
        lines.push({ label: `APC ${r.code} · ${r.title} (physician)`, detail: `${servicesText(r.added)} × ${formatUsd(r.pro)}, proposer’s figure · level to confirm with coding`, amount: r.professional })
    }
    const revenue = rows.reduce((t, r) => t + r.facility + r.professional, 0)
    if (s.careCost > 0 && revenue) lines.push({ label: "Cost of providing the added services", detail: `${s.careCost}% of payment`, amount: (-revenue * s.careCost) / 100 })

    const notes = [SCOPE_NOTES[s.scope]]
    if (includesFacility(s.scope))
      notes.push(
        adjusted
          ? `Advanced: hospital payment per service is wage-index-adjusted for ${adjusted.hospital}: the APC’s CY ${data.calendarYear} national OPPS rate (Addendum A, ${data.quarter}) × (${data.laborShare.toFixed(2)} × wage index ${adjusted.value.toFixed(4)} + ${(1 - data.laborShare).toFixed(2)}), with the hospital’s wage index from CMS’s ${adjusted.table} (CCN ${adjusted.ccn}). Still an estimate, not the hospital’s actual reimbursement: multiple-procedure discounts, packaging, outliers, and payer mix aren’t applied.`
          : `Hospital payment per service = the APC’s CY ${data.calendarYear} national unadjusted OPPS rate (Addendum A, ${data.quarter}). A national Medicare estimate, not this hospital’s actual reimbursement: wage index, multiple-procedure discounts, packaging, outliers, and payer mix aren’t applied.`
      )
    if (wageIndex && includesFacility(s.scope) && !adjusted)
      notes.push("Advanced: the wage index adjustment is on, but CMS publishes no OPPS wage index for this hospital (or none is picked), so the national rate is used.")
    if (includesPro(s.scope))
      notes.push("Physician payments per service are the proposer’s figures; the hospital collects them only if it employs or bills for the physicians.")
    if (!s.careCost) notes.push("Counts revenue, not margin: the cost of providing the added services isn’t subtracted.")
    if (s.apcs.some((r) => r.mode === "pct") && data.baseline)
      notes.push(`Percent increases apply to ${data.baseline.year} Original Medicare (fee-for-service) outpatient services from CMS.`)

    const missingPro = includesPro(s.scope) && rows.some((r) => r.added && !r.pro)
    return {
      annual: lines.reduce((t, l) => t + l.amount, 0),
      lines,
      notes,
      caution: rows.length ? LEVEL_CAUTION : undefined,
      incomplete: !rows.length
        ? "Pick at least one APC."
        : !rows.some((r) => r.added)
          ? "Enter the added services for at least one APC."
          : missingPro
            ? "Enter the physician payment per service for each APC (or count hospital revenue only)."
            : undefined,
    }
  },
  Editor,
})
