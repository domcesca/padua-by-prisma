import type { FacilityOption } from "@/components/benchmark/facility-picker"
import { HomeFlow } from "@/components/home/home-flow"
import { getFacilityOptions, getLatestYear, getManifest, getMetricCatalog } from "@/lib/data/store"

// One-click starting points spanning ownership types: nonprofit (Cedars-Sinai),
// academic (UCSF), district (Kaweah), county (SF General), investor (Mad River).
const SUGGESTED_IDS = ["106190555", "106381154", "106540734", "106380939", "106121002"]

export default async function Home() {
  const [facilities, catalog, latestYear, manifests] = await Promise.all([
    getFacilityOptions(),
    getMetricCatalog(),
    getLatestYear(),
    Promise.all([getManifest("hafd-selected"), getManifest("hau")]),
  ])
  const byId = new Map(facilities.map((f) => [f.id, f]))
  const suggestions = SUGGESTED_IDS.map((id) => byId.get(id)).filter((f): f is FacilityOption => !!f)
  const years = [...new Set(manifests.flatMap((m) => m.years))].sort((a, b) => a - b)

  return <HomeFlow facilities={facilities} catalog={catalog} years={years} latestYear={latestYear} suggestions={suggestions} />
}
