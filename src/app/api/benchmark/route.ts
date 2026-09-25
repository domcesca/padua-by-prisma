import { NextResponse, type NextRequest } from "next/server"

import { computeBenchmark } from "@/lib/benchmark/compute"
import { parseFilters } from "@/lib/benchmark/filters"

// GET /api/benchmark?facility=106580996&county=Yuba,Sutter&ownership=nonprofit&bedsMin=100&bedsMax=199&teaching=any&all=1
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const facilityId = params.get("facility")
  if (!facilityId) {
    return NextResponse.json({ error: "Missing ?facility= (HCAI facility number)" }, { status: 400 })
  }
  const result = await computeBenchmark(facilityId, parseFilters(params))
  if (!result) {
    return NextResponse.json({ error: `Unknown facility ${facilityId}` }, { status: 404 })
  }
  // Data only changes when the ETL is re-run and redeployed.
  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  })
}
