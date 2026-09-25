"use client"

import { useState } from "react"

import type { PayerMixComparison } from "@/lib/benchmark/compute"
import type { DictionaryMetric, PayerGroup } from "@/lib/data/types"
import { formatPercent } from "@/lib/format"
import { cn } from "@/lib/utils"
import { MetricInfo } from "./metric-info"

const BASES = [
  { value: "revenue", label: "Charges" },
  { value: "days", label: "Patient days" },
] as const

export function PayerMixCard({
  mix,
  groups,
  meta,
}: {
  mix: PayerMixComparison
  groups: { id: PayerGroup; label: string }[]
  meta: DictionaryMetric
}) {
  const [basis, setBasis] = useState<"revenue" | "days">("revenue")
  const current = mix[basis]
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
          <p className="mt-1.5 text-[17px] font-semibold tracking-tight">
            {biggest && Math.abs(biggest.diff) >= 0.02
              ? `${biggest.label} is ${formatPercent(Math.abs(biggest.diff), 0).replace("%", " points")} ${biggest.diff > 0 ? "higher" : "lower"} than peers.`
              : "Payer mix is close to the peer average."}
          </p>
        </div>
        <div role="radiogroup" aria-label="Measure payer mix by" className="flex rounded-lg bg-muted p-0.5">
          {BASES.map((b) => (
            <button
              key={b.value}
              type="button"
              role="radio"
              aria-checked={basis === b.value}
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
      </header>

      <div className="mt-2 flex items-center gap-5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-(--chart-1)" /> This hospital
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-(--chart-2)" /> Peer average ({current.n})
        </span>
      </div>

      <table className="mt-4 w-full">
        <caption className="sr-only">
          Share of {basis === "revenue" ? "gross charges" : "inpatient days"} by payer, this hospital vs. peer average
        </caption>
        <thead className="sr-only">
          <tr>
            <th>Payer</th>
            <th>This hospital</th>
            <th>Peer average</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const mine = current.facility?.[g.id] ?? null
            const peer = current.peers?.[g.id] ?? null
            return (
              <tr key={g.id} className="grid grid-cols-[8.5rem_1fr] items-center gap-3 py-1.5 sm:grid-cols-[10rem_1fr]">
                <th scope="row" className="text-left text-[13px] font-normal">
                  {g.label}
                </th>
                <td className="space-y-0.5">
                  <Bar value={mine} max={max} className="bg-(--chart-1)" label="This hospital" />
                  <Bar value={peer} max={max} className="bg-(--chart-2)" label="Peer average" />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-3 text-xs leading-relaxed text-tertiary-foreground">
        {basis === "revenue"
          ? "Share of gross charges (inpatient + outpatient). Charges are list prices, so this shows where volume comes from, not where cash comes from."
          : "Share of inpatient days. Outpatient volume isn't included."}
      </p>
    </section>
  )
}

function Bar({ value, max, className, label }: { value: number | null; max: number; className: string; label: string }) {
  const width = value != null ? Math.max(0, (value / max) * 100) : 0
  return (
    // Bars use 85% of the row so the value label always fits at the tip.
    <div className="flex h-3 items-center gap-1.5" title={`${label}: ${value != null ? formatPercent(value) : "—"}`}>
      <div
        className={cn("h-2 shrink-0 rounded-r-[4px] transition-[width] duration-250 ease-out", className)}
        style={{ width: `${width * 0.85}%` }}
      />
      <span className="num text-xs text-muted-foreground">
        {value != null ? formatPercent(value, value < 0.1 ? 1 : 0) : "—"}
      </span>
    </div>
  )
}
