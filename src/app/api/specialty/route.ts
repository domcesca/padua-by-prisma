import { NextResponse, type NextRequest } from "next/server"

import { parseFilters } from "@/lib/benchmark/filters"
import { parseView } from "@/lib/benchmark/view"
import { computeSpecialties } from "@/lib/specialty/compute"

// GET /api/specialty?facility=106190555&view=utilization&specialty=05&with=106381154,106380939
//   &county=...&ownership=...   (the same peer filters as /api/benchmark)
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const facilityId = params.get("facility")
  if (!facilityId) {
    return NextResponse.json({ error: "Missing ?facility= (HCAI facility number)" }, { status: 400 })
  }
  const view = parseView(params)
  const result = await computeSpecialties({
    facilityId,
    filters: parseFilters(params),
    compareIds: view.compare,
    mdc: view.specialty && view.specialty !== "all" ? view.specialty : null,
  })
  if (!result) {
    return NextResponse.json({ error: `Unknown facility ${facilityId}` }, { status: 404 })
  }
  // Data only changes when the ETL is re-run and redeployed.
  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  })
}
