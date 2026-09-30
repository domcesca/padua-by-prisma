import { NextResponse, type NextRequest } from "next/server"

import { parseFilters } from "@/lib/benchmark/filters"
import { computeFindings } from "@/lib/findings/compute"

// GET /api/findings?facility=106010967 (+ Benchmark's peer filters: &mode=statewide, &county=…, …)
//   The hospital's key findings: up to 5 primary and 5 secondary, each with its evidence and the math behind its score.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const facilityId = params.get("facility")
  if (!facilityId) {
    return NextResponse.json({ error: "Missing ?facility= (HCAI facility number)" }, { status: 400 })
  }
  // ?min= overrides the primary minimum score (the calibration run uses it); otherwise the reviewed default.
  const min = params.get("min")
  const result = await computeFindings({
    facilityId,
    filters: parseFilters(params),
    ...(min != null && Number.isFinite(Number(min)) ? { minPrimary: Number(min) } : {}),
  })
  if (!result) {
    return NextResponse.json({ error: `Unknown facility ${facilityId}` }, { status: 404 })
  }
  // Data only changes when the ETL is re-run and redeployed.
  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  })
}
