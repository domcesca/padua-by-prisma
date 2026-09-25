"use client"

import { ChevronRight, ListChecks, Loader2, NotebookPen } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { MobileSheet } from "@/components/shell/mobile-sheet"
import { usePins } from "@/lib/findings/briefing"
import type { FindingsResult } from "@/lib/findings/compute"
import { MIN_SCORED_PEERS, type Finding } from "@/lib/findings/score"
import { cn } from "@/lib/utils"
import { FindingRow } from "./finding-row"

// Benchmark's key-findings panel: up to 5 primary findings and 5 to watch for the hospital against the peer group
// on screen, above the metric cards. On phones it folds into a summary bar with the list in a bottom sheet, the same
// pattern as the filter strip (MobileSheet).

export type OpenFinding = (finding: Finding, tier: "primary" | "secondary", rank: number, opener: HTMLElement) => void

export function tierOf(result: FindingsResult, family: string) {
  const p = result.primary.findIndex((f) => f.family === family)
  if (p >= 0) return { finding: result.primary[p], tier: "primary" as const, rank: p + 1 }
  const s = result.secondary.findIndex((f) => f.family === family)
  if (s >= 0) return { finding: result.secondary[s], tier: "secondary" as const, rank: s + 1 }
  return null
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** What the panel says when there's nothing to rank, or nothing clears the bar for primary. */
export function FindingsEmpty({ result, where }: { result: FindingsResult; where: "home" | "benchmark" }) {
  if (result.peerGroup.count < MIN_SCORED_PEERS) {
    return (
      <Empty title="Too few peers to rank findings">
        This peer group has {result.peerGroup.count} hospital{result.peerGroup.count === 1 ? "" : "s"}; findings need at least {MIN_SCORED_PEERS}{" "}
        with a value.{" "}
        {where === "benchmark" ? "Remove a filter or switch to Similar hospitals to widen it." : "Widen the peer group in Benchmark."}
      </Empty>
    )
  }
  if (!result.primary.length && !result.secondary.length) {
    return (
      <Empty title="Nothing unfavorable against these peers">
        Every judged metric is similar to or better than {lower(result.peerGroup.description)}, and no CMS penalty applies.
        {where === "home" ? " Explore a topic below to see the details." : " The metric cards below show the details."}
      </Empty>
    )
  }
  if (!result.primary.length) {
    const n = result.secondary.length
    return (
      <Empty title="Nothing clears the bar for primary">
        {n} finding{n === 1 ? "" : "s"} to watch{where === "benchmark" ? " below" : ""}: each scores under {result.minPrimary} or has Low confidence.
        {where === "home" && " See them in Benchmark."}
      </Empty>
    )
  }
  return null
}

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-black/4 px-4 py-3.5 dark:bg-white/6" role="status">
      <p className="text-[14px] font-medium">{title}</p>
      <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{children}</p>
    </div>
  )
}

export function FindingsLoading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true">
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground" role="status">
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Scanning finances, quality and ED data against peers…
      </p>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-3">
          <div className="size-6 shrink-0 animate-pulse rounded-full bg-black/6 dark:bg-white/8" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 animate-pulse rounded bg-black/6 dark:bg-white/8" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-black/5 dark:bg-white/6" />
          </div>
        </div>
      ))}
    </div>
  )
}

function Body({
  result,
  loading,
  error,
  retry,
  facilityName,
  peerQuery,
  onOpen,
}: {
  result: FindingsResult | null
  loading: boolean
  error: string | null
  retry: () => void
  facilityName: string
  peerQuery: string
  onOpen: OpenFinding
}) {
  const [showSecondary, setShowSecondary] = useState(false)
  if (error) {
    return (
      <div role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
        Couldn&apos;t load key findings ({error}).{" "}
        <button type="button" onClick={retry} className="rounded font-medium underline outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Try again
        </button>
      </div>
    )
  }
  if (!result) return <FindingsLoading />
  const secondaryOpen = showSecondary || result.primary.length === 0
  const context = { facilityName, peerGroup: result.peerGroup.description, peerQuery }
  return (
    <div className={cn("space-y-3 transition-opacity duration-200", loading && "opacity-60")}>
      <FindingsEmpty result={result} where="benchmark" />
      {result.primary.length > 0 && (
        <ol aria-label="Primary findings" className="divide-y divide-border">
          {result.primary.map((f, i) => (
            <FindingRow
              key={f.id}
              finding={f}
              rank={i + 1}
              tier="primary"
              context={context}
              onMethodology={(finding, el) => onOpen(finding, "primary", i + 1, el)}
            />
          ))}
        </ol>
      )}
      {result.secondary.length > 0 && (
        <div className="rounded-xl border border-border">
          <button
            type="button"
            aria-expanded={secondaryOpen}
            aria-controls="findings-secondary"
            onClick={() => setShowSecondary((v) => !v)}
            disabled={result.primary.length === 0}
            className="flex w-full items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-left text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
          >
            <ChevronRight className={cn("size-4 transition-transform", secondaryOpen && "rotate-90")} aria-hidden />
            {result.secondary.length}
            {result.primary.length ? " more" : ""} to watch
            <span className="font-normal text-muted-foreground">· below the primary bar, or outside its 2-per-type limit</span>
          </button>
          {secondaryOpen && (
            <ol id="findings-secondary" aria-label="Findings to watch" className="divide-y divide-border border-t border-border px-3.5">
              {result.secondary.map((f, i) => (
                <FindingRow
                  key={f.id}
                  finding={f}
                  rank={i + 1}
                  tier="secondary"
                  context={context}
                  onMethodology={(finding, el) => onOpen(finding, "secondary", i + 1, el)}
                />
              ))}
            </ol>
          )}
        </div>
      )}
      {result.overflow.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {result.overflow.length} more finding{result.overflow.length === 1 ? "" : "s"} met the criteria but aren&apos;t ranked here; the metric cards
          below show every standing.
        </p>
      )}
      <p className="text-xs leading-relaxed text-tertiary-foreground">
        {result.clear.length > 0 && <>Checked, nothing unfavorable: {result.clear.join(", ")}. </>}
        Workforce and capacity aren&apos;t scored yet, and volumes, length of stay and occupancy are never judged (their direction depends on
        strategy).
      </p>
    </div>
  )
}

export function KeyFindingsPanel({
  facilityId,
  facilityName,
  peerQuery,
  result,
  loading,
  error,
  retry,
  onOpen,
}: {
  facilityId: string
  facilityName: string
  peerQuery: string
  result: FindingsResult | null
  loading: boolean
  error: string | null
  retry: () => void
  onOpen: OpenFinding
}) {
  const pins = usePins().filter((p) => p.facilityId === facilityId)
  const counts = result ? `${result.primary.length} primary · ${result.secondary.length} to watch` : error ? "Couldn't load" : "Loading…"
  const briefing = (
    <Link
      href="/briefing"
      className="glass-subtle inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <NotebookPen className="size-3.5" aria-hidden />
      Briefing{pins.length > 0 && <span className="num text-muted-foreground">({pins.length})</span>}
    </Link>
  )
  const body = <Body result={result} loading={loading} error={error} retry={retry} facilityName={facilityName} peerQuery={peerQuery} onOpen={onOpen} />
  return (
    <>
      <section id="key-findings" aria-labelledby="key-findings-title" className="widget fade-up hidden scroll-mt-20 space-y-3 p-5 md:block">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-0.5">
            <h2 id="key-findings-title" className="text-[19px] font-semibold tracking-tight">
              Key findings
            </h2>
            <p className="text-[13px] text-muted-foreground">
              {result ? (
                <>
                  Compared with {lower(result.peerGroup.description)} · {counts}
                </>
              ) : (
                "Where this hospital stands out unfavorably against its peers, ranked."
              )}
            </p>
          </div>
          {briefing}
        </div>
        {body}
      </section>
      <MobileSheet
        title="Key findings"
        className="scroll-mt-20"
        triggerLabel={`Key findings: ${counts}`}
        summary={
          <>
            <p className="truncate text-[13px] leading-tight font-semibold">Key findings</p>
            <p className="truncate text-xs leading-tight text-muted-foreground">{counts}</p>
          </>
        }
        trigger={
          <>
            <ListChecks className="size-3.5" aria-hidden />
            Open
          </>
        }
      >
        {result && <p className="text-[13px] text-muted-foreground">Compared with {lower(result.peerGroup.description)}.</p>}
        {body}
        <div className="pt-1">{briefing}</div>
      </MobileSheet>
    </>
  )
}
