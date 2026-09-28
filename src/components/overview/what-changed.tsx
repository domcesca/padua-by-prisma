"use client"

import { ArrowRight, ChevronRight, History } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { StandingBadge, TrendText } from "@/components/shell/standing"
import { CATEGORY_BY_ID } from "@/lib/data/datasets"
import type { MetricCategory } from "@/lib/data/types"
import { STANDING_LABEL } from "@/lib/favorability"
import { cn } from "@/lib/utils"
import type { ChangeScan, MetricChange } from "@/lib/overview/changes"
import { OverviewSection, SectionEmpty, SectionError, SectionLoading } from "./section"

// What changed: Compare's standard measures in each topic whose standing against peers or whose trend is different in
// the latest period from the one before (lib/overview/changes.ts), worded as the cards word them: a standing pill and
// an arrow with a word, never color alone. Moves the wrong way are listed; moves up a band fold under "improved".

const SHOWN = 5

export type TopicScan = { category: MetricCategory; scan: ChangeScan | null; error: string | null }

export function WhatChanged({
  facilityId,
  peerQuery,
  topics,
  loading,
  retry,
}: {
  facilityId: string
  peerQuery: string
  topics: TopicScan[]
  loading: boolean
  retry: () => void
}) {
  const [allWorse, setAllWorse] = useState(false)
  const [showBetter, setShowBetter] = useState(false)
  const done = topics.filter((t) => t.scan)
  const failed = topics.filter((t) => t.error)
  const changes = done.flatMap((t) => t.scan!.changes.map((c) => ({ c, category: t.category })))
  // Standing moves before trend-only ones; otherwise topic order.
  const worse = changes.filter((x) => x.c.worse).sort((a, b) => Number(!a.c.standing) - Number(!b.c.standing))
  const better = changes.filter((x) => !x.c.worse)
  const shown = allWorse ? worse : worse.slice(0, SHOWN)
  const checked = done.reduce((n, t) => n + t.scan!.checked, 0)
  const since = sinceText(done)
  const compareHref = (category: MetricCategory) =>
    `/compare?${new URLSearchParams([...new URLSearchParams(peerQuery), ["facility", facilityId], ...(category !== "financial" ? [["view", category]] : [])])}`

  return (
    <OverviewSection
      id="what-changed"
      icon={History}
      title="What changed"
      busy={loading}
      description="Compare's standard measures whose standing against peers moved, or that turned to Worsening, since the period before."
    >
      {loading && !done.length ? (
        <SectionLoading label="Checking each measure's latest period against the one before…" rows={3} />
      ) : failed.length === topics.length ? (
        <SectionError message="Couldn't load the measures to compare." retry={retry} />
      ) : (
        <>
          {worse.length === 0 ? (
            <SectionEmpty title={better.length ? `Nothing moved the wrong way since ${since}` : `No material changes since ${since}`}>
              {checked > 0
                ? `No measure became Unfavorable, dropped out of Favorable, or turned to Worsening${better.length ? "" : ", and none moved up a band"}. Checked ${checked} measure${checked === 1 ? "" : "s"}: ${periodsText(done)}.`
                : "None of Compare's standard measures has two periods of data for this hospital yet."}
            </SectionEmpty>
          ) : (
            <ul aria-label="Moved the wrong way" className="divide-y divide-border">
              {shown.map(({ c, category }) => (
                <ChangeRow key={c.metric.id} change={c} category={category} href={compareHref(category)} />
              ))}
            </ul>
          )}
          {worse.length > SHOWN && (
            <button
              type="button"
              aria-expanded={allWorse}
              onClick={() => setAllWorse((v) => !v)}
              className="glass-subtle inline-flex h-8 items-center gap-1.5 self-start rounded-full px-3.5 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {allWorse ? "Show fewer" : `Show ${worse.length - SHOWN} more`}
            </button>
          )}
          {better.length > 0 && (
            <div className="rounded-xl border border-border">
              <button
                type="button"
                aria-expanded={showBetter}
                aria-controls="what-improved"
                onClick={() => setShowBetter((v) => !v)}
                className="flex w-full items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-left text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChevronRight className={cn("size-4 transition-transform", showBetter && "rotate-90")} aria-hidden />
                {better.length} improved
                <span className="font-normal text-muted-foreground">· moved up a band against peers</span>
              </button>
              {showBetter && (
                <ul id="what-improved" className="divide-y divide-border border-t border-border px-3.5">
                  {better.map(({ c, category }) => (
                    <ChangeRow key={c.metric.id} change={c} category={category} href={compareHref(category)} />
                  ))}
                </ul>
              )}
            </div>
          )}
          {failed.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Couldn&apos;t check {failed.map((t) => CATEGORY_BY_ID[t.category].label.toLowerCase()).join(" or ")}.{" "}
              <button type="button" onClick={retry} className="rounded font-medium text-primary underline outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Try again
              </button>
            </p>
          )}
        </>
      )}
    </OverviewSection>
  )
}

function ChangeRow({ change: c, category, href }: { change: MetricChange; category: MetricCategory; href: string }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5 py-3 first:pt-1 last:pb-1">
      <div className="min-w-0 space-y-1">
        <p className="text-[14px] font-medium">
          {c.metric.label}
          <span className="font-normal text-muted-foreground">
            {" "}
            · {CATEGORY_BY_ID[category].label} · {c.value} in {c.period}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {c.standing && (
            <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
              <StandingBadge standing={c.standing.now} />
              <span className="text-muted-foreground">
                was {STANDING_LABEL[c.standing.before]} in {c.priorPeriod}
              </span>
            </span>
          )}
          {c.trend && (
            <TrendText trend={c.trend.now} rising={c.rising}>
              from {c.priorValue} in {c.priorPeriod}
            </TrendText>
          )}
        </div>
      </div>
      <Link
        href={href}
        className="inline-flex shrink-0 items-center gap-1 rounded text-[13px] font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        Review in Compare
        <ArrowRight className="size-3.5" aria-hidden />
        <span className="sr-only">: {c.metric.label}</span>
      </Link>
    </li>
  )
}

function sinceText(done: TopicScan[]) {
  const priors = new Set(done.flatMap((t) => t.scan!.periods.map((p) => p.prior)))
  return priors.size === 1 ? [...priors][0] : "the previous period"
}

function periodsText(done: TopicScan[]) {
  return done
    .filter((t) => t.scan!.periods.length)
    .map((t) => {
      const p = t.scan!.periods[0]
      return `${CATEGORY_BY_ID[t.category].label.toLowerCase()} ${p.latest} vs ${p.prior}${t.scan!.periods.length > 1 ? " (and similar)" : ""}`
    })
    .join("; ")
}
