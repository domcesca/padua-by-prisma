import { NextResponse } from "next/server"

import { getAnnualReport } from "@/lib/annual-report/load"

// GET /api/report/106301098 -> one hospital's annual report (V7.5.5): both HCAI reports' fields, measures and the
// annual report's own measures by year, its case mix index, and the CMS/CDPH quality addendum. Read-only, one
// hospital, no peer data. (/api/report without an id is Reports' chart builder, unrelated.)
export async function GET(_request: Request, ctx: RouteContext<"/api/report/[id]">) {
  const { id } = await ctx.params
  const report = await getAnnualReport(id)
  if (!report) return NextResponse.json({ error: `Unknown facility ${id}` }, { status: 404 })
  return NextResponse.json(report, {
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  })
}
