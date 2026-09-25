import type { Metadata } from "next"

import { BuildView } from "@/components/build/build-view"
import { PageHeader } from "@/components/shell/page-header"
import { CATEGORY_BY_ID, isTrendMetric, parseCategory } from "@/lib/data/datasets"
import { getFacilityOptions, getLatestYear, getManifest, getMetricCatalog } from "@/lib/data/store"
import { runReport } from "@/lib/report/run"
import { parseSpec } from "@/lib/report/spec"

export const metadata: Metadata = { title: "Build" }

export default async function BuildPage({ searchParams }: PageProps<"/build">) {
  const sp = await searchParams
  const params = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])))
  const [facilities, catalog, latestYear, manifests] = await Promise.all([
    getFacilityOptions(),
    getMetricCatalog(),
    getLatestYear(),
    Promise.all([getManifest("hafd-selected"), getManifest("hau")]),
  ])
  const trendMetrics = catalog.filter(isTrendMetric)
  const spec = parseSpec(params, new Set(trendMetrics.map((m) => m.id)))
  if (spec.facilityId && !facilities.some((f) => f.id === spec.facilityId)) spec.facilityId = null
  spec.compare = spec.compare.filter((id) => facilities.some((f) => f.id === id))
  // Arriving from Home or the nav with just a hospital and a topic: start with two of its headline metrics.
  if (!spec.metrics.length) spec.metrics = CATEGORY_BY_ID[parseCategory(params.get("category"))].defaultMetrics.slice(0, 2)

  const result = spec.facilityId ? await runReport(spec) : null
  const years = [...new Set(manifests.flatMap((m) => m.years))].sort((a, b) => a - b)

  return (
    <div className="space-y-8">
      <PageHeader
        title="Build"
        description="Make a chart or table from HCAI’s financial and utilization metrics: pick the metrics, how to group them, and how to show them."
      />
      <BuildView
        facilities={facilities}
        catalog={trendMetrics}
        years={years}
        latestYear={latestYear}
        initialSpec={spec}
        initialResult={result && !("error" in result) ? result : null}
      />
    </div>
  )
}
