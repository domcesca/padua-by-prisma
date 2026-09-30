import { NextResponse, type NextRequest } from "next/server"

import { MODULE_DATA } from "@/lib/propose/module-data"
import { withViewerSandboxRoute } from "@/lib/server/sandbox"

// GET /api/propose/reimbursement?facility=106190555
// The data a Propose module needs (reference tables, plus this hospital's context).
// With the viewer's test hospitals, if any, and never publicly cached when one could be involved (lib/server/sandbox.ts).
export const GET = (request: NextRequest, ctx: RouteContext<"/api/propose/[module]">) => withViewerSandboxRoute(request, () => handle(request, ctx))

async function handle(request: NextRequest, { params }: RouteContext<"/api/propose/[module]">) {
  const { module } = await params
  const load = MODULE_DATA[module]
  if (!load) return NextResponse.json({ error: `No data for module “${module}”.` }, { status: 404 })
  const facility = request.nextUrl.searchParams.get("facility")
  const data = await load(facility && /^\d{9}$/.test(facility) ? facility : null)
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  })
}
