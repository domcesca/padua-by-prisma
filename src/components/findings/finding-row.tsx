"use client"

import { ArrowRight, Calculator, Info, Pin, PinOff } from "lucide-react"
import Link from "next/link"

import { StandingBadge } from "@/components/shell/standing"
import { pin, snapshotOf, unpin, usePins, type FindingContext } from "@/lib/findings/briefing"
import { SIGNAL_TYPE_LABEL } from "@/lib/findings/families"
import { findingStanding, headlineOf } from "@/lib/findings/links"
import { CONFIDENCE_LABEL, type Finding } from "@/lib/findings/score"
import { cn } from "@/lib/utils"

// One finding as a row: the standing badge and title first (the shared vocabulary), one line of evidence, the score
// and confidence, then its actions. Home and Benchmark's key-findings panel both use it.

const ACTION =
  "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function ScoreText({ finding, className }: { finding: Finding; className?: string }) {
  return (
    <span className={cn("num text-xs whitespace-nowrap text-muted-foreground", className)}>
      Score <span className="font-semibold text-foreground">{finding.score}</span> · {CONFIDENCE_LABEL[finding.level]} confidence
    </span>
  )
}

export function PinButton({
  finding,
  tier,
  context,
  className,
}: {
  finding: Finding
  tier: "primary" | "secondary"
  context: FindingContext
  className?: string
}) {
  const pins = usePins()
  const pinned = pins.some((p) => p.id === finding.id)
  const facilityId = finding.id.split(":")[0]
  return (
    <button
      type="button"
      aria-pressed={pinned}
      onClick={() =>
        pinned
          ? unpin(finding.id)
          : pin({
              id: finding.id,
              facilityId,
              facilityName: context.facilityName,
              family: finding.family,
              peerQuery: context.peerQuery,
              snapshot: snapshotOf(finding, tier, context.peerGroup, headlineOf(finding)),
            })
      }
      className={cn(ACTION, pinned ? "bg-primary/10 text-primary" : "glass-subtle", className)}
    >
      {pinned ? <PinOff className="size-3.5" aria-hidden /> : <Pin className="size-3.5" aria-hidden />}
      {pinned ? "Pinned" : "Pin to briefing"}
      <span className="sr-only">: {finding.label}</span>
    </button>
  )
}

export function FindingRow({
  finding,
  rank,
  tier,
  context,
  onMethodology,
  reviewHref,
  className,
}: {
  finding: Finding
  /** Position in its tier, from 1. */
  rank: number
  tier: "primary" | "secondary"
  context: FindingContext
  onMethodology: (finding: Finding, opener: HTMLElement) => void
  /** Home: the Benchmark link for this finding. */
  reviewHref?: string
  className?: string
}) {
  const headingId = `finding-${finding.family}`
  return (
    <li
      id={`finding-row-${finding.family}`}
      aria-labelledby={headingId}
      className={cn("flex scroll-mt-24 gap-3 py-3.5 first:pt-1 last:pb-1", className)}
    >
      <span
        className={cn(
          "num mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          tier === "primary" ? "bg-unfavorable/10 text-unfavorable" : "bg-black/5 text-muted-foreground dark:bg-white/8"
        )}
        aria-hidden
      >
        {rank}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <StandingBadge standing={findingStanding(finding)} short />
          <h3 id={headingId} className="text-[15px] leading-snug font-semibold tracking-tight">
            <span className="sr-only">{tier === "primary" ? `Key finding ${rank}` : `To watch ${rank}`}: </span>
            {finding.label}
            {finding.lead.label !== finding.label && <span className="font-normal text-muted-foreground"> · {finding.lead.label}</span>}
          </h3>
        </div>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{headlineOf(finding)}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <ScoreText finding={finding} />
          <span className="text-xs text-tertiary-foreground">{SIGNAL_TYPE_LABEL[finding.type]}</span>
          {finding.candidates.length > 1 && (
            <span className="text-xs text-tertiary-foreground">
              +{finding.candidates.length - 1} related signal{finding.candidates.length > 2 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          <button type="button" onClick={(e) => onMethodology(finding, e.currentTarget)} className={cn(ACTION, "glass-subtle")}>
            <Info className="size-3.5" aria-hidden />
            Methodology
            <span className="sr-only">: {finding.label}</span>
          </button>
          {reviewHref && (
            <Link href={reviewHref} className={cn(ACTION, "glass-subtle")}>
              Review in Benchmark
              <ArrowRight className="size-3.5" aria-hidden />
              <span className="sr-only">: {finding.label}</span>
            </Link>
          )}
          {finding.propose && (
            <Link href={finding.propose.href} className={cn(ACTION, "glass-subtle")}>
              <Calculator className="size-3.5" aria-hidden />
              Model in Propose
              <span className="sr-only">: {finding.label}</span>
            </Link>
          )}
          <PinButton finding={finding} tier={tier} context={context} />
        </div>
      </div>
    </li>
  )
}
