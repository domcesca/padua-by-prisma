import { NextResponse, type NextRequest } from "next/server"

import { MODULE_DATA } from "@/lib/propose/module-data"

// GET /api/propose/reimbursement?facility=106190555
// The data a Propose module needs (reference tables, plus this hospital's context).
export async function GET(request: NextRequest, { params }: RouteContext<"/api/propose/[module]">) {
  const { module } = await params
  const load = MODULE_DATA[module]
  if (!load) return NextResponse.json({ error: `No data for module “${module}”.` }, { status: 404 })
  const facility = request.nextUrl.searchParams.get("facility")
  const data = await load(facility && /^\d{9}$/.test(facility) ? facility : null)
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  })
}
