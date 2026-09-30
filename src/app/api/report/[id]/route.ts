import { NextResponse, type NextRequest } from "next/server"

import { getAnnualReport } from "@/lib/annual-report/load"
import { withViewerSandboxRoute } from "@/lib/server/sandbox"

// GET /api/report/106301098 -> one hospital's annual report (V7.5.5): both HCAI reports' fields, measures and the
// annual report's own measures by year, its case mix index, and the CMS/CDPH quality addendum. Read-only, one
// hospital, no peer data. (/api/report without an id is Reports' chart builder, unrelated.)
// With the viewer's test hospitals, if any, and never publicly cached when one could be involved (lib/server/sandbox.ts).
export const GET = (request: NextRequest, ctx: RouteContext<"/api/report/[id]">) => withViewerSandboxRoute(request, () => handle(ctx))

async function handle(ctx: RouteContext<"/api/report/[id]">) {
  const { id } = await ctx.params
  const report = await getAnnualReport(id)
  if (!report) return NextResponse.json({ error: `Unknown facility ${id}` }, { status: 404 })
  return NextResponse.json(report, {
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  })
}
