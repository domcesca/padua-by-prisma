"use client"

import { ChevronRight, MapPin } from "lucide-react"
import { useState, useSyncExternalStore } from "react"

import type { CommunityContext } from "@/lib/data/types"
import { formatNumberCompact, formatUsd } from "@/lib/format"
import { cn } from "@/lib/utils"

// Whether the panel is open, remembered per viewer in this browser (a convenience only).
const OPEN_KEY = "hcai-community-open"
const listeners = new Set<() => void>()

function readOpen() {
  try {
    return window.localStorage.getItem(OPEN_KEY) === "1"
  } catch {
    return false
  }
}

function writeOpen(open: boolean) {
  try {
    window.localStorage.setItem(OPEN_KEY, open ? "1" : "0")
  } catch {
    // Storage blocked: the panel just won't remember.
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const pct = (v: number | null | undefined, digits = 0) => (v == null ? "—" : `${v.toFixed(digits)}%`)

/**
 * The hospital's county at a glance: Census demographics and coverage, and Medi-Cal
 * enrollment. Context for reading the benchmarks, deliberately kept out of the peer charts.
 */
export function CommunityPanel({ context }: { context: CommunityContext }) {
  const stored = useSyncExternalStore(subscribe, readOpen, () => false)
  const [override, setOverride] = useState<boolean | null>(null)
  const open = override ?? stored
  const toggle = () => {
    setOverride(!open)
    writeOpen(!open)
  }

  const { acs, mediCal } = context
  const enrollment = mediCal?.annual?.eligibles ?? mediCal?.eligibles ?? null
  const shareOfPopulation = enrollment != null && acs?.population ? (enrollment / acs.population) * 100 : null
  const summary = [
    acs?.population != null ? `${formatNumberCompact(acs.population)} people` : null,
    shareOfPopulation != null
      ? `${shareOfPopulation.toFixed(0)}% on Medi-Cal`
      : enrollment != null
        ? `${formatNumberCompact(enrollment)} on Medi-Cal`
        : null,
    acs?.medianHouseholdIncome != null ? `${formatUsd(acs.medianHouseholdIncome, { compact: true })} median income` : null,
  ].filter(Boolean)

  return (
    <section aria-label={`Community context: ${context.county} County`} className="glass rounded-2xl">
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="flex w-full items-center gap-3 rounded-2xl px-5 py-4 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <MapPin className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Community context · {context.county} County</span>
          {summary.length > 0 && <span className="block truncate text-xs text-muted-foreground">{summary.join(" · ")}</span>}
        </span>
        <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-90")} />
      </button>
      {open && (
        <div className="fade-up space-y-4 border-t border-border px-5 py-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Who lives in the county the hospital serves. This is context for reading the comparisons above, not part of
            them: similar hospitals are chosen by location, size, and ownership, and the county isn&apos;t the hospital&apos;s
            service area.
          </p>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {acs && (
              <>
                <Tile label="Population" value={acs.population != null ? formatNumberCompact(acs.population) : "—"} />
                <Tile
                  label="Median household income"
                  value={acs.medianHouseholdIncome != null ? formatUsd(acs.medianHouseholdIncome) : "—"}
                />
                <Tile label="Age 65 and older" value={pct(acs.pctAge65Plus, 1)} />
                <Tile label="Below poverty line" value={pct(acs.pctBelowPoverty, 1)} />
              </>
            )}
            <Tile
              label={`Medi-Cal enrollment${mediCal ? `, ${mediCal.year} avg.` : ""}`}
              value={enrollment != null ? formatNumberCompact(enrollment) : "—"}
              sub={
                [
                  shareOfPopulation != null ? `${shareOfPopulation.toFixed(1)}% of residents` : null,
                  mediCal?.annual?.dual != null && enrollment
                    ? `${((mediCal.annual.dual / enrollment) * 100).toFixed(0)}% also on Medicare`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
            />
          </dl>

          {acs && (
            <div className="space-y-2">
              <p className="text-xs font-medium tracking-wide text-tertiary-foreground uppercase">Health coverage</p>
              <div className="space-y-1.5">
                <CoverageBar label="Private insurance" value={acs.pctPrivate} />
                <CoverageBar label="Medicare" value={acs.pctMedicare} />
                <CoverageBar label="Medi-Cal" value={acs.pctMedicaid} />
                <CoverageBar label="Uninsured" value={acs.pctUninsured} />
              </div>
              <p className="text-xs leading-relaxed text-tertiary-foreground">
                What residents told the Census they have, alone or with another type, so the bars add to more than 100%.
                {shareOfPopulation != null && acs.pctMedicaid != null && (
                  <>
                    {" "}
                    Medi-Cal here ({acs.pctMedicaid.toFixed(0)}%) is lower than DHCS&apos;s enrollment count (
                    {shareOfPopulation.toFixed(0)}% of residents): surveys are known to undercount Medicaid, since people
                    often name their health plan instead, while DHCS counts everyone certified eligible in a month. For
                    Medi-Cal volume, use the enrollment figure.
                  </>
                )}
              </p>
            </div>
          )}

          <div className="space-y-0.5 text-xs leading-relaxed text-tertiary-foreground">
            {acs ? (
              <p>Census American Community Survey 5-year estimates, {acs.vintage}.</p>
            ) : (
              <p>Census demographics and coverage for this county haven&apos;t been loaded yet.</p>
            )}
            {mediCal && (
              <p>
                DHCS Medi-Cal certified eligibles: {mediCal.year} monthly average
                {mediCal.annual?.preliminary ? " (includes preliminary months)" : ""}. Latest month {mediCal.month}: {formatNumberCompact(mediCal.eligibles)}
                {mediCal.preliminary ? " (preliminary)" : ""}.
                {shareOfPopulation != null && " Share of residents compares this with the Census population."}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-black/4 px-3.5 py-3 dark:bg-white/6">
      <dt className="text-xs leading-snug text-tertiary-foreground">{label}</dt>
      <dd className="num mt-0.5 text-[17px] font-semibold tracking-tight">{value}</dd>
      {sub && <dd className="mt-0.5 text-xs leading-snug text-muted-foreground">{sub}</dd>}
    </div>
  )
}

function CoverageBar({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="grid grid-cols-[9.5rem_1fr_3rem] items-center gap-3 text-[13px] max-sm:grid-cols-[7.5rem_1fr_2.75rem]">
      <span className="truncate text-muted-foreground">{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/8">
        <span className="block h-full rounded-full bg-(--chart-1)" style={{ width: `${Math.min(value ?? 0, 100)}%` }} />
      </span>
      <span className="num text-right font-medium">{pct(value)}</span>
    </div>
  )
}
