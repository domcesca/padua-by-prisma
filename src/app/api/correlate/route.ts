import { NextResponse, type NextRequest } from "next/server"

import { runCorrelate } from "@/lib/correlate/run"
import { parseCorrelateSpec } from "@/lib/correlate/spec"
import { getTrendMetrics } from "@/lib/data/store"

// GET /api/correlate?facility=106010739&x=caseMixIndex&y=expensePerAdjDischarge&peers=statewide&year=2023
// Pairs two metrics across the hospital's peer group and returns the points, Pearson r, and trend line.
export async function GET(request: NextRequest) {
  const metrics = await getTrendMetrics()
  const spec = parseCorrelateSpec(request.nextUrl.searchParams, new Set(metrics.map((m) => m.id)))
  const result = await runCorrelate(spec)
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  })
}
