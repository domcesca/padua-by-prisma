import type { Metadata } from "next"

import { CorrelateView } from "@/components/correlate/correlate-view"
import { PageHeader } from "@/components/shell/page-header"
import { runCorrelate } from "@/lib/correlate/run"
import { parseCorrelateSpec } from "@/lib/correlate/spec"
import { getFacilityOptions, getLatestYear, getTrendMetrics } from "@/lib/data/store"

export const metadata: Metadata = { title: "Correlate" }

export default async function CorrelatePage({ searchParams }: PageProps<"/correlate">) {
  const sp = await searchParams
  const params = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])))
  const [facilities, catalog, latestYear] = await Promise.all([getFacilityOptions(), getTrendMetrics(), getLatestYear()])
  const spec = parseCorrelateSpec(params, new Set(catalog.map((m) => m.id)))
  if (spec.facilityId && !facilities.some((f) => f.id === spec.facilityId)) spec.facilityId = null
  const result = spec.facilityId ? await runCorrelate(spec) : null

  return (
    <div className="space-y-8">
      <PageHeader
        title="Correlate"
        description="Plot any two measures against each other across a hospital’s peer group, to see whether they move together."
      />
      <CorrelateView
        facilities={facilities}
        catalog={catalog}
        latestYear={latestYear}
        initialSpec={spec}
        initialResult={result && !("error" in result) ? result : null}
        initialError={result && "error" in result ? result.error : null}
      />
    </div>
  )
}
