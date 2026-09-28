"use client"

import { ArrowRight, CircleAlert } from "lucide-react"
import Link from "next/link"
import { useRef, useState } from "react"

import { FindingRow } from "@/components/findings/finding-row"
import { FindingsEmpty, FindingsLoading, tierOf } from "@/components/findings/key-findings-panel"
import { MethodologyDrawer } from "@/components/findings/methodology-drawer"
import type { MetricDef } from "@/lib/data/datasets"
import type { FindingsResult } from "@/lib/findings/compute"
import { HOME_COUNT } from "@/lib/findings/families"
import { benchmarkHref } from "@/lib/findings/links"
import { OverviewSection, SectionError } from "./section"

// Needs attention: the hospital's top primary findings (the Opportunity Finder, the same list as Compare's Hospital
// priorities), the first HOME_COUNT of them, each with where to review it and, when it has a financial angle, a
// business case to model. Was Home's "Where to look first".

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
  findings: { data: FindingsResult | null; error: string | null; loading: boolean; retry: () => void }
  metaById: Record<string, MetricDef>
}) {
  const { data, error, loading, retry } = findings
  const [openFamily, setOpenFamily] = useState<string | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const open = openFamily && data ? tierOf(data, openFamily) : null
  const peers = new URLSearchParams(peerQuery)
  const all = `/compare?${new URLSearchParams([...peers, ["facility", facilityId]])}#key-findings`
  const top = data?.primary.slice(0, HOME_COUNT) ?? []
  const more = data ? data.primary.length - top.length + data.secondary.length : 0

  return (
    <OverviewSection
      id="needs-attention"
      icon={CircleAlert}
      title="Needs attention"
      busy={loading}
      description={
        data
          ? `Compared with ${data.peerGroup.count} peer${data.peerGroup.count === 1 ? "" : "s"}${top.length ? `: the top ${top.length === 1 ? "hospital priority" : `${top.length} hospital priorities`}, across every area` : ""}.`
          : "The biggest unfavorable gaps against peers, across every area, ranked."
      }
      link={data && (data.primary.length > 0 || data.secondary.length > 0) ? { href: all, label: "All hospital priorities" } : null}
    >
      {error ? (
        <SectionError message={`Couldn't load hospital priorities (${error}).`} retry={retry} />
      ) : loading || !data ? (
        <FindingsLoading rows={HOME_COUNT} />
      ) : (
        <>
          <FindingsEmpty result={data} where="home" />
          {top.length > 0 && (
            <ol aria-label="Top hospital priorities" className="divide-y divide-border">
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
          {more > 0 && top.length > 0 && (
            <Link
              href={all}
              className="inline-flex items-center gap-1 self-start rounded text-[13px] font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {more} more in Compare ({data.primary.length} primary, {data.secondary.length} to watch)
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
    </OverviewSection>
  )
}
