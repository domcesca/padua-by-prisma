"use client"

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { ArrowRight, Calculator, X } from "lucide-react"
import Link from "next/link"

import { StandingBadge, TrendText } from "@/components/shell/standing"
import { StatusLine } from "@/components/shell/status-line"
import { rankText } from "@/lib/favorability"
import type { FindingContext } from "@/lib/findings/briefing"
import { formatUsd } from "@/lib/format"
import { FAMILY_BY_ID, SIGNAL_TYPE_LABEL } from "@/lib/findings/families"
import { findingStanding } from "@/lib/findings/links"
import { CONFIDENCE_LABEL, type Candidate, type EvidencePoint, type Finding } from "@/lib/findings/score"
import { cn } from "@/lib/utils"
import { PinButton } from "./finding-row"

// The math behind one finding: the score as the product of its four factors, each with the rule that set it, the
// evidence, the family's other signals, the next action and the Propose handoff. A side sheet from md up, a bottom
// sheet on phones. Everything shown here is what the server computed; nothing is recalculated.

const fmt = (n: number, digits = 3) => (Number.isInteger(n) ? n.toFixed(1) : n.toFixed(digits).replace(/0+$/, "").replace(/\.$/, ".0"))

export function MethodologyDrawer({
  finding,
  tier,
  rank,
  context,
  onOpenChange,
  finalFocus,
  onShowMetric,
}: {
  finding: Finding | null
  tier: "primary" | "secondary"
  rank: number
  context: FindingContext
  onOpenChange: (open: boolean) => void
  /** Where focus returns on close (the button that opened it). */
  finalFocus?: React.RefObject<HTMLElement | null>
  /** Benchmark: show a metric's card (switching topic if needed). */
  onShowMetric?: (metricId: string) => void
}) {
  return (
    <DialogPrimitive.Root open={finding != null} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/25 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup
          finalFocus={finalFocus}
          className={cn(
            "glass-strong fixed z-50 overflow-y-auto outline-none",
            // Phones: a bottom sheet, like the filter sheet.
            "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-2xl px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]",
            "data-open:animate-in data-open:slide-in-from-bottom data-closed:animate-out data-closed:slide-out-to-bottom",
            // md up: a side sheet on the right.
            "md:inset-x-auto md:top-0 md:right-0 md:bottom-0 md:max-h-none md:w-[32rem] md:max-w-[calc(100vw-2rem)] md:rounded-none md:rounded-l-2xl md:px-6 md:pt-5",
            "md:data-open:slide-in-from-right md:data-closed:slide-out-to-right"
          )}
        >
          {finding && (
            <Body
              finding={finding}
              tier={tier}
              rank={rank}
              context={context}
              onShowMetric={onShowMetric ? (id) => (onOpenChange(false), onShowMetric(id)) : undefined}
            />
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-2 border-t border-border pt-4", className)}>
      <h3 className="text-xs font-semibold tracking-wide text-tertiary-foreground uppercase">{title}</h3>
      {children}
    </section>
  )
}

function FactorRow({ label, value, rule }: { label: string; value: string; rule: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
      <dt className="text-[13px] font-medium">{label}</dt>
      <dd className="num text-right text-[13px] font-semibold">{value}</dd>
      <dd className="col-span-2 text-xs leading-relaxed text-muted-foreground">{rule}</dd>
    </div>
  )
}

function Evidence({ e }: { e: EvidencePoint }) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {e.standing && <StandingBadge standing={e.standing} short />}
        <p className="text-[13px] font-medium">
          {e.label}: <span className="num">{e.text.value}</span> <span className="font-normal text-muted-foreground">({e.period})</span>
        </p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {e.text.median && (
          <>
            <dt>Peer median</dt>
            <dd className="num text-foreground">{e.text.median}</dd>
          </>
        )}
        {e.text.p25 && e.text.p75 && (
          <>
            <dt>Middle half of peers</dt>
            <dd className="num text-foreground">
              {e.text.p25} to {e.text.p75}
            </dd>
          </>
        )}
        {e.percentile != null && (
          <>
            <dt>Rank</dt>
            <dd className="text-foreground">{rankText(e.percentile, e.n)}</dd>
          </>
        )}
        {e.compared && (
          <>
            <dt>Source&apos;s rating</dt>
            <dd className="text-foreground">{e.compared}</dd>
          </>
        )}
      </dl>
      {e.trend && e.prior && (
        <TrendText trend={e.trend} rising={e.prior.rising}>
          from {e.prior.text} in {e.prior.period}
        </TrendText>
      )}
    </div>
  )
}

function Body({
  finding,
  tier,
  rank,
  context,
  onShowMetric,
}: {
  finding: Finding
  tier: "primary" | "secondary"
  rank: number
  context: FindingContext
  onShowMetric?: (metricId: string) => void
}) {
  const lead = finding.lead
  const family = FAMILY_BY_ID.get(finding.family)
  const others = finding.candidates.slice(1)
  return (
    <div className="space-y-4">
      <div className="mx-auto h-1 w-10 rounded-full bg-black/15 md:hidden dark:bg-white/20" aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs font-medium text-tertiary-foreground">
            {tier === "primary" ? `Key finding ${rank}` : `To watch ${rank}`} · {SIGNAL_TYPE_LABEL[finding.type]} · {context.facilityName}
          </p>
          <DialogPrimitive.Title className="text-[19px] leading-snug font-semibold tracking-tight">{finding.label}</DialogPrimitive.Title>
          <div className="flex flex-wrap items-center gap-2">
            <StandingBadge standing={findingStanding(finding)} />
            <span className="text-[13px] text-muted-foreground">Led by {lead.label}</span>
          </div>
        </div>
        <DialogPrimitive.Close
          aria-label="Close"
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      </div>
      <DialogPrimitive.Description className="text-[13px] leading-relaxed text-muted-foreground">
        {finding.placement} Compared with {context.peerGroup.charAt(0).toLowerCase() + context.peerGroup.slice(1)}.
      </DialogPrimitive.Description>

      <Section title="How the score is worked out">
        <p className="num rounded-xl bg-black/4 px-3 py-2.5 text-[13px] leading-relaxed dark:bg-white/6">
          <span className="font-semibold">Score {finding.score}</span> = 100 × {fmt(lead.severity.value)} severity × {fmt(lead.persistence.value, 1)} persistence ×{" "}
          {fmt(lead.weight, 1)} weight × {fmt(lead.confidence)} confidence
        </p>
        <dl className="space-y-3">
          <FactorRow label="Severity" value={fmt(lead.severity.value)} rule={lead.severity.rule} />
          <FactorRow label="Persistence" value={fmt(lead.persistence.value, 1)} rule={lead.persistence.rule} />
          <FactorRow
            label="Weight"
            value={fmt(lead.weight, 1)}
            rule={`The ${lead.program ? "penalty" : "metric"}'s tier in the ${family?.label ?? finding.label} family: 1.0, 0.8 or 0.6.`}
          />
          <FactorRow
            label={`Confidence: ${CONFIDENCE_LABEL[finding.level]}`}
            value={fmt(lead.confidence)}
            rule="The product of the factors below. High is 0.8 or more, Medium 0.6 to 0.79, Low below 0.6 (Low can't be primary)."
          />
        </dl>
        <ul className="space-y-1.5 rounded-xl border border-border px-3 py-2.5">
          {lead.factors.map((f) => (
            <li key={f.label} className="grid grid-cols-[1fr_auto] gap-x-3 text-xs">
              <span className="font-medium">{f.label}</span>
              <span className="num font-semibold">×{fmt(f.value, 2)}</span>
              <span className="col-span-2 leading-relaxed text-muted-foreground">{f.rule}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Evidence">
        {lead.evidence && <Evidence e={lead.evidence} />}
        {lead.items && lead.items.length > 0 && (
          <ul className="space-y-1.5">
            {lead.items.map((i) => (
              <li key={i.key} className="text-xs leading-relaxed">
                <span className="font-medium">{i.label}:</span> <span className="text-muted-foreground">{i.detail}.</span>
              </li>
            ))}
          </ul>
        )}
        {finding.dollars && (
          <p className="text-[13px]">
            <span className="font-medium">About {formatUsd(finding.dollars.amount, { compact: true })} a year</span>
            <span className="text-muted-foreground">: {finding.dollars.basis}. Shown as evidence; dollars don&apos;t change the score.</span>
          </p>
        )}
        <StatusLine {...lead.status} />
        {onShowMetric && lead.evidence && (
          <button
            type="button"
            onClick={() => onShowMetric(lead.evidence!.metric)}
            className="inline-flex items-center gap-1 rounded text-[13px] font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            Show this metric&apos;s card <ArrowRight className="size-3.5" aria-hidden />
          </button>
        )}
      </Section>

      {others.length > 0 && (
        <Section title="Related signals in this finding">
          <p className="text-xs text-muted-foreground">
            Also qualified in this family. The finding takes one place however many signals it has; its score is the lead&apos;s.
          </p>
          <ul className="space-y-3">
            {others.map((c) => (
              <OtherCandidate key={c.id} c={c} onShowMetric={onShowMetric} />
            ))}
          </ul>
        </Section>
      )}

      {finding.context.length > 0 && (
        <Section title="Other metrics in this family">
          <ul className="space-y-1">
            {finding.context.map((e) => (
              <li key={e.metric} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                {e.standing && <StandingBadge standing={e.standing} short />}
                <span className="font-medium">{e.label}</span>
                <span className="num text-muted-foreground">
                  {e.text.value} ({e.period}){e.text.median ? `, peer median ${e.text.median}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Suggested next step">
        <p className="text-[13px] leading-relaxed">{finding.nextAction}</p>
        {finding.propose && (
          <div className="space-y-1">
            <Link
              href={finding.propose.href}
              className="btn-accent inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Calculator className="size-3.5" aria-hidden />
              Model in Propose: {finding.propose.module}
            </Link>
            <p className="text-xs text-muted-foreground">
              {finding.propose.prefilled
                ? "Prefilled with the gap to the peer median: a starting point, not a target."
                : "Opens with a name and description only. No amounts are prefilled; enter the initiative's own estimates."}
            </p>
          </div>
        )}
        <PinButton finding={finding} tier={tier} context={context} className="mt-1" />
      </Section>
    </div>
  )
}

function OtherCandidate({ c, onShowMetric }: { c: Candidate; onShowMetric?: (metricId: string) => void }) {
  return (
    <li className="space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-[13px] font-medium">{c.label}</p>
        <span className="num text-xs text-muted-foreground">
          Score {c.score} · {CONFIDENCE_LABEL[c.confidence >= 0.8 ? "high" : c.confidence >= 0.6 ? "medium" : "low"]}
        </span>
      </div>
      {c.evidence && <Evidence e={c.evidence} />}
      {c.items && c.items.length > 0 && (
        <ul className="space-y-1">
          {c.items.map((i) => (
            <li key={i.key} className="text-xs leading-relaxed">
              <span className="font-medium">{i.label}:</span> <span className="text-muted-foreground">{i.detail}.</span>
            </li>
          ))}
        </ul>
      )}
      {c.dollars && (
        <p className="text-xs text-muted-foreground">
          About {formatUsd(c.dollars.amount, { compact: true })} a year: {c.dollars.basis}.
        </p>
      )}
      {onShowMetric && c.evidence && (
        <button
          type="button"
          onClick={() => onShowMetric(c.evidence!.metric)}
          className="inline-flex items-center gap-1 rounded text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          Show this metric&apos;s card <ArrowRight className="size-3" aria-hidden />
        </button>
      )}
    </li>
  )
}
