import { NextResponse, type NextRequest } from "next/server"

import { computeBenchmark } from "@/lib/benchmark/compute"
import { parseFilters } from "@/lib/benchmark/filters"
import { metricsFor, parseView } from "@/lib/benchmark/view"
import { withViewerSandboxRoute } from "@/lib/server/sandbox"

// GET /api/benchmark?facility=106580996&view=utilization&metrics=occupancy,edVisits
//   &payer=medicare&unit=icu (or &line=criticalCare, &line=all)&county=Yuba,Sutter&ownership=nonprofit&bedsMin=100&bedsMax=299&teaching=any&all=1
// With the viewer's test hospitals, if any, and never publicly cached when one could be involved (lib/server/sandbox.ts).
export const GET = (request: NextRequest) => withViewerSandboxRoute(request, () => handle(request))

async function handle(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const facilityId = params.get("facility")
  if (!facilityId) {
    return NextResponse.json({ error: "Missing ?facility= (HCAI facility number)" }, { status: 400 })
  }
  const view = parseView(params)
  const result = await computeBenchmark({
    facilityId,
    filters: parseFilters(params),
    category: view.category,
    metricIds: metricsFor(view),
    since: view.since,
    payer: view.payer,
    unit: view.unit,
    line: view.line,
  })
  if (!result) {
    return NextResponse.json({ error: `Unknown facility ${facilityId}` }, { status: 404 })
  }
  // Data only changes when the ETL is re-run and redeployed.
  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  })
}
