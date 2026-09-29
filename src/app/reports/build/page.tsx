import type { Metadata } from "next"

import { BuildView } from "@/components/build/build-view"
import { AboutTool } from "@/components/shell/about-tool"
import { PageHeader } from "@/components/shell/page-header"
import { CATEGORY_BY_ID, isTrendMetric, parseCategory } from "@/lib/data/datasets"
import { DATASET_IDS, getFacilityOptions, getLatestYear, getManifest, getMetricCatalog } from "@/lib/data/store"
import { runReport } from "@/lib/report/run"
import { parseSpec } from "@/lib/report/spec"
import { applyTemplate, parseTemplateId, TEMPLATE_BY_ID } from "@/lib/report/templates"

export const metadata: Metadata = { title: "Build a report" }

export default async function BuildPage({ searchParams }: PageProps<"/reports/build">) {
  const sp = await searchParams
  const params = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])))
  const [facilities, catalog, latestYear, manifests] = await Promise.all([
    getFacilityOptions(),
    getMetricCatalog(),
    getLatestYear(),
    Promise.all(DATASET_IDS.map(getManifest)),
  ])
  const trendMetrics = catalog.filter(isTrendMetric)
  const valid = new Set(trendMetrics.map((m) => m.id))
  let spec = parseSpec(params, valid)
  // A template link (?template=board, from the Reports page) fills in its settings unless the link names measures.
  const template = parseTemplateId(params.get("template"))
  if (template && !params.get("metrics")) spec = applyTemplate(spec, TEMPLATE_BY_ID[template], valid)
  if (spec.facilityId && !facilities.some((f) => f.id === spec.facilityId)) spec.facilityId = null
  spec.compare = spec.compare.filter((id) => facilities.some((f) => f.id === id))
  // Arriving from Home or the nav with just a hospital and a topic: start with two of its headline metrics.
  if (!spec.metrics.length && template !== "custom") spec.metrics = CATEGORY_BY_ID[parseCategory(params.get("category"))].defaultMetrics.slice(0, 2)

  const result = spec.facilityId ? await runReport(spec) : null
  const years = [...new Set(manifests.flatMap((m) => m.years))].sort((a, b) => a - b)

  return (
    <div className="space-y-8">
      <PageHeader
        title="Build a report"
        actions={<AboutTool id="report" />}
        description="Make a chart or table for board decks and reviews from any measure in Padua — HCAI financial and utilization reports, case mix index, CMS Care Compare quality and patient experience, and CDPH infection data. Start from a template or pick your own."
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
