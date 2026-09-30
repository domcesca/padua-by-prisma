import { OverviewView, type OverviewFacility } from "@/components/overview/overview-view"
import { getFacilityDirectory, getLatestYear, getMetricCatalog, lastReportedYear, toFacilityOption } from "@/lib/data/store"
import { withViewerSandbox } from "@/lib/server/sandbox"

// With the viewer's test hospitals in the picker, if they have any (lib/server/sandbox.ts).
export default function OverviewPage(props: PageProps<"/">) {
  return withViewerSandbox(() => render(props))
}

async function render({ searchParams }: PageProps<"/">) {
  const sp = await searchParams
  const [facilities, catalog, latestYear] = await Promise.all([getFacilityDirectory(), getMetricCatalog(), getLatestYear()])
  const options: OverviewFacility[] = facilities.map((f) => ({
    ...toFacilityOption(f),
    fiscalYearEnd: f.fiscalYearEnd,
    // The Filing calendar lists hospitals still reporting (app/filing-calendar/page.tsx).
    onCalendar: lastReportedYear(f) >= latestYear - 1,
  }))
  const facilityParam = typeof sp.facility === "string" && options.some((o) => o.id === sp.facility) ? sp.facility : null

  return <OverviewView facilities={options} catalog={catalog} latestYear={latestYear} initialFacilityId={facilityParam} />
}
