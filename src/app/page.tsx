import { HomeFlow } from "@/components/home/home-flow"
import { getAllYears, getFacilityOptions, getLatestYear, getMetricCatalog } from "@/lib/data/store"

export default async function Home() {
  const [facilities, catalog, latestYear, years] = await Promise.all([
    getFacilityOptions(),
    getMetricCatalog(),
    getLatestYear(),
    getAllYears(),
  ])

  return <HomeFlow facilities={facilities} catalog={catalog} years={years} latestYear={latestYear} />
}
