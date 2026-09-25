"use client"

import { ArrowRight } from "lucide-react"
import Link from "next/link"
import { useRef, useState } from "react"

import { FindingRow } from "@/components/findings/finding-row"
import { FindingsEmpty, FindingsLoading, tierOf } from "@/components/findings/key-findings-panel"
import { MethodologyDrawer } from "@/components/findings/methodology-drawer"
import { useFindings } from "@/components/findings/use-findings"
import type { MetricDef } from "@/lib/data/datasets"
import { HOME_COUNT } from "@/lib/findings/families"
import { benchmarkHref } from "@/lib/findings/links"

// Home's decision-oriented entry point: once a hospital is picked, its top primary findings, each with where to
// review it and (when it has a financial angle) a Propose scenario to model. The topic steps stay below.

export function WhereToLook({
  facilityId,
  facilityName,
  statewide,
  metaById,
}: {
  facilityId: string
  facilityName: string
  /** Home's peer choice: statewide instead of similar hospitals. */
  statewide: boolean
  metaById: Record<string, MetricDef>
}) {
  const peerQuery = statewide ? "peers=statewide" : ""
  const { data, error, loading, retry } = useFindings(facilityId, peerQuery)
  const [openFamily, setOpenFamily] = useState<string | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const open = openFamily && data ? tierOf(data, openFamily) : null
  const peers = new URLSearchParams(peerQuery)
  const all = `/benchmark?${new URLSearchParams({ ...(statewide ? { peers: "statewide" } : {}), facility: facilityId })}#key-findings`
  const top = data?.primary.slice(0, HOME_COUNT) ?? []

  return (
    <section aria-labelledby="where-to-look" className="widget fade-up space-y-3 p-5" aria-busy={loading}>
      <div className="space-y-0.5">
        <h2 id="where-to-look" className="text-[19px] font-semibold tracking-tight">
          Where to look first
        </h2>
        <p className="text-[13px] text-muted-foreground">
          {data
            ? `${facilityName} compared with ${data.peerGroup.count} ${statewide ? "hospitals statewide" : "similar hospitals"}${top.length ? `: ${top.length === 1 ? "the top key finding" : `the top ${top.length} key findings`}` : ""}.`
            : `${facilityName}'s biggest unfavorable gaps against its peers, ranked.`}
        </p>
      </div>
      {error ? (
        <div role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
          Couldn&apos;t load key findings ({error}).{" "}
          <button type="button" onClick={retry} className="rounded font-medium underline outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Try again
          </button>
        </div>
      ) : loading || !data ? (
        <FindingsLoading rows={HOME_COUNT} />
      ) : (
        <>
          <FindingsEmpty result={data} where="home" />
          {top.length > 0 && (
            <ol aria-label="Top findings" className="divide-y divide-border">
              {top.map((f, i) => (
                <FindingRow
                  key={f.id}
                  finding={f}
                  rank={i + 1}
                  tier="primary"
                  context={{ facilityName, peerGroup: data.peerGroup.description, peerQuery }}
                  reviewHref={benchmarkHref(f, facilityId, metaById, peers)}
                  onMethodology={(finding, el) => {
                    opener.current = el
                    setOpenFamily(finding.family)
                  }}
                />
              ))}
            </ol>
          )}
          {(data.primary.length > 0 || data.secondary.length > 0) && (
            <Link
              href={all}
              className="inline-flex items-center gap-1 rounded text-[13px] font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {data.primary.length > top.length || data.secondary.length > 0
                ? `See all key findings (${data.primary.length} primary, ${data.secondary.length} to watch)`
                : "See key findings in Benchmark"}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          )}
        </>
      )}
      <MethodologyDrawer
        finding={open?.finding ?? null}
        tier={open?.tier ?? "primary"}
        rank={open?.rank ?? 1}
        context={{ facilityName, peerGroup: data?.peerGroup.description ?? "", peerQuery }}
        onOpenChange={(o) => !o && setOpenFamily(null)}
        finalFocus={opener}
      />
    </section>
  )
}
