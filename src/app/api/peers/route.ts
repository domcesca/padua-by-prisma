import { NextResponse, type NextRequest } from "next/server"

import { parseFilters } from "@/lib/benchmark/filters"
import { resolvePeerGroup } from "@/lib/benchmark/peers"
import { getFacilities, getFacility, getFacilityUnits } from "@/lib/data/store"
import { withViewerSandboxRoute } from "@/lib/server/sandbox"

// GET /api/peers?facility=106381154[&peers=statewide] -> who the peer group would be, without metrics,
// plus the bed classifications the hospital has (Home's "View by unit" step).
// With the viewer's test hospitals, if any, and never publicly cached when one could be involved (lib/server/sandbox.ts).
export const GET = (request: NextRequest) => withViewerSandboxRoute(request, () => handle(request))

async function handle(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const facilityId = params.get("facility")
  // The subject may be the viewer's own test hospital; peers are always real hospitals.
  const facilities = await getFacilities()
  const facility = facilityId ? await getFacility(facilityId) : null
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
      units: await getFacilityUnits(facility.id),
    },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } }
  )
}
