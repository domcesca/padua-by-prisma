"use client"

import { ExternalLink } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { buildAnnualReport, type AnnualReport, type Paragraph, type ReportSection } from "@/lib/annual-report/build"
import type { AnnualReportData } from "@/lib/annual-report/types"
import { cn } from "@/lib/utils"
import { ReportFigure } from "./report-figure"
import { SectionError } from "./section"

// The hospital's annual report (V7.5.5), Overview's main body: its own HCAI filings in thirteen sections, prose first,
// with figures only where lib/annual-report/build.ts puts them, and no comparison with any other hospital. The data is
// /api/report/[id]; every sentence and figure is built from it in the browser.

export function useAnnualReport(facilityId: string) {
  const [state, setState] = useState<{
    id: string
    data: AnnualReportData | null
    error: string | null
  } | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/report/${encodeURIComponent(facilityId)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? res.statusText)
        return (await res.json()) as AnnualReportData
      })
      .then(
        (data) => setState({ id: facilityId, data, error: null }),
        (e: Error) => {
          if (e.name !== "AbortError")
            setState({
              id: facilityId,
              data: null,
              error: e.message || "failed",
            })
        }
      )
    return () => controller.abort()
  }, [facilityId, attempt])
  const current = state?.id === facilityId ? state : null
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: !current,
    retry: () => {
      setState(null)
      setAttempt((a) => a + 1)
    },
  }
}

export const sectionAnchor = (id: string) => `report-${id}`

export function AnnualReportBody({ facilityName, report }: { facilityName: string; report: ReturnType<typeof useAnnualReport> }) {
  const built: AnnualReport | null = useMemo(() => (report.data ? buildAnnualReport(report.data, facilityName) : null), [report.data, facilityName])
  if (report.error) return <SectionError message={`Couldn't load the annual report (${report.error}).`} retry={report.retry} />
  if (!built) return <ReportLoading />
  return (
    <div className="space-y-10">
      {built.sections.map((s) => (
        <ReportSectionView key={s.id} section={s} />
      ))}
    </div>
  )
}

function ReportSectionView({ section }: { section: ReportSection }) {
  const headingId = sectionAnchor(section.id)
  const brief = section.id === "brief"
  return (
    <section
      id={headingId}
      aria-labelledby={`${headingId}-title`}
      className={cn("scroll-mt-24 space-y-4", section.addendum && "rounded-2xl border border-dashed border-border p-5")}
    >
      <header className="space-y-1">
        {section.addendum && (
          <p className="inline-flex rounded-full bg-black/5 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground dark:bg-white/8">
            Addendum · not part of HCAI&apos;s report
          </p>
        )}
        <h2 id={`${headingId}-title`} className="text-[21px] leading-tight font-semibold tracking-tight">
          {section.title}
        </h2>
        {section.period && <p className="text-xs text-muted-foreground">{section.period}</p>}
      </header>
      <div className="max-w-[68ch] space-y-3">
        <p className={cn("leading-relaxed", brief ? "text-[18px] font-medium" : "text-[16px] font-medium")}>{section.lead}</p>
        {section.paragraphs.map((p, i) => (
          <ParagraphView key={i} p={p} />
        ))}
      </div>
      {section.figures.length > 0 && (
        <div className="grid gap-4">
          {section.figures.map((f) => (
            <ReportFigure key={f.id} figure={f} />
          ))}
        </div>
      )}
      {section.about && <AboutDetails about={section.about} />}
    </section>
  )
}

function ParagraphView({ p }: { p: Paragraph }) {
  if (typeof p === "string") return <p className="text-[15px] leading-relaxed text-muted-foreground">{p}</p>
  return (
    <p className="text-[15px] leading-relaxed text-muted-foreground">
      <span className="font-medium text-foreground">{p.lead}</span> {p.text}
    </p>
  )
}

const LINK = "rounded font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"

function AboutDetails({ about }: { about: NonNullable<ReportSection["about"]> }) {
  return (
    <div className="grid max-w-[68ch] gap-5 text-[14px] leading-relaxed">
      {about.omitted.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-[15px] font-semibold">Left out for this hospital</h3>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {about.omitted.map((o) => (
              <li key={o.title}>
                <span className="font-medium text-foreground">{o.title}.</span> {o.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="space-y-1.5">
        <h3 className="text-[15px] font-semibold">What HCAI publishes that this report doesn&apos;t show</h3>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          {about.gaps.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      </div>
      <details className="group space-y-1.5">
        <summary className="cursor-pointer rounded text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">
          How Padua works out its own figures
        </summary>
        <p className="mt-1.5 text-muted-foreground">
          HCAI publishes the amounts; these ratios of them are Padua&apos;s, in HCAI&apos;s field codes. Each is checked against every hospital-year HCAI has
          published.
        </p>
        <dl className="mt-2 space-y-2.5">
          {about.calcs.map((c) => (
            <div key={c.label}>
              <dt className="font-medium">{c.label}</dt>
              <dd className="text-muted-foreground">
                {c.summary} <code className="rounded bg-black/5 px-1 text-[12px] text-foreground dark:bg-white/8">{c.formula}</code>
                {c.caution && <span className="block text-xs">{c.caution}</span>}
              </dd>
            </div>
          ))}
        </dl>
      </details>
      <div className="space-y-1.5">
        <h3 className="text-[15px] font-semibold">Sources</h3>
        <ul className="space-y-1.5 text-muted-foreground">
          {about.sources.map((s) => (
            <li key={s.href}>
              <a href={s.href} target="_blank" rel="noreferrer" className={cn(LINK, "inline-flex items-center gap-1")}>
                {s.label}
                <ExternalLink className="size-3.5" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
              <span className="block text-xs">{s.detail}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-muted-foreground">
        The official filing is in{" "}
        <a href={about.siera} target="_blank" rel="noreferrer" className={LINK}>
          HCAI&apos;s SIERA reports
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        . What each HCAI field means is in the{" "}
        <Link href="/data-definitions" className={LINK}>
          Data definitions
        </Link>
        .
      </p>
    </div>
  )
}

function ReportLoading() {
  return (
    <div className="space-y-8" aria-busy="true">
      <p className="sr-only" role="status">
        Loading the annual report…
      </p>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-3">
          <div className="h-6 w-1/3 animate-pulse rounded bg-black/6 dark:bg-white/8" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-black/5 dark:bg-white/6" />
          <div className="h-4 w-4/6 animate-pulse rounded bg-black/5 dark:bg-white/6" />
          {i === 1 && <div className="h-56 animate-pulse rounded-xl bg-black/4 dark:bg-white/5" />}
        </div>
      ))}
    </div>
  )
}

/** The report's contents, for the sidebar: a jump link per section shown. */
export function ReportContents({ facilityName, report, className }: { facilityName: string; report: ReturnType<typeof useAnnualReport>; className?: string }) {
  const built = useMemo(() => (report.data ? buildAnnualReport(report.data, facilityName) : null), [report.data, facilityName])
  if (!built) return null
  return (
    <nav aria-label="Annual report contents" className={className}>
      <h2 className="px-1 text-[13px] font-semibold text-muted-foreground">In this report</h2>
      <ol className="mt-1.5 space-y-0.5">
        {built.sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${sectionAnchor(s.id)}`}
              className="block rounded-md px-1 py-1 text-[13px] leading-snug text-foreground/85 outline-none hover:bg-black/4 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/6"
            >
              {s.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
