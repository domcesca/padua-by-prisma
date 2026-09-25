"use client"

import { Info, ShieldCheck } from "lucide-react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatInt, formatPercent, formatUsd } from "@/lib/format"
import { defineModule, type BenefitLine, type ModuleEditorProps } from "@/lib/propose/module"
import {
  HAC_MEASURES,
  HRRP_CONDITIONS,
  adjustedErr,
  avoidedByYear,
  hacPenalized,
  hacScore,
  hrrpCounts,
  hrrpReduction,
  impliedShrinkage,
  phaseIn,
  readmissionsAvoided,
  windowYears,
  type HaiKey,
  type HrrpConditionKey,
  type InfectionCuts,
  type PenaltyData,
  type Period,
  type ReadmissionCuts,
  type Timing,
} from "@/lib/propose/penalty"
import { cn } from "@/lib/utils"
import { Toggle } from "../advanced-panel"
import { NumberField } from "../number-field"
import { SourceTag } from "../source-tag"

// Readmission and infection-reduction initiatives: the Medicare penalties they'd avoid. The
// proposer enters the improvement; the hospital's published HRRP and HAC Reduction Program
// results and CMS's formulas (lib/propose/penalty.ts) do the rest, phased in over the years the
// programs take to see it.

/**
 * `timing`: Advanced mode's phase-in years per program; unset = CMS's scoring windows. `lostRevenue`: Advanced, revenue
 * lost per readmission avoided, netted against the benefit. `damp`: Advanced, the share of a readmission cut that reaches
 * the ERR (1 = all of it). All three are ignored when Advanced is off, and the last two when switched off.
 */
type State = {
  readm: ReadmissionCuts
  hai: InfectionCuts
  timing: { readm?: Timing; hai?: Timing }
  lostRevenue: { on: boolean; perReadmission: number }
  damp: { on: boolean; factor: number }
}

const READM_KEYS = HRRP_CONDITIONS.map((c) => c.key) as string[]
const HAI_KEYS = HAC_MEASURES.map((m) => m.key) as string[]

const encode = (cuts: Record<string, number | undefined>) =>
  Object.entries(cuts)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}:${v}`)
    .join(",")

function decode<K extends string>(raw: string | null, keys: string[], max: number) {
  const out: Partial<Record<K, number>> = {}
  for (const part of (raw ?? "").split(",")) {
    const [k, v] = part.split(":")
    const n = Number(v)
    if (keys.includes(k) && Number.isFinite(n) && n > 0) out[k as K] = Math.min(max, n)
  }
  return out
}

function toParams(s: State): Record<string, string> {
  const out: Record<string, string> = {}
  if (encode(s.readm)) out.readm = encode(s.readm)
  if (encode(s.hai)) out.hai = encode(s.hai)
  const t = (["readm", "hai"] as const).filter((k) => s.timing[k]).map((k) => `${k}:${s.timing[k]!.start}-${s.timing[k]!.full}`)
  if (t.length) out.ptime = t.join(",")
  if (s.lostRevenue.on || s.lostRevenue.perReadmission) out.lostrev = `${s.lostRevenue.on ? "on" : "off"}:${s.lostRevenue.perReadmission}`
  if (s.damp.on || s.damp.factor !== 1) out.damp = `${s.damp.on ? "on" : "off"}:${s.damp.factor}`
  return out
}

/** "on:12000" → switched on, 12000. */
function parseSwitch(raw: string | null, fallback: number, max: number) {
  const m = (raw ?? "").match(/^(on|off):(\d+(?:\.\d+)?)$/)
  return m ? { on: m[1] === "on", value: Math.min(max, Number(m[2])) } : { on: false, value: fallback }
}

function parseTiming(raw: string | null): State["timing"] {
  const out: State["timing"] = {}
  for (const part of (raw ?? "").split(",")) {
    const m = part.match(/^(readm|hai):(\d+)-(\d+)$/)
    if (!m) continue
    const start = Math.min(30, Math.max(1, Number(m[2])))
    out[m[1] as "readm" | "hai"] = { start, full: Math.min(30, Math.max(start, Number(m[3]))) }
  }
  return out
}

function fromParams(params: URLSearchParams): State {
  const lost = parseSwitch(params.get("lostrev"), 0, 1e7)
  const damp = parseSwitch(params.get("damp"), 1, 1)
  return {
    readm: decode<HrrpConditionKey>(params.get("readm"), READM_KEYS, 100),
    hai: decode<HaiKey>(params.get("hai"), HAI_KEYS, 100),
    timing: parseTiming(params.get("ptime")),
    lostRevenue: { on: lost.on, perReadmission: lost.value },
    damp: { on: damp.on, factor: damp.value },
  }
}

const hasCuts = (s: State) => Object.values(s.readm).some(Boolean) || Object.values(s.hai).some(Boolean)

const monthYear = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" })
const periodText = (p: Period) => `${monthYear(p.start)}–${monthYear(p.end)}`

/** First year a program sees any of the improvement, and first year it sees all of it (CMS's windows, or the override). */
function timing(period: Period, fiscalYear: number, override?: Timing) {
  if (override) return { first: override.start, full: override.full }
  const shares = phaseIn(period, fiscalYear, 12)
  return { first: shares.findIndex((s) => s > 0) + 1, full: shares.findIndex((s) => s >= 1) + 1 }
}

/** The phase-in overrides in force: only in Advanced mode. */
const overrides = (s: State, advanced: boolean) => (advanced ? s.timing : {})
/** The dampening factor in force: 1 unless switched on in Advanced mode. */
const dampOf = (s: State, advanced: boolean) => (advanced && s.damp.on ? s.damp.factor : 1)
/** Revenue lost a year with the readmissions avoided (Advanced, switched on), from year 1. */
function lostRevenueOf(s: State, data: PenaltyData, advanced: boolean) {
  if (!advanced || !s.lostRevenue.on || !s.lostRevenue.perReadmission) return null
  const count = readmissionsAvoided(data.hrrp, s.readm)
  return count ? { count, amount: count * s.lostRevenue.perReadmission } : null
}

type Summary = {
  years: ReturnType<typeof avoidedByYear>
  hrrpFull: number
  hacFull: number
  hrrpAverage: number
  hacAverage: number
  /** Advanced: revenue lost a year with the readmissions avoided, or null. */
  lost: { count: number; amount: number } | null
}

function summarize(s: State, data: PenaltyData, life: number, advanced: boolean): Summary {
  const damp = dampOf(s, advanced)
  const years = avoidedByYear(data, s.readm, s.hai, life, overrides(s, advanced), damp)
  const pay = data.payments.hospital
  const hrrpFull = pay ? (hrrpReduction(data.hrrp, s.readm, 0) - hrrpReduction(data.hrrp, s.readm, 1, damp)) * pay.baseOperating : 0
  const hacFull =
    pay && data.hac.hospital?.penalized && !hacPenalized(data.hac, hacScore(data.hac, s.hai)) ? data.hac.reduction * pay.operating : 0
  const sum = (k: "hrrp" | "hac") => years.reduce((t, y) => t + y[k], 0)
  return { years, hrrpFull, hacFull, hrrpAverage: sum("hrrp") / life, hacAverage: sum("hac") / life, lost: lostRevenueOf(s, data, advanced) }
}

function Editor({ state, onChange, data, context }: ModuleEditorProps<State, PenaltyData>) {
  if (!context.facilityId) {
    return (
      <div className="space-y-3">
        <Intro />
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
          Pick a hospital above. This module works from that hospital’s own CMS penalty results.
        </p>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="space-y-3" aria-busy>
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-28 animate-pulse rounded-xl bg-muted" />
        <div className="h-28 animate-pulse rounded-xl bg-muted" />
      </div>
    )
  }

  const { hrrp, hac, payments } = data
  const pay = payments.hospital
  if (!hrrp.hospital && !hac.hospital) {
    return (
      <div className="space-y-3">
        <Intro data={data} />
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
          CMS publishes no readmission (HRRP) or hospital-acquired condition (HAC) penalty results for{" "}
          {context.facilityName ?? "this hospital"}. Critical access, children’s, psychiatric, rehabilitation, long-term care,
          and cancer hospitals aren’t in these programs, so there’s no penalty to avoid.
        </p>
      </div>
    )
  }

  const setReadm = (key: HrrpConditionKey, v: number) => onChange({ ...state, readm: { ...state.readm, [key]: v } })
  const setHai = (key: HaiKey, v: number) => onChange({ ...state, hai: { ...state.hai, [key]: v } })

  const damp = dampOf(state, context.advanced)
  const hrrpNow = hrrpReduction(hrrp, state.readm, 0)
  const hrrpAfter = hrrpReduction(hrrp, state.readm, 1, damp)
  const scoreNow = hac.hospital?.totalScore ?? null
  const scoreAfter = hacScore(hac, state.hai)
  const hacNow = hac.hospital?.penalized ?? false

  return (
    <div className="space-y-4">
      <Intro data={data} />
      {data.reportedWithName && (
        <p className="text-xs text-muted-foreground">
          CMS reports this hospital’s results together with {data.reportedWithName} under one Medicare number; the figures
          below are for both.
        </p>
      )}

      {/* HRRP */}
      <section className="surface space-y-3 rounded-xl p-3">
        <header className="space-y-1">
          <h3 className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
            Readmissions (HRRP) <SourceTag kind="data">CMS FY {hrrp.fiscalYear}</SourceTag>
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {hrrp.hospital ? (
              <>
                FY {hrrp.fiscalYear} penalty: <span className="num font-medium text-foreground">{formatPercent(hrrp.hospital.reduction, 2)}</span> of
                base Medicare DRG payments
                {pay && (
                  <>
                    , about <span className="num font-medium text-foreground">{formatUsd(hrrpNow * pay.baseOperating)}</span> a year
                  </>
                )}
                . Scored on {periodText(hrrp.period)} discharges, against hospitals with a similar share of patients on both
                Medicare and Medi-Cal (peer group {hrrp.hospital.peerGroup} of 5).
              </>
            ) : (
              "CMS publishes no HRRP results for this hospital."
            )}
          </p>
        </header>
        {hrrp.hospital && (
          <ul className="space-y-2">
            {HRRP_CONDITIONS.map(({ key, label }) => {
              const c = hrrp.hospital!.conditions[key]
              if (!c) return null
              const counts = hrrpCounts(c, hrrp.minDischarges)
              const cut = state.readm[key] ?? 0
              const err = adjustedErr(c, cut, 1, damp)
              const above = c.peerMedian != null && c.err > c.peerMedian
              return (
                <li key={key} className="border-t border-border pt-2 first:border-0 first:pt-0">
                  <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="text-[13px] font-medium">{label}</p>
                      <p className="num text-xs text-muted-foreground">
                        {c.predicted != null && `Rate ${c.predicted.toFixed(1)}% (expected ${c.expected?.toFixed(1)}%) · `}
                        ERR {c.err.toFixed(3)}
                        {c.peerMedian != null && ` vs peer median ${c.peerMedian.toFixed(3)}`}
                        {c.discharges != null && ` · ${formatInt(c.discharges)} cases`}
                      </p>
                      <p className={cn("text-xs", counts && above ? "text-foreground" : "text-muted-foreground")}>
                        {!counts
                          ? `Under ${hrrp.minDischarges} cases: doesn’t count toward the penalty.`
                          : above
                            ? cut
                              ? `ERR ${c.err.toFixed(3)} → ${err.toFixed(3)}${err <= c.peerMedian! ? ": at or below the median, no penalty from it" : ""}`
                              : "Above the peer median: adds to the penalty."
                            : "Already at or below the peer median: a cut here avoids no penalty."}
                      </p>
                    </div>
                    {counts && above && c.predicted != null && (
                      <NumberField
                        label="Cut in rate"
                        suffix="points"
                        value={cut}
                        onChange={(v) => setReadm(key, v)}
                        max={Math.floor(c.predicted * 10) / 10}
                        decimals={1}
                        className="w-36"
                      />
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {hrrp.hospital && Object.values(state.readm).some(Boolean) && (
          <p className="num border-t border-border pt-2 text-[13px]">
            Penalty {formatPercent(hrrpNow, 2)} → <span className="font-medium">{formatPercent(hrrpAfter, 2)}</span> of base DRG payments
            {damp !== 1 && <span className="text-muted-foreground"> (dampened × {damp.toFixed(2)})</span>}
          </p>
        )}
        {context.advanced && hrrp.hospital && <ReadmissionAdvanced state={state} data={data} onChange={onChange} />}
      </section>

      {/* HAC */}
      <section className="surface space-y-3 rounded-xl p-3">
        <header className="space-y-1">
          <h3 className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
            Hospital-acquired conditions (HAC) <SourceTag kind="data">CMS FY {hac.fiscalYear}</SourceTag>
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {hac.hospital && scoreNow != null ? (
              <>
                All or nothing: hospitals whose Total HAC Score is above the national cutoff (worst quarter) lose 1% of Medicare
                payments. FY {hac.fiscalYear}: score <span className="num font-medium text-foreground">{scoreNow.toFixed(3)}</span>, cutoff{" "}
                <span className="num">{hac.cutoff.toFixed(3)}</span>:{" "}
                {hacNow ? (
                  <span className="font-medium text-foreground">
                    penalized{pay && `, about ${formatUsd(hac.reduction * pay.operating)} a year`}.
                  </span>
                ) : (
                  <span className="font-medium text-foreground">
                    not penalized ({(hac.cutoff - scoreNow).toFixed(3)} below the cutoff), so there’s no HAC penalty to avoid.
                  </span>
                )}{" "}
                Infections scored {periodText(hac.periods.hai)}.
              </>
            ) : (
              "CMS publishes no Total HAC Score for this hospital."
            )}
          </p>
        </header>
        {hac.hospital && scoreNow != null && (
          <ul className="space-y-2">
            {HAC_MEASURES.map(({ key, label }) => {
              const m = hac.hospital!.measures[key]
              if (!m) return null
              const p = hac.measures[key]
              return (
                <li key={key} className="border-t border-border pt-2 first:border-0 first:pt-0">
                  <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="text-[13px] font-medium">{label}</p>
                      <p className="num text-xs text-muted-foreground">
                        {m.value != null ? `SIR ${m.value.toFixed(3)}` : "SIR not published"} (national average {p.mean.toFixed(2)}) · score {m.z.toFixed(2)}
                      </p>
                    </div>
                    {m.value != null && m.value > 0 && hacNow && (
                      <NumberField
                        label="Fewer infections"
                        suffix="%"
                        value={state.hai[key] ?? 0}
                        onChange={(v) => setHai(key, v)}
                        max={100}
                        decimals={0}
                        className="w-36"
                      />
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {hacNow && Object.values(state.hai).some(Boolean) && scoreAfter != null && (
          <p className="num border-t border-border pt-2 text-[13px]">
            Score {scoreNow!.toFixed(3)} → <span className="font-medium">{scoreAfter.toFixed(3)}</span>
            {hacPenalized(hac, scoreAfter)
              ? `: still above the cutoff (${hac.cutoff.toFixed(3)}), so the penalty stays.`
              : `: below the FY ${hac.fiscalYear} cutoff (${hac.cutoff.toFixed(3)}), avoiding the 1% penalty.`}
          </p>
        )}
      </section>

      {pay ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          <SourceTag kind="data" className="mr-1.5">
            CMS FY {payments.fiscalYear} estimate
          </SourceTag>
          Medicare fee-for-service payments the penalties apply to: base DRG payments{" "}
          <span className="num text-foreground">{formatUsd(pay.baseOperating, { compact: true })}</span> ({formatInt(pay.cases)} cases ×
          case mix {pay.caseMixIndex.toFixed(2)} × wage-adjusted rate); with teaching, DSH, and outlier add-ons{" "}
          <span className="num text-foreground">{formatUsd(pay.operating, { compact: true })}</span>.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          CMS’s FY {payments.fiscalYear} Impact File has no payment data for this hospital, so penalties can’t be put in dollars.
        </p>
      )}
    </div>
  )
}

/** Advanced mode's readmission options: lost revenue netted out, and dampening for CMS's pull toward the average. */
function ReadmissionAdvanced({ state, data, onChange }: { state: State; data: PenaltyData; onChange: (s: State) => void }) {
  const count = readmissionsAvoided(data.hrrp, state.readm)
  const years = windowYears(data.hrrp.period)
  const implied = impliedShrinkage(data.hrrp)
  const setLost = (patch: Partial<State["lostRevenue"]>) => onChange({ ...state, lostRevenue: { ...state.lostRevenue, ...patch } })
  const setDamp = (patch: Partial<State["damp"]>) => onChange({ ...state, damp: { ...state.damp, ...patch } })
  return (
    <div className="space-y-3 rounded-xl border border-dashed border-border p-3">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Toggle label="Subtract revenue lost with the readmissions avoided" checked={state.lostRevenue.on} onChange={(on) => setLost({ on })} />
          <SourceTag kind="assumption">Advanced · optional</SourceTag>
        </div>
        {state.lostRevenue.on && (
          <div className="flex flex-wrap items-end gap-3">
            <NumberField
              label="Revenue lost per avoided readmission"
              prefix="$"
              value={state.lostRevenue.perReadmission}
              onChange={(perReadmission) => setLost({ perReadmission })}
              max={1e7}
              className="w-60"
            />
            <p className="num mb-2.5 text-[13px] text-muted-foreground">
              {count ? (
                <>
                  ≈ {count.toLocaleString("en-US", { maximumFractionDigits: 1 })} fewer readmissions a year × {formatUsd(state.lostRevenue.perReadmission)} ={" "}
                  <span className="font-medium text-foreground">−{formatUsd(count * state.lostRevenue.perReadmission)}</span> a year
                </>
              ) : (
                "Enter a readmission cut above to count the readmissions avoided."
              )}
            </p>
          </div>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">
          Why it matters: a readmission is also a paid stay. Fewer readmissions avoid the penalty but give up that payment,
          which the estimate otherwise leaves out (see “How it’s estimated”); for many hospitals the lost payment is larger
          than the penalty avoided. Readmissions avoided = each cut × the condition’s Medicare discharges a year (CMS’s{" "}
          {Math.round(years)}-year count ÷ {Math.round(years)}), from year 1. Enter the fee-for-service revenue one readmission
          brings in: all payers’ readmissions fall too, but only these Medicare patients are counted.
        </p>
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Toggle label="Dampen for CMS’s pull toward the average" checked={state.damp.on} onChange={(on) => setDamp({ on })} />
          <SourceTag kind="assumption">Advanced · optional</SourceTag>
        </div>
        {state.damp.on && (
          <div className="flex flex-wrap items-end gap-3">
            <NumberField
              label="Share of a cut that reaches the penalty"
              prefix="×"
              value={state.damp.factor}
              onChange={(factor) => setDamp({ factor: Math.min(1, Math.max(0, factor)) })}
              max={1}
              decimals={2}
              className="w-56"
            />
            {implied.weighted != null && (
              <button
                type="button"
                onClick={() => setDamp({ factor: Math.round(implied.weighted! * 100) / 100 })}
                className="mb-1 inline-flex h-8 items-center rounded-full px-2.5 text-[12px] font-medium text-primary hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                Use {implied.weighted.toFixed(2)} (this hospital, rough)
              </button>
            )}
          </div>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">
          CMS’s risk model pulls each hospital’s rate toward the average, more for smaller hospitals, so a real cut moves the
          ratio CMS scores less than the full amount. 1.00 (the default) assumes the whole cut counts; a lower factor keeps only
          that share, for a more conservative estimate.
          {implied.weighted != null && (
            <>
              {" "}
              For reference, in CMS’s FY {data.hrrp.fiscalYear} figures this hospital’s risk-adjusted rates sit about{" "}
              <span className="num">{implied.weighted.toFixed(2)}</span> of the way from expected to its raw rates (
              {implied.conditions.map((c) => `${c.label.split(" (")[0].toLowerCase()} ${c.factor.toFixed(2)}`).join(", ")}): a rough
              reading of that pull, not a CMS figure.
            </>
          )}
        </p>
      </div>
    </div>
  )
}

/** Year-by-year phase-in, shown under the editor's totals. */
function Timeline({ summary }: { summary: Summary }) {
  return (
    <div className="max-h-64 overflow-auto rounded-lg border border-border">
      <table className="num w-full text-xs">
        <thead className="sticky top-0 bg-background text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium">Year</th>
            <th className="px-2 py-1.5 text-right font-medium">Readmissions seen</th>
            <th className="px-2 py-1.5 text-right font-medium">Infections seen</th>
            <th className="px-2 py-1.5 text-right font-medium">Avoided</th>
          </tr>
        </thead>
        <tbody>
          {summary.years.map((y) => (
            <tr key={y.year} className="border-t border-border">
              <td className="px-2 py-1">{y.year}</td>
              <td className="px-2 py-1 text-right">{Math.round(y.hrrpShare * 100)}%</td>
              <td className="px-2 py-1 text-right">{Math.round(y.haiShare * 100)}%</td>
              <td className="px-2 py-1 text-right">{formatUsd(y.hrrp + y.hac)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Intro({ data }: { data?: PenaltyData }) {
  return (
    <p className="text-[13px] leading-relaxed text-muted-foreground">
      For readmission and infection-reduction work. Enter the improvement you expect{" "}
      <SourceTag kind="assumption" />; the module re-runs CMS’s penalty formulas on the hospital’s published results to
      estimate the Medicare penalty it would avoid. {data && <MethodInfo data={data} />}
    </p>
  )
}

function MethodInfo({ data }: { data: PenaltyData }) {
  const r = timing(data.hrrp.period, data.hrrp.fiscalYear)
  const h = timing(data.hac.periods.hai, data.hac.fiscalYear)
  return (
    <Popover>
      <PopoverTrigger
        aria-label="How the penalty estimate works"
        className="inline-flex translate-y-0.5 items-center gap-0.5 rounded font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Info className="size-3.5" /> How it’s estimated
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-[70vh] w-[26rem] max-w-[calc(100vw-2rem)] space-y-2 overflow-y-auto text-[13px] leading-relaxed">
        <p className="font-medium">An estimate built on CMS’s own formulas</p>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Readmissions (HRRP):</span> the penalty is the sum, over conditions with{" "}
          {data.hrrp.minDischarges}+ cases, of each condition’s share of DRG payments × how far its excess readmission ratio (ERR)
          sits above its peer group’s median, times a neutrality modifier, capped at {formatPercent(data.hrrp.cap, 0)} of base DRG
          payments. Using the FY {data.hrrp.fiscalYear} components, this reproduces CMS’s published penalty for every hospital. A cut
          of x points is treated as lowering the hospital’s predicted rate by x; CMS’s model pulls smaller hospitals toward the
          average, so their ERR usually moves less. Peer medians are held where they are.
        </p>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Hospital-acquired conditions (HAC):</span> each infection’s standardized
          infection ratio (SIR) falls by the percent entered, is rescored against the FY {data.hac.fiscalYear} national average and
          spread, and the Total HAC Score is compared with that year’s cutoff ({data.hac.cutoff.toFixed(4)}). The penalty is all or
          nothing, and the cutoff moves every year as other hospitals improve. The patient safety measure (PSI 90) stays as published.
        </p>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Timing:</span> both programs score performance that ended one to two years
          before the payment year. Taking the improvement to start with year 1 (and year 1 to start on October 1, the federal fiscal
          year), readmission savings begin in year {r.first} and reach full effect in year {r.full}; infection savings begin in year{" "}
          {h.first} and reach full effect in year {h.full}. The yearly benefit is the average over the useful life.
        </p>
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Dollars:</span> Medicare fee-for-service payments estimated from CMS’s FY{" "}
          {data.payments.fiscalYear} IPPS Impact File, not the hospital’s claims. Medicare Advantage isn’t penalized. Not counted:
          payments for the readmissions that no longer happen (lost revenue), or the cost of care avoided.
        </p>
        <div className="flex flex-wrap gap-x-3">
          <a href={data.hrrp.sourcePage} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
            CMS HRRP data
          </a>
          <a href={data.hac.sourcePage} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
            CMS HAC data
          </a>
          <a href={data.payments.sourcePage} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
            FY {data.payments.fiscalYear} Final Rule files
          </a>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** The editor's totals and phase-in table, which need the useful life (only `benefit` gets it). */
function Totals({ state, data, life, advanced, onChange }: { state: State; data: PenaltyData; life: number; advanced: boolean; onChange: (s: State) => void }) {
  const s = summarize(state, data, life, advanced)
  const average = s.hrrpAverage + s.hacAverage - (s.lost?.amount ?? 0)
  const full = s.hrrpFull + s.hacFull
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
          Full effect <span className="num font-medium text-foreground">{formatUsd(full)}</span> a year, reached as the programs’
          scoring windows fill with improved months (below).
        </p>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">
            Average a year over {life} {life === 1 ? "year" : "years"}
          </p>
          <p className="num text-[20px] font-semibold tracking-tight">{formatUsd(average)}</p>
          {s.lost && <p className="num text-xs text-muted-foreground">after −{formatUsd(s.lost.amount)} lost readmission revenue</p>}
        </div>
      </div>
      {advanced && <TimingEditor state={state} data={data} onChange={onChange} />}
      {full > 0 && <Timeline summary={s} />}
    </div>
  )
}

/** Advanced mode: move each program's phase-in. Left at CMS's years, CMS's scoring-window shares are used. */
function TimingEditor({ state, data, onChange }: { state: State; data: PenaltyData; onChange: (s: State) => void }) {
  const programs = [
    { key: "readm" as const, label: "Readmission savings", cms: timing(data.hrrp.period, data.hrrp.fiscalYear) },
    { key: "hai" as const, label: "Infection savings", cms: timing(data.hac.periods.hai, data.hac.fiscalYear) },
  ]
  const set = (key: "readm" | "hai", start: number, full: number, cms: { first: number; full: number }) => {
    const s = Math.min(30, Math.max(1, Math.round(start) || 1))
    const f = Math.min(30, Math.max(s, Math.round(full) || s))
    // Back at CMS's years: drop the override, so CMS's own shares apply again.
    const next = s === cms.first && f === cms.full ? undefined : { start: s, full: f }
    onChange({ ...state, timing: { ...state.timing, [key]: next } })
  }
  return (
    <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
      <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
        Phase-in timing <SourceTag kind="assumption">Advanced · optional</SourceTag>
      </p>
      {programs.map(({ key, label, cms }) => {
        const t = state.timing[key]
        return (
          <div key={key} className="flex flex-wrap items-end gap-2.5">
            <p className="w-40 pb-2.5 text-[13px]">{label}</p>
            <NumberField label="Starts in year" value={t?.start ?? cms.first} onChange={(v) => set(key, v, Math.max(v, t?.full ?? cms.full), cms)} min={1} max={30} className="w-32" />
            <NumberField label="Full in year" value={t?.full ?? cms.full} onChange={(v) => set(key, t?.start ?? cms.first, v, cms)} min={1} max={30} className="w-32" />
            {t && (
              <button type="button" onClick={() => onChange({ ...state, timing: { ...state.timing, [key]: undefined } })} className="mb-2 text-[12px] font-medium text-primary hover:underline">
                Use CMS timing
              </button>
            )}
          </div>
        )
      })}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Defaults follow CMS’s scoring windows (e.g. 25% → 58% → 92% → 100% for readmissions). Changing a year switches that
        program to a straight-line ramp between the two years.
      </p>
    </div>
  )
}

export const penaltyModule = defineModule<State, PenaltyData>({
  id: "penalty",
  label: "Avoided penalties",
  summary: "Readmission or infection reduction, valued by the Medicare penalties it avoids.",
  icon: ShieldCheck,
  hasData: true,
  initial: () => ({ readm: {}, hai: {}, timing: {}, lostRevenue: { on: false, perReadmission: 0 }, damp: { on: false, factor: 1 } }),
  advancedExtras: ["phase-in timing", "lost readmission revenue", "readmission dampening"],
  volume: {
    label: "Improvement (readmission and infection cuts)",
    scale: (s, k, data) => ({
      ...s,
      readm: Object.fromEntries(
        Object.entries(s.readm).map(([key, v]) => [key, Math.min((v ?? 0) * k, data?.hrrp.hospital?.conditions[key as HrrpConditionKey]?.predicted ?? 100)])
      ),
      hai: Object.fromEntries(Object.entries(s.hai).map(([key, v]) => [key, Math.min((v ?? 0) * k, 100)])),
    }),
    describe: (s, _data, k) => {
      const parts = [
        ...HRRP_CONDITIONS.filter((c) => s.readm[c.key]).map((c) => `${c.label.split(" (")[0].toLowerCase()} −${((s.readm[c.key] ?? 0) * k).toFixed(1)} pts`),
        ...HAC_MEASURES.filter((m) => s.hai[m.key]).map((m) => `${m.label.match(/\(([^)]+)\)/)?.[1] ?? m.label} −${Math.min(100, (s.hai[m.key] ?? 0) * k).toFixed(0)}%`),
      ]
      return { value: `${Math.round(k * 100)}% of the improvement entered`, detail: parts.join(", ") }
    },
  },
  drivers: (s, _data, { advanced }) => [
    ...(advanced && s.lostRevenue.on && s.lostRevenue.perReadmission
      ? [{ id: "lostrev", label: "Revenue lost per readmission", apply: (st: State, f: number) => ({ ...st, lostRevenue: { ...st.lostRevenue, perReadmission: st.lostRevenue.perReadmission * f } }) }]
      : []),
    ...(advanced && s.damp.on ? [{ id: "damp", label: "Dampening factor", apply: (st: State, f: number) => ({ ...st, damp: { ...st.damp, factor: Math.min(1, st.damp.factor * f) } }) }] : []),
  ],
  ownTiming: true,
  toParams,
  fromParams,
  benefit: (s, data, { life, advanced }) => {
    if (!data) return { annual: 0, lines: [], notes: [], incomplete: "Pick a hospital to load its CMS penalty results." }
    if (!data.hrrp.hospital && !data.hac.hospital)
      return { annual: 0, lines: [], notes: [], incomplete: "CMS has no readmission or HAC penalty results for this hospital." }
    if (!data.payments.hospital)
      return { annual: 0, lines: [], notes: [], incomplete: "CMS has no payment data for this hospital, so penalties can’t be put in dollars." }

    const sum = summarize(s, data, life, advanced)
    const o = overrides(s, advanced)
    const r = timing(data.hrrp.period, data.hrrp.fiscalYear, o.readm)
    const h = timing(data.hac.periods.hai, data.hac.fiscalYear, o.hai)
    const over = `averaged over ${life} ${life === 1 ? "year" : "years"}`
    const lines: BenefitLine[] = []
    if (Object.values(s.readm).some(Boolean))
      lines.push({
        label: "Readmission penalty avoided (HRRP)",
        detail: `${formatUsd(sum.hrrpFull)} a year at full effect (year ${r.full} on), ${over}`,
        amount: sum.hrrpAverage,
      })
    if (Object.values(s.hai).some(Boolean))
      lines.push({
        label: "HAC penalty avoided",
        detail: sum.hacFull ? `${formatUsd(sum.hacFull)} a year from year ${h.full}, ${over}` : "Score stays above the cutoff",
        amount: sum.hacAverage,
      })

    if (sum.lost)
      lines.push({
        label: "Revenue lost with the readmissions avoided (advanced)",
        detail: `${sum.lost.count.toLocaleString("en-US", { maximumFractionDigits: 1 })} Medicare readmissions a year × ${formatUsd(s.lostRevenue.perReadmission)}, from year 1`,
        amount: -sum.lost.amount,
      })
    const damp = dampOf(s, advanced)

    const custom = [o.readm && `readmissions years ${o.readm.start}–${o.readm.full}`, o.hai && `infections years ${o.hai.start}–${o.hai.full}`].filter(Boolean)
    const notes = [
      `Estimate. Re-runs CMS’s HRRP and HAC Reduction Program formulas on the hospital’s published FY ${data.hrrp.fiscalYear} results with the proposer’s assumed reductions; peer medians and the HAC cutoff (${data.hac.cutoff.toFixed(4)}) are held at FY ${data.hac.fiscalYear} levels, though they move every year.`,
      `Penalties lag performance: savings begin in year ${Math.min(r.first, h.first)} and reach full effect by year ${Math.max(r.full, h.full)} (assuming the work starts October 1 of year 1). The yearly benefit is the average over the useful life.`,
      ...(custom.length ? [`Advanced: phase-in timing set by the proposer (${custom.join("; ")}, straight-line), instead of CMS’s scoring windows.`] : []),
      ...(damp !== 1 && Object.values(s.readm).some(Boolean)
        ? [`Advanced: readmission cuts are dampened × ${damp.toFixed(2)} before they reach the excess readmission ratio, for CMS’s pull of each hospital’s rate toward the average (proposer’s estimate).`]
        : []),
      sum.lost
        ? `Penalty dollars use FY ${data.payments.fiscalYear} Medicare fee-for-service payments estimated from CMS’s IPPS Impact File. Advanced: revenue lost with the readmissions avoided is subtracted: each cut × the condition’s Medicare discharges a year (CMS’s ${Math.round(windowYears(data.hrrp.period))}-year count), × ${formatUsd(s.lostRevenue.perReadmission)} a readmission (proposer’s figure), from year 1. Other payers’ readmissions and care costs saved aren’t counted.`
        : `Penalty dollars use FY ${data.payments.fiscalYear} Medicare fee-for-service payments estimated from CMS’s IPPS Impact File. Lost payments for the readmissions avoided, and care costs saved, aren’t counted.`,
    ]
    return {
      annual: sum.hrrpAverage + sum.hacAverage - (sum.lost?.amount ?? 0),
      lines,
      notes,
      incomplete: hasCuts(s) ? undefined : "Enter a readmission or infection reduction.",
    }
  },
  Editor: (props) => {
    const { data, state } = props
    return (
      <div className="space-y-4">
        <Editor {...props} />
        {data && data.payments.hospital && (data.hrrp.hospital || data.hac.hospital) && hasCuts(state) && (
          <Totals state={state} data={data} life={props.context.life} advanced={props.context.advanced} onChange={props.onChange} />
        )}
      </div>
    )
  },
})
