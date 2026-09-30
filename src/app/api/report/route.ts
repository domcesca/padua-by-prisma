import { NextResponse, type NextRequest } from "next/server"

import { getMetricCatalog } from "@/lib/data/store"
import { runReport } from "@/lib/report/run"
import { parseSpec } from "@/lib/report/spec"
import { withViewerSandboxRoute } from "@/lib/server/sandbox"

// GET /api/report?facility=106381154&metrics=occupancy,edVisits&chart=line&group=year&compare=106380929
// Runs a ReportSpec (see src/lib/report/spec.ts) and returns chart-ready panels.
// With the viewer's test hospitals, if any, and never publicly cached when one could be involved (lib/server/sandbox.ts).
export const GET = (request: NextRequest) => withViewerSandboxRoute(request, () => handle(request))

async function handle(request: NextRequest) {
  const catalog = await getMetricCatalog()
  const spec = parseSpec(request.nextUrl.searchParams, new Set(catalog.map((m) => m.id)))
  const result = await runReport(spec)
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  })
}
