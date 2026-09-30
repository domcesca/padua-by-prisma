"use client"

import { ArrowRight, Users } from "lucide-react"
import Link from "next/link"

import { PinButton } from "@/components/findings/finding-row"
import { StandingBadge } from "@/components/shell/standing"
import type { MetricDef } from "@/lib/data/datasets"
import type { FindingsResult } from "@/lib/findings/compute"
import { HOME_COUNT } from "@/lib/findings/families"
import { benchmarkHref, findingStanding, headlineOf } from "@/lib/findings/links"
import { SectionError } from "./section"

// Needs attention (V7.5.5: compacted into Overview's top strip): the hospital's top primary findings against its peer
// group (the Opportunity Finder, the same list as Compare's Hospital priorities), one line each, with where to review
// it and a pin. The only peer comparison on the Overview, and labeled as one, so the annual report below stays about
// the hospital alone.

export function NeedsAttention({
  facilityId,
  facilityName,
  peerQuery,
  findings,
  metaById,
}: {
  facilityId: string
  facilityName: string
  /** The peer group as URL params ("" = Similar hospitals). */
  peerQuery: string
  findings: {
    data: FindingsResult | null
    error: string | null
    loading: boolean
    retry: () => void
  }
  metaById: Record<string, MetricDef>
}) {
  const { data, error, loading, retry } = findings
  const peers = new URLSearchParams(peerQuery)
  const all = `/compare?${new URLSearchParams([...peers, ["facility", facilityId]])}#key-findings`
  const top = data?.primary.slice(0, HOME_COUNT) ?? []
  const more = data ? data.primary.length - top.length + data.secondary.length : 0

  return (
    <section aria-labelledby="needs-attention" aria-busy={loading} className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <h2 id="needs-attention" className="text-[15px] font-semibold tracking-tight">
          Needs attention
        </h2>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
          <Users className="size-3" aria-hidden />
          Against peers
        </span>
        <span className="text-xs text-muted-foreground">
          {data ? `${data.peerGroup.description} (${data.peerGroup.count})` : "The biggest unfavorable gaps against the peer group"}
        </span>
      </div>
      {error ? (
        <SectionError message={`Couldn't load hospital priorities (${error}).`} retry={retry} />
      ) : loading || !data ? (
        <div className="space-y-2" aria-hidden>
          {Array.from({ length: HOME_COUNT }, (_, i) => (
            <div key={i} className="h-5 w-4/5 animate-pulse rounded bg-black/5 dark:bg-white/6" />
          ))}
          <p className="sr-only" role="status">
            Loading hospital priorities…
          </p>
        </div>
      ) : top.length === 0 ? (
        <p className="text-[13px] text-muted-foreground" role="status">
          No unfavorable gap against {data.peerGroup.count} peer
          {data.peerGroup.count === 1 ? "" : "s"} stands out.{" "}
          <Link href={all} className="font-medium text-primary hover:underline">
            See every area in Compare
          </Link>
          .
        </p>
      ) : (
        <>
          <ol aria-label="Top hospital priorities, against peers" className="divide-y divide-border">
            {top.map((f, i) => (
              <li key={f.id} className="flex flex-col gap-1.5 py-2 first:pt-0.5 sm:flex-row sm:items-center sm:gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <span
                    className="num mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-unfavorable/10 text-[11px] font-semibold text-unfavorable"
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <p className="min-w-0 text-[14px] leading-snug">
                    <span className="sr-only">Priority {i + 1}: </span>
                    <span className="font-semibold">{f.label}</span> <StandingBadge standing={findingStanding(f)} short className="mx-0.5 align-[1px]" />{" "}
                    <span className="text-muted-foreground">{headlineOf(f)}</span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5 pl-7 sm:pl-0">
                  <Link
                    href={benchmarkHref(f, facilityId, metaById, peers)}
                    className="inline-flex min-h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary outline-none glass-subtle hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Review
                    <ArrowRight className="size-3.5" aria-hidden />
                    <span className="sr-only"> {f.label} in Compare</span>
                  </Link>
                  <PinButton
                    finding={f}
                    tier="primary"
                    context={{
                      facilityName,
                      peerGroup: data.peerGroup.description,
                      peerQuery,
                    }}
                  />
                </div>
              </li>
            ))}
          </ol>
          {more > 0 && (
            <Link
              href={all}
              className="inline-flex items-center gap-1 rounded text-[13px] font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {more} more in Compare
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          )}
        </>
      )}
    </section>
  )
}
