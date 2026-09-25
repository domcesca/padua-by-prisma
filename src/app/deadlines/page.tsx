import type { Metadata } from "next"

import { DeadlinesView, type DeadlineFacility } from "@/components/deadlines/deadlines-view"
import { AboutTool } from "@/components/shell/about-tool"
import { PageHeader } from "@/components/shell/page-header"
import { getFacilities, getLatestYear, lastReportedYear, toFacilityOption } from "@/lib/data/store"
import { SOURCES } from "@/lib/deadlines/rules"

export const metadata: Metadata = { title: "Deadlines" }

export default async function DeadlinesPage({ searchParams }: PageProps<"/deadlines">) {
  const sp = await searchParams
  const [facilities, latestYear] = await Promise.all([getFacilities(), getLatestYear()])
  // Only hospitals still reporting need a calendar.
  const options: DeadlineFacility[] = facilities
    .filter((f) => lastReportedYear(f) >= latestYear - 1)
    .map((f) => ({ ...toFacilityOption(f), fiscalYearEnd: f.fiscalYearEnd }))
  const facilityParam = typeof sp.facility === "string" ? sp.facility : null

  return (
    <div className="space-y-8">
      <PageHeader
        title="Deadlines"
        actions={<AboutTool id="deadlines" />}
        description="HCAI financial reporting due dates for your hospital’s fiscal year, with extension limits and what’s coming up next."
      />
      <DeadlinesView
        facilities={options}
        initialFacilityId={options.some((o) => o.id === facilityParam) ? facilityParam : null}
        latestYear={latestYear}
      />
      <section aria-labelledby="rules-title" className="space-y-3 border-t border-border pt-6">
        <h2 id="rules-title" className="text-[13px] font-semibold tracking-tight">
          How these dates are calculated
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {SOURCES.map((s) => (
            <li key={s.href} className="text-xs leading-relaxed">
              <a href={s.href} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                {s.label}
              </a>
              <p className="text-muted-foreground">{s.detail}</p>
            </li>
          ))}
        </ul>
        <p className="text-xs leading-relaxed text-tertiary-foreground">
          Dates are computed from these rules and aren&apos;t adjusted for weekends or state holidays. SIERA shows your
          hospital&apos;s official due dates and any approved extensions or reporting modifications — check it before
          relying on a date. This calendar covers HCAI financial reports only, not patient-level data (MIRCal) or other
          state and federal filings.
        </p>
      </section>
    </div>
  )
}
