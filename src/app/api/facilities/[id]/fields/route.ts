import { NextResponse, type NextRequest } from "next/server"

import { getFacility, getFacilityFieldValues } from "@/lib/data/hafd"

// GET /api/facilities/106580996/fields -> every numeric field, by year.
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/facilities/[id]/fields">) {
  const { id } = await ctx.params
  const [facility, fields] = await Promise.all([getFacility(id), getFacilityFieldValues(id)])
  if (!facility || !fields) {
    return NextResponse.json({ error: `Unknown facility ${id}` }, { status: 404 })
  }
  return NextResponse.json(
    { facility, ...fields },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } }
  )
}
