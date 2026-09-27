import type { Metadata } from "next"

import { BenchmarkView } from "@/components/benchmark/benchmark-view"
import type { FacilityOption } from "@/components/benchmark/facility-picker"
import { AboutTool } from "@/components/shell/about-tool"
import { PageHeader } from "@/components/shell/page-header"
import { computeBenchmark } from "@/lib/benchmark/compute"
import { parseFilters } from "@/lib/benchmark/filters"
import { metricsFor, parseView } from "@/lib/benchmark/view"
import { computeFindings } from "@/lib/findings/compute"
import { computeSpecialties } from "@/lib/specialty/compute"
import { DATASETS } from "@/lib/data/datasets"
import { DATASET_IDS, getDictionary, getFacilities, getLatestYear, getManifest, getMetricCatalog, toFacilityOption } from "@/lib/data/store"

export const metadata: Metadata = { title: "Benchmark" }

// One-click starting points spanning ownership types: nonprofit (Cedars-Sinai),
// academic (UCSF), district (Kaweah), county (SF General), investor (Mad River).
const SUGGESTED_IDS = ["106190555", "106381154", "106540734", "106380939", "106121002"]

export default async function BenchmarkPage({ searchParams }: PageProps<"/benchmark">) {
  const sp = await searchParams
  const params = new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))
  )
  const facilityId = params.get("facility")
  const filters = parseFilters(params)
  const view = parseView(params)

  const [facilities, dictionary, catalog, latestYear, manifests, initialResult, initialSpecialty, initialFindings] = await Promise.all([
    getFacilities(),
    getDictionary("hafd-selected"),
    getMetricCatalog(),
    getLatestYear(),
    Promise.all(DATASET_IDS.map(getManifest)),
    facilityId
      ? computeBenchmark({ facilityId, filters, category: view.category, metricIds: metricsFor(view), since: view.since, payer: view.payer, unit: view.unit, line: view.line })
      : Promise.resolve(null),
    facilityId && view.specialty
      ? computeSpecialties({ facilityId, filters, compareIds: view.compare, mdc: view.specialty !== "all" ? view.specialty : null })
      : Promise.resolve(null),
    facilityId ? computeFindings({ facilityId, filters }) : Promise.resolve(null),
  ])

  const options: FacilityOption[] = facilities.map(toFacilityOption)
  const counties = [...new Set(facilities.map((f) => f.county).filter((c): c is string => !!c))].sort()
  const byId = new Map(options.map((o) => [o.id, o]))
  let suggestions = SUGGESTED_IDS.map((id) => byId.get(id)).filter((o): o is FacilityOption => !!o)
  if (suggestions.length < 3) {
    suggestions = options
      .filter((o) => o.hospitalType === "Comparable" && o.typeOfCare === "General" && o.lastYear === latestYear)
      .sort((a, b) => (b.licensedBeds ?? 0) - (a.licensedBeds ?? 0))
      .slice(0, 5)
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Benchmark"
        actions={<AboutTool id="benchmark" />}
        description="See how a California hospital compares with similar hospitals on its finances, volumes, and quality."
      />
      <BenchmarkView
        facilities={options}
        counties={counties}
        catalog={catalog}
        payerGroups={dictionary.payerGroups.map(({ id, label }) => ({ id, label }))}
        latestYear={latestYear}
        years={[...new Set(manifests.flatMap((m) => m.years))].sort((a, b) => a - b)}
        initialFacilityId={initialResult ? facilityId : null}
        initialFilters={filters}
        initialView={view}
        initialResult={initialResult}
        initialSpecialty={initialSpecialty}
        initialFindings={initialFindings}
        initialFinding={initialResult ? (params.get("finding")?.match(/^[a-zA-Z]+$/)?.[0] ?? null) : null}
        suggestions={suggestions}
      />
      <DataNote manifests={manifests} />
    </div>
  )
}

function DataNote({ manifests }: { manifests: Awaited<ReturnType<typeof getManifest>>[] }) {
  const generatedAt = manifests.map((m) => m.generatedAt).sort().at(-1)!
  return (
    <footer className="space-y-1 border-t border-border pt-6 text-xs leading-relaxed text-tertiary-foreground">
      {manifests.map((m) => (
        <p key={m.id}>
          <a href={DATASETS[m.id].sourcePage} className="underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
            {DATASETS[m.id].label}
          </a>
          , {m.years[0]}–{m.years.at(-1)}. {DATASETS[m.id].yearNote}
        </p>
      ))}
      <p>
        Hospitals with partial-year or multiple reports are combined and annualized. Utilization for campuses that share a
        license is combined into the licensed hospital, matching the financial report. CMS and CDPH identify hospitals by
        their own IDs; those are matched to HCAI hospitals with CDPH’s licensed facility crosswalk. Recent financial years include reports
        HCAI hasn’t finished auditing. Data processed{" "}
        {new Date(generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.
      </p>
    </footer>
  )
}
