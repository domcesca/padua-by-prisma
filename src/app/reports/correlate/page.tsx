import type { Metadata } from "next"

import { CorrelateView } from "@/components/correlate/correlate-view"
import { AboutTool } from "@/components/shell/about-tool"
import { PageHeader } from "@/components/shell/page-header"
import { runCorrelate } from "@/lib/correlate/run"
import { parseCorrelateSpec } from "@/lib/correlate/spec"
import { getFacilityOptions, getLatestYear, getTrendMetrics } from "@/lib/data/store"

export const metadata: Metadata = { title: "Correlate" }

export default async function CorrelatePage({ searchParams }: PageProps<"/reports/correlate">) {
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
        eyebrow="Advanced analysis"
        actions={<AboutTool id="correlate" />}
        description="Plot two measures against each other across a hospital’s peer group, to see whether they move together — and whether one hospital, or a third factor, explains it. Start from a question or pick any two."
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
