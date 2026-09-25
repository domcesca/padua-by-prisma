import type { FacilityOption } from "@/components/benchmark/facility-picker"
import { HomeFlow } from "@/components/home/home-flow"
import { getAllYears, getFacilityOptions, getLatestYear, getMetricCatalog } from "@/lib/data/store"

// One-click starting points spanning ownership types: nonprofit (Cedars-Sinai),
// academic (UCSF), district (Kaweah), county (SF General), investor (Mad River).
const SUGGESTED_IDS = ["106190555", "106381154", "106540734", "106380939", "106121002"]

export default async function Home() {
  const [facilities, catalog, latestYear, years] = await Promise.all([
    getFacilityOptions(),
    getMetricCatalog(),
    getLatestYear(),
    getAllYears(),
  ])
  const byId = new Map(facilities.map((f) => [f.id, f]))
  const suggestions = SUGGESTED_IDS.map((id) => byId.get(id)).filter((f): f is FacilityOption => !!f)

  return <HomeFlow facilities={facilities} catalog={catalog} years={years} latestYear={latestYear} suggestions={suggestions} />
}
