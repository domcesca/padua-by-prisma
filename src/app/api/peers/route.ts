import { NextResponse, type NextRequest } from "next/server"

import { parseFilters } from "@/lib/benchmark/filters"
import { resolvePeerGroup } from "@/lib/benchmark/peers"
import { getFacilities } from "@/lib/data/store"

// GET /api/peers?facility=106381154[&peers=statewide] -> who the peer group would be, without metrics.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const facilityId = params.get("facility")
  const facilities = await getFacilities()
  const facility = facilities.find((f) => f.id === facilityId)
  if (!facility) {
    return NextResponse.json({ error: `Unknown facility ${facilityId}` }, { status: 404 })
  }
  const group = resolvePeerGroup(facility, facilities, parseFilters(params))
  return NextResponse.json(
    {
      count: group.peers.length,
      description: group.description,
      note: group.note,
      mode: group.filters.mode,
      hasFinancial: facility.financialYears.length > 0,
      hasUtilization: facility.utilizationYears.length > 0,
    },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } }
  )
}
