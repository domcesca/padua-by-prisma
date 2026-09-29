"use client"

import { useState } from "react"

import { CardToggle } from "@/components/shell/card-toggle"
import { StandingBadge } from "@/components/shell/standing"
import { PatternSwatch, patternStyle, PEER_PATTERN } from "@/components/shell/fill-pattern"
import { StatusLine } from "@/components/shell/status-line"
import type { SourceStatus } from "@/lib/data/freshness"
import { auditLabel } from "@/lib/status"

import type { PayerMixComparison } from "@/lib/benchmark/compute"
import type { DictionaryMetric, PayerGroup } from "@/lib/data/types"
import { CONTEXT_REASONS } from "@/lib/favorability/directions"
import { formatMetric, formatPercent } from "@/lib/format"
import { onRadioGroupKeyDown, rovingTabIndex } from "@/lib/radio-group"
import { cn } from "@/lib/utils"
import { setValueBasis, useValueBasis } from "@/lib/card-prefs"
import { MetricInfo } from "./metric-info"

const BASES = [
  { value: "revenue", label: "Charges" },
  { value: "days", label: "Patient days" },
] as const

export function PayerMixCard({
  mix,
  groups,
  meta,
  source,
}: {
  mix: PayerMixComparison
  groups: { id: PayerGroup; label: string }[]
  meta: DictionaryMetric
  source?: SourceStatus
}) {
  const [basis, setBasis] = useState<"revenue" | "days">("revenue")
  const valueBasis = useValueBasis("payerMix")
  // Actual needs the amounts; a result from before V7.4.5 (a cached page) has shares only.
  const actual = valueBasis === "actual" && !!mix.amounts
  const current = mix[basis]
  const amounts = mix.amounts?.[basis]
  const amountFormat = { unit: basis === "revenue" ? "usd" : "days", decimals: 0 } as const
  const amountMax = Math.max(1, ...groups.flatMap((g) => [amounts?.facility?.[g.id] ?? 0, amounts?.peers?.[g.id] ?? 0]))
  const max = Math.max(
    0.01,
    ...groups.flatMap((g) => [current.facility?.[g.id] ?? 0, current.peers?.[g.id] ?? 0])
  )
  // One-line takeaway: the payer where this hospital differs most from peers.
  const biggest =
    current.facility && current.peers
      ? groups
          .map((g) => ({ ...g, diff: (current.facility![g.id] ?? 0) - (current.peers![g.id] ?? 0) }))
          .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))[0]
      : null

  return (
    <section aria-labelledby="metric-payer-mix" className="glass fade-up rounded-2xl p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 id="metric-payer-mix" className="text-[13px] font-medium text-muted-foreground">
              Payer mix · {mix.year}
            </h2>
            <MetricInfo metric={meta} />
          </div>
          <StandingBadge standing="depends" className="mt-1.5" title={CONTEXT_REASONS.payerMix} />
          <p className="mt-1 text-[17px] font-semibold tracking-tight">
            {actual
              ? amounts?.facility
                ? `${formatMetric(amountFormat, amounts.facility.total)} ${basis === "revenue" ? "in gross charges" : "in inpatient days"}${amounts.peers ? `; peer median ${formatMetric(amountFormat, amounts.peers.total)}` : ""}.`
                : "No amounts reported this year."
              : biggest && Math.abs(biggest.diff) >= 0.02
              ? `${biggest.label} is ${formatPercent(Math.abs(biggest.diff), 0).replace("%", " points")} ${biggest.diff > 0 ? "higher" : "lower"} than peers.`
              : "Payer mix is close to the peer average."}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
        {mix.amounts && (
          <CardToggle
            label="Payer mix: percent or actual amounts"
            value={valueBasis}
            onChange={(b) => setValueBasis("payerMix", b)}
            options={[
              { value: "percent", label: "Percent" },
              { value: "actual", label: "Actual" },
            ]}
          />
        )}
        <div role="radiogroup" aria-label="Measure payer mix by" onKeyDown={onRadioGroupKeyDown} className="flex rounded-lg bg-muted p-0.5">
          {BASES.map((b, i) => (
            <button
              key={b.value}
              type="button"
              role="radio"
              aria-checked={basis === b.value}
              tabIndex={rovingTabIndex(basis === b.value, i, true)}
              onClick={() => setBasis(b.value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                basis === b.value
                  ? "bg-card text-foreground shadow-sm dark:bg-white/15"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {b.label}
            </button>
          ))}
        </div>
        </div>
      </header>

      <div className="mt-2 flex items-center gap-5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <PatternSwatch pattern="solid" color="var(--chart-1)" className="size-3 rounded-[3px]" /> This hospital
        </span>
        <span className="inline-flex items-center gap-1.5">
          <PatternSwatch pattern={PEER_PATTERN} color="var(--chart-2)" className="size-3 rounded-[3px]" /> {actual ? `Peer median (${amounts?.n ?? 0})` : `Peer average (${current.n})`}
        </span>
      </div>

      <table className="mt-4 w-full">
        <caption className="sr-only">
          {actual
            ? `${basis === "revenue" ? "Gross charges" : "Inpatient days"} by payer, this hospital vs. the peer median of each`
            : `Share of ${basis === "revenue" ? "gross charges" : "inpatient days"} by payer, this hospital vs. peer average`}
        </caption>
        <thead className="sr-only">
          <tr>
            <th>Payer</th>
            <th>This hospital</th>
            <th>{actual ? "Peer median" : "Peer average"}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const mine = actual ? (amounts?.facility?.[g.id] ?? null) : (current.facility?.[g.id] ?? null)
            const peer = actual ? (amounts?.peers?.[g.id] ?? null) : (current.peers?.[g.id] ?? null)
            const format = actual ? (v: number) => formatMetric(amountFormat, v) : undefined
            return (
              <tr key={g.id} className="grid grid-cols-[8.5rem_1fr] items-center gap-3 py-1.5 sm:grid-cols-[10rem_1fr]">
                <th scope="row" className="text-left text-[13px] font-normal">
                  {g.label}
                </th>
                <td className="space-y-0.5">
                  <Bar value={mine} max={actual ? amountMax : max} fill={patternStyle("solid", "var(--chart-1)")} label="This hospital" format={format} />
                  <Bar value={peer} max={actual ? amountMax : max} fill={patternStyle(PEER_PATTERN, "var(--chart-2)")} label={actual ? "Peer median" : "Peer average"} format={format} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-3 text-xs leading-relaxed text-tertiary-foreground">
        {basis === "revenue"
          ? `${actual ? "Gross charges" : "Share of gross charges"} (inpatient + outpatient). Charges are list prices, so this shows where volume comes from, not where cash comes from.`
          : `${actual ? "Inpatient days" : "Share of inpatient days"}. Outpatient volume isn't included.`}
        {actual && " Peer figures are each payer's median on its own, so they needn't add up to the peer median total."}
      </p>
      <StatusLine
        className="mt-3 border-t border-border pt-2.5"
        through={String(mix.year)}
        periodType="Report year (hospital fiscal year)"
        published={source?.published[mix.year] ? `Published ${source.published[mix.year]}` : null}
        processed={source ? `Processed ${source.processed}` : null}
        audit={auditLabel(mix.status)}
      />
    </section>
  )
}

function Bar({
  value,
  max,
  fill,
  label,
  format,
}: {
  value: number | null
  max: number
  /** Color and pattern (shell/fill-pattern.tsx): the peer bar is dotted, so the pair differs by more than color. */
  fill: React.CSSProperties
  label: string
  /** Actual view: the amount's own format; otherwise a share. */
  format?: (v: number) => string
}) {
  const text = value == null ? "—" : format ? format(value) : formatPercent(value, value < 0.1 ? 1 : 0)
  const width = value != null ? Math.max(0, (value / max) * 100) : 0
  return (
    // Bars use 85% of the row so the value label always fits at the tip.
    <div className="flex h-3 items-center gap-1.5" title={`${label}: ${text}`}>
      <div
        className="h-2.5 shrink-0 rounded-r-[4px] transition-[width] duration-250 ease-out"
        style={{ ...fill, width: `${width * 0.85}%` }}
      />
      <span className="num text-xs text-muted-foreground">{text}</span>
    </div>
  )
}
