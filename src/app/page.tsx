import { OverviewView, type OverviewFacility } from "@/components/overview/overview-view"
import { getFacilities, getLatestYear, getMetricCatalog, lastReportedYear, toFacilityOption } from "@/lib/data/store"

export default async function OverviewPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams
  const [facilities, catalog, latestYear] = await Promise.all([getFacilities(), getMetricCatalog(), getLatestYear()])
  const options: OverviewFacility[] = facilities.map((f) => ({
    ...toFacilityOption(f),
    fiscalYearEnd: f.fiscalYearEnd,
    // The Filing calendar lists hospitals still reporting (app/filing-calendar/page.tsx).
    onCalendar: lastReportedYear(f) >= latestYear - 1,
  }))
  const facilityParam = typeof sp.facility === "string" && options.some((o) => o.id === sp.facility) ? sp.facility : null

  return <OverviewView facilities={options} catalog={catalog} latestYear={latestYear} initialFacilityId={facilityParam} />
}
