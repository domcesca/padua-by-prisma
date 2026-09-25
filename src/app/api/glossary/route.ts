import { NextResponse } from "next/server"

import { getGlossary } from "@/lib/glossary"

// GET /api/glossary -> every metric and field definition, for the help panel's search.
export async function GET() {
  return NextResponse.json(await getGlossary(), {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  })
}
