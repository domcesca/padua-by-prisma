"use client"

import { ChevronRight, Info } from "lucide-react"
import { useState } from "react"

import { PickerPill } from "@/components/shell/grouped-picker"
import { Segmented } from "@/components/shell/segmented"
import { SourceTag } from "@/components/propose/source-tag"
import { StandingBadge } from "@/components/shell/standing"
import { StatusLine } from "@/components/shell/status-line"
import { metricStanding, rankText } from "@/lib/favorability"
import { formatInt, formatPercent, formatUsd } from "@/lib/format"
import type { PeerStats, SpecialtyCell, SpecialtyHospital, SpecialtyResult } from "@/lib/specialty/compute"
import { MAX_COMPARE, MDC_BY_CODE, mdcLabel, type MdcInfo } from "@/lib/specialty/mdc"
import { cn } from "@/lib/utils"
import type { FacilityOption } from "./facility-picker"

// Benchmark's specialty view: Medicare fee-for-service cases and estimated payments by MDC (lib/specialty). Every
// figure is CMS public data, aggregated; nothing is assumed. The scope note stays on screen because this is easy to
// misread as the hospital's total volume.

type Measure = "cases" | "payment" | "share"

const MEASURES: { value: Measure; label: string }[] = [
  { value: "cases", label: "Cases" },
  { value: "payment", label: "Est. payment" },
  { value: "share", label: "Share of cases" },
]

/** An MDC with no DRG at 11+ cases (CMS suppresses those rows). */
const SUPPRESSED = "Fewer than 11 in each DRG"
const SUPPRESSED_SHORT = "<11 per DRG"

/** The specialty column stays put while the numbers scroll sideways on a narrow screen. */
const STICKY = "sticky left-0 z-10 w-[11rem] min-w-[11rem] bg-background sm:static sm:w-auto sm:bg-transparent"

const mdcInfo = (key: string): MdcInfo => MDC_BY_CODE.get(key) ?? { code: key, official: `MDC ${key}`, name: `MDC ${key}`, plain: "" }

function formatMeasure(cell: SpecialtyCell | undefined, measure: Measure, compact = false) {
  if (!cell) return null
  if (measure === "cases") return formatInt(cell.cases)
  if (measure === "payment") return formatUsd(cell.payment, { compact })
  return formatPercent(cell.share)
}

function formatStat(stats: PeerStats, measure: Measure) {
  const v = measure === "cases" ? stats.median : measure === "payment" ? stats.medianPayment : stats.medianShare
  if (v == null) return null
  return measure === "cases" ? formatInt(Math.round(v)) : measure === "payment" ? formatUsd(v, { compact: true }) : formatPercent(v)
}

/** Case volume isn't favorable or unfavorable in itself: the label says so, and the rank follows. */
function standing(stats: PeerStats | undefined) {
  if (!stats || stats.percentile == null || stats.reporting === 0) return null
  const s = metricStanding("specialtyCases", stats.percentile, stats.reporting)!
  return (
    <span className="flex flex-col items-end gap-0.5">
      <StandingBadge standing={s} short title={s === "depends" ? "More or fewer Medicare cases in a specialty depends on the hospital's strategy." : undefined} />
      <span className="text-xs">{rankText(stats.percentile, stats.reporting)}</span>
    </span>
  )
}

export function SpecialtyPanel({
  result,
  specialty,
  onSpecialty,
  facilities,
  onCompare,
  loading,
}: {
  result: SpecialtyResult
  /** "all" or one MDC key. */
  specialty: string
  onSpecialty: (key: string) => void
  facilities: FacilityOption[]
  onCompare: (ids: string[]) => void
  loading: boolean
}) {
  const [measure, setMeasure] = useState<Measure>("cases")
  const compareOptions = facilities
    .filter((f) => f.id !== result.facility.id)
    .map((f) => ({ value: f.id, label: f.name, hint: f.county ?? undefined, keywords: [f.city ?? "", f.county ?? ""] }))
  const selectedCompare = result.compare.map((h) => h.id)

  return (
    <div className={cn("space-y-4 transition-opacity duration-200", loading && "opacity-60")}>
      <ScopeNote result={result} />
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Show" value={measure} onChange={setMeasure} options={MEASURES} size="sm" />
        <PickerPill
          noun="hospitals"
          label="Compare side by side"
          summary={selectedCompare.length ? `Side by side: ${selectedCompare.length}` : null}
          options={compareOptions}
          selected={selectedCompare}
          onChange={onCompare}
          multiple
          max={MAX_COMPARE}
          wide
          actions={selectedCompare.length ? [{ label: "Clear", onSelect: () => onCompare([]) }] : undefined}
        />
      </div>
      {!result.hospital && (
        <p className="rounded-xl bg-black/4 px-3.5 py-2.5 text-[13px] leading-relaxed text-muted-foreground dark:bg-white/6">
          CMS has no Medicare inpatient claims for {result.facility.name} in {result.year}. Hospitals not paid under
          Medicare&apos;s inpatient prospective payment system (critical access, children&apos;s, psychiatric,
          rehabilitation, and long-term care hospitals) aren&apos;t in this data.
          {result.peers.length > 0 && " Peers are still listed below."}
        </p>
      )}
      {specialty === "all" ? (
        <Overview result={result} measure={measure} onSpecialty={onSpecialty} />
      ) : (
        <OneSpecialty result={result} mdc={specialty} measure={measure} />
      )}
    </div>
  )
}

function ScopeNote({ result }: { result: SpecialtyResult }) {
  const [open, setOpen] = useState(false)
  return (
    <section aria-label="What this covers" className="glass rounded-2xl px-5 py-4 text-[13px] leading-relaxed">
      <div className="flex flex-wrap items-center gap-2">
        <SourceTag kind="data">Public data · CMS {result.year}</SourceTag>
        <p className="font-medium">Original Medicare (fee-for-service) inpatient cases only, not the hospital&apos;s total volume.</p>
      </div>
      <StatusLine
        className="mt-1.5"
        through={String(result.year)}
        periodType="Calendar year (discharges)"
        published={result.source.published[result.year] ? `Published ${result.source.published[result.year]}` : null}
        processed={`Processed ${result.source.processed}`}
        flags={[...(result.hospital ? [] : (["unavailable"] as const)), ...(result.source.matched ? (["matched-record"] as const) : [])]}
        flagDetail={{ "matched-record": result.source.matched ?? undefined }}
      />
      <p className="mt-1.5 text-muted-foreground">
        {result.year} discharges at hospitals paid under Medicare&apos;s inpatient prospective payment system (IPPS).
        Excluded: Medicare Advantage, Medi-Cal, commercial, and every other payer; critical access, psychiatric,
        rehabilitation, long-term care, and children&apos;s hospitals; and psychiatric or rehab units paid outside IPPS.
        Specialties are CMS&apos;s Major Diagnostic Categories (MDCs), which group DRGs by body system and don&apos;t always
        match one clinical specialty; the <Info className="inline size-3.5 align-[-2px]" aria-label="note" /> notes say
        where one spans several.
      </p>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-medium text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} aria-hidden />
        How the counts and payments work
      </button>
      {open && (
        <ul className="fade-up mt-1.5 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            CMS doesn&apos;t publish a hospital&apos;s count for any DRG with fewer than 11 cases. A specialty&apos;s count
            adds up its DRGs with 11 or more, so it&apos;s a floor; a specialty with none shows &ldquo;{SUPPRESSED.toLowerCase()}&rdquo;,
            which can still add up to more than 10 cases.
          </li>
          <li>
            Estimated payment = cases × the DRG&apos;s FY {result.fiscalYear} relative weight × the national operating
            standardized amount ({formatUsd(result.rate, { cents: true })}), the same estimate as Propose&apos;s Inpatient
            reimbursement. It&apos;s a national-average operating payment at current rates, so hospitals compare on volume and
            case mix alone; the hospital&apos;s actual payments also depend on its wage index, teaching and
            safety-net add-ons, outliers, and capital.
          </li>
          {result.retired && (
            <li>
              {formatInt(result.retired.cases)} of this hospital&apos;s cases are in DRGs CMS has since retired (for example
              the spinal fusion DRGs split up in FY 2025). They count toward their specialty, priced at the weight in the
              last CMS table that listed them.
            </li>
          )}
          <li>
            Share of cases = the specialty&apos;s cases ÷ the hospital&apos;s counted Medicare cases in every specialty. Peer
            medians count only peers with at least one DRG at 11 or more cases in the specialty.
          </li>
          {result.hospital?.reportedWithName && (
            <li>
              CMS reports this hospital together with {result.hospital.reportedWithName} under one Medicare number; the
              figures are for both.
            </li>
          )}
          <li>
            Sources:{" "}
            <a href={result.sourcePage} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              CMS Medicare Inpatient Hospitals by Provider and Service
            </a>{" "}
            ({result.year}) and the{" "}
            <a href={result.ippsSourcePage} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              FY {result.fiscalYear} IPPS Final Rule
            </a>{" "}
            (Table 5 for each DRG&apos;s MDC and weight; Table 1A for the standardized amount).
          </li>
        </ul>
      )}
    </section>
  )
}

function MdcName({ mdcKey, onSelect }: { mdcKey: string; onSelect?: () => void }) {
  const m = mdcInfo(mdcKey)
  const name = (
    <>
      <span className="font-medium">{m.name}</span>
      {m.code !== "none" && <span className="text-muted-foreground"> ({m.plain})</span>}
    </>
  )
  return (
    <span className="block min-w-0">
      {onSelect ? (
        <button type="button" onClick={onSelect} className="rounded text-left outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
          {name}
        </button>
      ) : (
        name
      )}
      {m.note && (
        <span className="group relative ml-1 inline-block align-[-2px]">
          <button type="button" className="rounded-full text-tertiary-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" aria-label={`About ${m.name}`}>
            <Info className="size-3.5" aria-hidden />
          </button>
          <span
            role="tooltip"
            className="pointer-events-none absolute top-full left-1/2 z-20 mt-1.5 hidden w-72 max-w-[calc(100vw-3rem)] -translate-x-1/2 rounded-lg bg-popover px-3 py-2 text-[12px] leading-relaxed font-normal text-popover-foreground shadow-lg ring-1 ring-border group-focus-within:block group-hover:block"
          >
            {m.note}
          </span>
        </span>
      )}
    </span>
  )
}

function Overview({ result, measure, onSpecialty }: { result: SpecialtyResult; measure: Measure; onSpecialty: (key: string) => void }) {
  const h = result.hospital
  const cols: SpecialtyHospital[] = h ? [h, ...result.compare] : result.compare
  const hidden = [...MDC_BY_CODE.keys()].filter((k) => !result.mdcs.includes(k))
  const measureLabel = MEASURES.find((m) => m.value === measure)!.label
  return (
    <section aria-label="Medicare cases by specialty" className="glass overflow-hidden rounded-2xl">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-[13px]">
          <caption className="sr-only">
            {measureLabel} by Medicare specialty (MDC) for {cols.map((c) => c.name).join(", ")}, with the peer median.
          </caption>
          <thead>
            <tr className="border-b border-border text-left text-xs text-tertiary-foreground">
              <th scope="col" className={cn(STICKY, "px-4 py-2.5 font-medium")}>
                Specialty (MDC)
              </th>
              {cols.map((c, i) => (
                <th key={c.id} scope="col" className={cn("max-w-36 px-3 py-2.5 text-right font-medium", i === 0 && h && "text-foreground")}>
                  <span className="line-clamp-2">{c.name}</span>
                </th>
              ))}
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                Peer median
              </th>
              {h && (
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  Cases vs peers
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {result.mdcs.map((key) => {
              const stats = result.peerStats[key]
              return (
                <tr key={key} className="border-b border-border/60 last:border-0 hover:bg-black/3 dark:hover:bg-white/4">
                  <th scope="row" className={cn(STICKY, "px-4 py-2 text-left font-normal")}>
                    <MdcName mdcKey={key} onSelect={() => onSpecialty(key)} />
                  </th>
                  {cols.map((c, i) => {
                    const v = formatMeasure(c.cells[key], measure, true)
                    return (
                      <td key={c.id} className={cn("num px-3 py-2 text-right whitespace-nowrap", i === 0 && h && "font-semibold")}>
                        {v ?? <span className="text-[12px] font-normal text-tertiary-foreground">{SUPPRESSED_SHORT}</span>}
                      </td>
                    )
                  })}
                  <td className="num px-3 py-2 text-right whitespace-nowrap text-muted-foreground">
                    {formatStat(stats, measure) ?? "—"}
                    <span className="block text-xs text-tertiary-foreground">
                      {stats.reporting} of {result.peerGroup.withData}
                    </span>
                  </td>
                  {h && <td className="px-4 py-2 text-right whitespace-nowrap text-muted-foreground">{standing(stats) ?? "—"}</td>}
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-border text-[13px]">
              <th scope="row" className={cn(STICKY, "px-4 py-2.5 text-left font-medium")}>
                All specialties (counted)
              </th>
              {cols.map((c, i) => (
                <td key={c.id} className={cn("num px-3 py-2.5 text-right whitespace-nowrap", i === 0 && h && "font-semibold")}>
                  {measure === "cases" ? formatInt(c.total.cases) : measure === "payment" ? formatUsd(c.total.payment, { compact: true }) : c.total.cases ? "100%" : "—"}
                </td>
              ))}
              <td />
              {h && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="border-t border-border px-4 py-3 text-xs leading-relaxed text-tertiary-foreground">
        Choose a specialty to compare every peer on it. &ldquo;{SUPPRESSED_SHORT}&rdquo;: no DRG in the specialty had 11 or
        more cases, so CMS published no count. Peer median: among the {result.peerGroup.withData} peers with Medicare
        inpatient data ({result.peerGroup.description}); the small number is how many had a count in the specialty.
        {hidden.length > 0 &&
          ` Not shown, no count at any hospital here: ${hidden.map((k) => mdcInfo(k).name).join(", ")}.`}
      </p>
    </section>
  )
}

function OneSpecialty({ result, mdc, measure }: { result: SpecialtyResult; mdc: string; measure: Measure }) {
  const m = mdcInfo(mdc)
  const stats = result.peerStats[mdc]
  const h = result.hospital
  const own = h?.cells[mdc]
  const compareIds = new Set(result.compare.map((c) => c.id))
  // The hospital, compared hospitals, and peers, one row each; peers already shown side by side aren't repeated.
  const rows = [
    ...(h ? [{ hospital: h, kind: "self" as const }] : []),
    ...result.compare.map((c) => ({ hospital: c, kind: "compare" as const })),
    ...result.peers.filter((p) => p.id !== h?.id && !compareIds.has(p.id)).map((p) => ({ hospital: p, kind: "peer" as const })),
  ]
  const value = (c: SpecialtyCell | undefined) => (!c ? null : measure === "cases" ? c.cases : measure === "payment" ? c.payment : c.share)
  const withValue = rows.filter((r) => value(r.hospital.cells[mdc]) != null).sort((a, b) => value(b.hospital.cells[mdc])! - value(a.hospital.cells[mdc])!)
  const without = rows.filter((r) => value(r.hospital.cells[mdc]) == null)
  const max = Math.max(...withValue.map((r) => value(r.hospital.cells[mdc])!), 1e-9)

  return (
    <div className="space-y-4">
      <section aria-label="Specialty" className="widget fade-up space-y-2 p-5">
        <p className="text-xs font-medium tracking-wide text-tertiary-foreground uppercase">
          {m.code === "none" ? "No MDC" : m.code === "PRE" ? "Pre-MDC" : `MDC ${m.code}`}
        </p>
        <h3 className="text-xl leading-tight font-semibold tracking-tight">{mdcLabel(m)}</h3>
        {m.official !== m.name && <p className="text-[13px] text-muted-foreground">CMS: {m.official}</p>}
        {m.note && (
          <p className="flex gap-2 rounded-xl bg-black/4 px-3.5 py-2.5 text-[13px] leading-relaxed text-muted-foreground dark:bg-white/6">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {m.note}
          </p>
        )}
        {h && (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-3 border-t border-black/6 pt-3 sm:grid-cols-4 dark:border-white/8">
            <Stat label="Medicare cases" value={own ? formatInt(own.cases) : SUPPRESSED} />
            <Stat label="Est. Medicare payment" value={own ? formatUsd(own.payment, { compact: true }) : "—"} />
            <Stat label="Share of its Medicare cases" value={own ? formatPercent(own.share) : "—"} />
            <Stat
              label="Peer median cases"
              value={stats?.median != null ? formatInt(Math.round(stats.median)) : "—"}
              sub={stats ? `${stats.reporting} of ${result.peerGroup.withData} peers with a count` : undefined}
            />
            {stats && standing(stats) && (
              <div className="col-span-2 flex justify-start sm:col-span-4 [&>span]:flex-row [&>span]:items-center [&>span]:gap-2">
                {standing(stats)}
              </div>
            )}
          </dl>
        )}
      </section>

      <section aria-label="Hospitals compared" className="glass rounded-2xl p-5">
        <h3 className="text-sm font-medium">
          {MEASURES.find((x) => x.value === measure)!.label}: this hospital and its peers
        </h3>
        <p className="mt-0.5 text-xs text-tertiary-foreground">
          {result.peerGroup.description}. Bars share one scale.
        </p>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden>
          {h && <Swatch color="var(--chart-1)" label="This hospital" />}
          {result.compare.length > 0 && <Swatch color="var(--series-2)" label="Side by side" />}
          <Swatch color="var(--chart-2)" label="Peers" faded />
        </p>
        <ul className="mt-3 space-y-1.5">
          {withValue.map(({ hospital, kind }) => {
            const v = value(hospital.cells[mdc])!
            return (
              <li key={hospital.id} className="grid grid-cols-[minmax(0,16rem)_1fr] items-center gap-3 text-[13px] max-sm:grid-cols-1 max-sm:gap-0.5">
                <span title={hospital.name} className={cn("truncate", kind === "self" && "font-semibold", kind === "compare" && "font-medium")}>
                  {hospital.name}
                  {kind === "compare" && <span className="sr-only"> (side by side)</span>}
                </span>
                <span className="flex items-center gap-2">
                  <span
                    className="h-3 rounded-r"
                    style={{
                      width: `${Math.max((v / max) * 80, 0.5)}%`,
                      background: kind === "self" ? "var(--chart-1)" : kind === "compare" ? "var(--series-2)" : "var(--chart-2)",
                      opacity: kind === "peer" ? 0.55 : 1,
                    }}
                    aria-hidden
                  />
                  <span className="num shrink-0 text-muted-foreground">{formatMeasure(hospital.cells[mdc], measure, true)}</span>
                </span>
              </li>
            )
          })}
        </ul>
        {without.length > 0 && (
          <p className="mt-3 text-xs leading-relaxed text-tertiary-foreground">
            {SUPPRESSED} ({without.length}): {without.map((r) => r.hospital.name).join(", ")}.
          </p>
        )}
      </section>

      {result.topDrgs.length > 0 && (
        <section aria-label="DRGs" className="glass overflow-hidden rounded-2xl">
          <h3 className="px-5 pt-4 text-sm font-medium">{h?.name ?? result.facility.name}: DRGs with 11 or more cases</h3>
          <div className="overflow-x-auto">
            <table className="mt-2 w-full min-w-[32rem] text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-xs text-tertiary-foreground">
                  <th scope="col" className="px-5 py-2 font-medium">
                    DRG
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Cases
                  </th>
                  <th scope="col" className="px-5 py-2 text-right font-medium">
                    Est. payment
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.topDrgs.map((d) => (
                  <tr key={d.code} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-1.5">
                      <span className="num text-tertiary-foreground">{d.code}</span> {sentenceCase(d.title)}
                      {d.retired && <span className="block text-xs text-tertiary-foreground">Retired by CMS; priced at its last published weight</span>}
                    </td>
                    <td className="num px-3 py-1.5 text-right">{formatInt(d.cases)}</td>
                    <td className="num px-5 py-1.5 text-right">{formatUsd(d.payment, { compact: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

function Swatch({ color, label, faded = false }: { color: string; label: string; faded?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2.5 rounded-sm" style={{ background: color, opacity: faded ? 0.55 : 1 }} />
      {label}
    </span>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-tertiary-foreground">{label}</dt>
      <dd className="num text-[15px] font-semibold tracking-tight">{value}</dd>
      {sub && <dd className="text-xs text-tertiary-foreground">{sub}</dd>}
    </div>
  )
}

const KEEP_UPPER = new Set(["MCC", "CC", "CC/MCC", "O.R.", "MV", "HIV", "ECMO", "AMI", "CAR", "PTCA", "AICD", "CNS", "URI", "TPA", "D&C", "C.D.E."])

function sentenceCase(title: string) {
  const text = title
    .split(/\s+/)
    .map((w) => (KEEP_UPPER.has(w.replace(/^[("]+|[),"]+$/g, "")) ? w : w.toLowerCase()))
    .join(" ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}
