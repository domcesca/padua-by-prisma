"use client"

import { ArrowRight, Loader2, NotebookPen, Printer, X } from "lucide-react"
import Link from "next/link"
import { useRef, useState } from "react"

import { tierOf } from "@/components/findings/key-findings-panel"
import { MethodologyDrawer } from "@/components/findings/methodology-drawer"
import { useFindings } from "@/components/findings/use-findings"
import { StandingBadge } from "@/components/shell/standing"
import { unpin, unpinHospital, usePins, type Pin } from "@/lib/findings/briefing"
import type { FindingsResult } from "@/lib/findings/compute"
import { findingStanding, headlineOf } from "@/lib/findings/links"
import { CONFIDENCE_LABEL } from "@/lib/findings/score"
import { useMounted } from "@/lib/use-mounted"
import { cn } from "@/lib/utils"

// The pinned briefing: each pinned finding as it stood when pinned, next to how it stands now against the same peer
// group. Pins live in this browser only (lib/findings/briefing.ts); the current findings come from /api/findings.

const dateOf = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

const BUTTON =
  "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function BriefingView() {
  const mounted = useMounted()
  const pins = usePins()
  if (!mounted) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Loading your briefing…
      </p>
    )
  }
  if (!pins.length) {
    return (
      <div className="glass rounded-2xl p-8 text-center">
        <NotebookPen className="mx-auto size-6 text-muted-foreground" aria-hidden />
        <p className="mt-2 font-medium">Nothing pinned yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Pick a hospital on Home or in Benchmark, then use <span className="font-medium text-foreground">Pin to briefing</span> on any key finding.
          Pins are saved in this browser only.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Link href="/" className={cn(BUTTON, "btn-accent")}>
            Go to Home
          </Link>
          <Link href="/benchmark" className={cn(BUTTON, "glass-subtle")}>
            Open Benchmark
          </Link>
        </div>
      </div>
    )
  }

  // One group per hospital and peer group, in the order first pinned (newest first).
  const groups = new Map<string, Pin[]>()
  for (const p of pins) {
    const key = `${p.facilityId}?${p.peerQuery}`
    groups.set(key, [...(groups.get(key) ?? []), p])
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <p className="text-[13px] text-muted-foreground">
          {pins.length} pinned finding{pins.length === 1 ? "" : "s"} across {new Set(pins.map((p) => p.facilityId)).size} hospital
          {new Set(pins.map((p) => p.facilityId)).size === 1 ? "" : "s"}.
        </p>
        <button type="button" onClick={() => window.print()} className={cn(BUTTON, "glass-subtle")}>
          <Printer className="size-3.5" aria-hidden />
          Print briefing
        </button>
      </div>
      {[...groups.values()].map((group) => (
        <HospitalGroup key={`${group[0].facilityId}?${group[0].peerQuery}`} pins={group} />
      ))}
      <p className="text-xs text-tertiary-foreground">
        Printed {dateOf(new Date().toISOString())}. Public data from HCAI, CMS and CDPH. Scores compare each hospital with the peer group named;
        each finding&apos;s methodology shows the math.
      </p>
    </div>
  )
}

type Status = { label: string; tone: "same" | "changed" | "gone" | "pending"; detail: string }

function statusOf(pin: Pin, data: FindingsResult | null, loading: boolean, error: string | null): Status {
  if (error) return { label: "Couldn't check", tone: "pending", detail: error }
  if (loading || !data) return { label: "Checking…", tone: "pending", detail: "Loading the latest findings." }
  const now = tierOf(data, pin.family)
  if (!now) {
    return {
      label: "No longer qualifies",
      tone: "gone",
      detail: "It isn't among this hospital's key findings against these peers any more: its standing improved, the data changed, or it fell out of the ranked list.",
    }
  }
  const was = pin.snapshot
  const scoreMoved = now.finding.score !== was.score
  const tierMoved = now.tier !== was.tier
  if (scoreMoved || tierMoved) {
    const parts = [
      scoreMoved ? `score ${was.score} → ${now.finding.score}` : null,
      tierMoved ? (now.tier === "primary" ? "moved up to primary" : "moved to watch") : null,
    ].filter(Boolean)
    return { label: "Score changed", tone: "changed", detail: `${parts.join("; ")}.`.replace(/^./, (c) => c.toUpperCase()) }
  }
  return {
    label: "Still a key finding",
    tone: "same",
    detail: `Same score, still ${now.tier === "primary" ? `primary #${now.rank}` : `to watch #${now.rank}`}.`,
  }
}

const TONE: Record<Status["tone"], string> = {
  same: "bg-black/5 text-foreground dark:bg-white/8",
  changed: "bg-warning/12 text-warning",
  gone: "bg-black/5 text-muted-foreground dark:bg-white/8",
  pending: "bg-black/5 text-muted-foreground dark:bg-white/8",
}

function HospitalGroup({ pins }: { pins: Pin[] }) {
  const { facilityId, facilityName, peerQuery } = pins[0]
  const { data, loading, error, retry } = useFindings(facilityId, peerQuery)
  const [openFamily, setOpenFamily] = useState<string | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const open = openFamily && data ? tierOf(data, openFamily) : null
  const peerGroup = data?.peerGroup.description ?? pins[0].snapshot.peerGroup
  const benchmark = `/benchmark?${new URLSearchParams([...new URLSearchParams(peerQuery), ["facility", facilityId]])}#key-findings`

  return (
    <section aria-labelledby={`briefing-${facilityId}`} className="widget space-y-3 p-5 print:break-inside-avoid print:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <h2 id={`briefing-${facilityId}`} className="text-[19px] font-semibold tracking-tight">
            {facilityName}
          </h2>
          <p className="text-[13px] text-muted-foreground">Compared with {peerGroup.charAt(0).toLowerCase() + peerGroup.slice(1)}</p>
        </div>
        <div className="flex flex-wrap gap-1.5 print:hidden">
          <Link href={benchmark} className={cn(BUTTON, "glass-subtle")}>
            All key findings <ArrowRight className="size-3.5" aria-hidden />
          </Link>
          <button type="button" onClick={() => unpinHospital(facilityId)} className={cn(BUTTON, "glass-subtle")}>
            Remove all<span className="sr-only"> for {facilityName}</span>
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-destructive print:hidden">
          Couldn&apos;t check the latest findings ({error}).{" "}
          <button type="button" onClick={retry} className="rounded font-medium underline outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Try again
          </button>
        </p>
      )}
      <ul className="divide-y divide-border">
        {pins.map((pin) => {
          const status = statusOf(pin, data, loading, error)
          const now = data ? tierOf(data, pin.family) : null
          return (
            <li key={pin.id} className="space-y-2 py-3.5 first:pt-1 last:pb-1 print:break-inside-avoid">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", TONE[status.tone])}>
                    {status.tone === "pending" && status.label === "Checking…" && <Loader2 className="mr-1 size-3 animate-spin" aria-hidden />}
                    {status.label}
                  </span>
                  <h3 className="text-[15px] font-semibold tracking-tight">
                    {pin.snapshot.label}
                    {pin.snapshot.lead !== pin.snapshot.label && <span className="font-normal text-muted-foreground"> · {pin.snapshot.lead}</span>}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => unpin(pin.id)}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring print:hidden"
                  aria-label={`Remove ${pin.snapshot.label} from the briefing`}
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>
              <p className="text-[13px] text-muted-foreground">{status.detail}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-border px-3 py-2.5">
                  <p className="text-xs font-semibold tracking-wide text-tertiary-foreground uppercase">As pinned · {dateOf(pin.pinnedAt)}</p>
                  <p className="mt-1 text-[13px] leading-relaxed">{pin.snapshot.headline}</p>
                  <p className="num mt-1 text-xs text-muted-foreground">
                    Score {pin.snapshot.score} · {CONFIDENCE_LABEL[pin.snapshot.level]} confidence · {pin.snapshot.tier === "primary" ? "Primary" : "To watch"}
                    {pin.snapshot.through && <> · Data through {pin.snapshot.through}</>}
                  </p>
                </div>
                <div className="rounded-xl border border-border px-3 py-2.5">
                  <p className="text-xs font-semibold tracking-wide text-tertiary-foreground uppercase">Now</p>
                  {now ? (
                    <>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <StandingBadge standing={findingStanding(now.finding)} short />
                        <span className="text-[13px] font-medium">{now.finding.lead.label}</span>
                      </div>
                      <p className="mt-1 text-[13px] leading-relaxed">{headlineOf(now.finding)}</p>
                      <p className="num mt-1 text-xs text-muted-foreground">
                        Score {now.finding.score} · {CONFIDENCE_LABEL[now.finding.level]} confidence ·{" "}
                        {now.tier === "primary" ? `Primary #${now.rank}` : `To watch #${now.rank}`}
                        {now.finding.lead.status.through && <> · Data through {now.finding.lead.status.through}</>}
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          opener.current = e.currentTarget
                          setOpenFamily(pin.family)
                        }}
                        className="mt-1.5 inline-flex items-center gap-1 rounded text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring print:hidden"
                      >
                        Methodology <ArrowRight className="size-3" aria-hidden />
                      </button>
                    </>
                  ) : (
                    <p className="mt-1 text-[13px] text-muted-foreground">{loading ? "Checking…" : error ? "Not checked." : "Not a key finding now."}</p>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
      <MethodologyDrawer
        finding={open?.finding ?? null}
        tier={open?.tier ?? "primary"}
        rank={open?.rank ?? 1}
        context={{ facilityName, peerGroup, peerQuery }}
        onOpenChange={(o) => !o && setOpenFamily(null)}
        finalFocus={opener}
      />
    </section>
  )
}
