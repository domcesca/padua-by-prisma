import { NextResponse, type NextRequest } from "next/server"

import { getMetricCatalog } from "@/lib/data/store"
import { runReport } from "@/lib/report/run"
import { parseSpec } from "@/lib/report/spec"

// GET /api/report?facility=106381154&metrics=occupancy,edVisits&chart=line&group=year&compare=106380929
// Runs a ReportSpec (see src/lib/report/spec.ts) and returns chart-ready panels.
export async function GET(request: NextRequest) {
  const catalog = await getMetricCatalog()
  const spec = parseSpec(request.nextUrl.searchParams, new Set(catalog.map((m) => m.id)))
  const result = await runReport(spec)
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  })
}
