import { NextResponse, type NextRequest } from "next/server"

import { parseDatasetSlug } from "@/lib/data/datasets"
import { getFacility, getFacilityFieldValues } from "@/lib/data/store"

// GET /api/facilities/106580996/fields?source=utilization -> every numeric field, by year.
export async function GET(request: NextRequest, ctx: RouteContext<"/api/facilities/[id]/fields">) {
  const { id } = await ctx.params
  const dataset = parseDatasetSlug(request.nextUrl.searchParams.get("source"))
  const [facility, fields] = await Promise.all([getFacility(id), getFacilityFieldValues(dataset, id)])
  if (!facility) {
    return NextResponse.json({ error: `Unknown facility ${id}` }, { status: 404 })
  }
  return NextResponse.json(
    { facility, ...(fields ?? { values: {}, meta: {} }) },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } }
  )
}
