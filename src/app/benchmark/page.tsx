import type { Metadata } from "next"

import { BenchmarkView } from "@/components/benchmark/benchmark-view"
import type { FacilityOption } from "@/components/benchmark/facility-picker"
import { PageHeader } from "@/components/shell/page-header"
import { computeBenchmark } from "@/lib/benchmark/compute"
import { parseFilters } from "@/lib/benchmark/filters"
import { getDictionary, getFacilities, getManifest } from "@/lib/data/hafd"

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

  const [facilities, dictionary, manifest, initialResult] = await Promise.all([
    getFacilities(),
    getDictionary(),
    getManifest(),
    facilityId ? computeBenchmark(facilityId, filters) : Promise.resolve(null),
  ])

  const options: FacilityOption[] = facilities.map((f) => ({
    id: f.id,
    name: f.name,
    formerNames: f.formerNames,
    county: f.county,
    city: f.city,
    licensedBeds: f.licensedBeds,
    typeOfCare: f.typeOfCare,
    hospitalType: f.hospitalType,
    lastYear: f.years.at(-1) ?? 0,
  }))
  const counties = [...new Set(facilities.map((f) => f.county).filter((c): c is string => !!c))].sort()
  const latestYear = manifest.years.at(-1)!
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
        description="See how a California hospital compares with its peers on margin, cash, occupancy, ED volume, and payer mix."
      />
      <BenchmarkView
        facilities={options}
        counties={counties}
        metrics={dictionary.metrics}
        payerGroups={dictionary.payerGroups.map(({ id, label }) => ({ id, label }))}
        latestYear={latestYear}
        initialFacilityId={initialResult ? facilityId : null}
        initialFilters={filters}
        initialResult={initialResult}
        suggestions={suggestions}
      />
      <DataNote years={manifest.years} generatedAt={manifest.generatedAt} source={manifest.sourcePage} />
    </div>
  )
}

function DataNote({ years, generatedAt, source }: { years: number[]; generatedAt: string; source: string }) {
  return (
    <footer className="space-y-1 border-t border-border pt-6 text-xs leading-relaxed text-tertiary-foreground">
      <p>
        Source:{" "}
        <a href={source} className="underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
          HCAI Hospital Annual Financial Data – Selected File
        </a>
        , report years {years[0]}–{years.at(-1)}. A report year covers reports whose period ended in that calendar year,
        so a hospital with a June fiscal year end shows its July–June year.
      </p>
      <p>
        Hospitals with multiple reports in a year (fiscal-year changes, ownership changes) are combined and annualized.
        Recent years include reports HCAI hasn’t finished auditing. Data processed{" "}
        {new Date(generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.
      </p>
    </footer>
  )
}
