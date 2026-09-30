import { NextResponse, type NextRequest } from "next/server"

import { parseDatasetSlug } from "@/lib/data/datasets"
import { getFacility, getFacilityFieldValues, getFacilityMetricValues } from "@/lib/data/store"
import { withViewerSandboxRoute } from "@/lib/server/sandbox"

// GET /api/facilities/106580996/fields?source=utilization -> every numeric field, by year, and (V7.5) the dictionary's
// measures by year as `metrics`.
// With the viewer's test hospitals, if any, and never publicly cached when one could be involved (lib/server/sandbox.ts).
export const GET = (request: NextRequest, ctx: RouteContext<"/api/facilities/[id]/fields">) => withViewerSandboxRoute(request, () => handle(request, ctx))

async function handle(request: NextRequest, ctx: RouteContext<"/api/facilities/[id]/fields">) {
  const { id } = await ctx.params
  const dataset = parseDatasetSlug(request.nextUrl.searchParams.get("source"))
  const [facility, fields, metrics] = await Promise.all([getFacility(id), getFacilityFieldValues(dataset, id), getFacilityMetricValues(dataset, id)])
  if (!facility) {
    return NextResponse.json({ error: `Unknown facility ${id}` }, { status: 404 })
  }
  return NextResponse.json(
    { facility, ...(fields ?? { values: {}, meta: {} }), metrics },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } }
  )
}
