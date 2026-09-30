import "server-only"

import { randomInt } from "node:crypto"

import type { NextRequest } from "next/server"
import { cache } from "react"

import { makeSandbox, runWithoutSandbox, runWithSandbox, SANDBOX_ID, type Sandbox } from "@/lib/data/sandbox"
import {
  getFacilities,
  getFields,
  getInpatientCases,
  getLatestYear,
  getMetrics,
  getOutpatientServices,
  getPenaltyHospitals,
  getWageIndexHospitals,
  lastReportedYear,
} from "@/lib/data/store"
import { getSession } from "./auth/session"
import { withTenant } from "./db"

// The signed-in viewer's test hospitals (V7.6.5c; lib/data/sandbox.ts has what they are). They come from the database,
// under row-level security, for the viewer's own organization and within their facility scope: nobody else's session
// can name them. A request with none, or with no session, sees Padua exactly as before.

/** The viewer's test hospitals, or null. Once per request. */
export const getSandbox = cache(async (): Promise<Sandbox | null> => {
  const session = await getSession()
  if (!session) return null
  try {
    const rows = await withTenant(session, (tx) =>
      tx.query<{ public_id: string; name: string; source_hcai_id: string; seed: number }>(
        `select s.public_id, f.name, s.source_hcai_id, s.seed
         from sandbox_hospitals s join facilities f on f.id = s.facility_id
         where padua_in_scope(f.id)
         order by f.name`
      )
    )
    return makeSandbox(rows.map((r) => ({ id: r.public_id, name: r.name, sourceId: r.source_hcai_id, seed: r.seed })))
  } catch (e) {
    // A database without migration 0003 yet: no test hospitals, and everything else carries on.
    if ((e as { code?: string }).code === "42P01") return null
    throw e
  }
})

/** For a page: renders with the viewer's test hospitals layered in (none for everyone else). */
export async function withViewerSandbox<T>(render: () => Promise<T>): Promise<T> {
  return runWithSandbox(await getSandbox(), render)
}

/**
 * For an API route: answers with the viewer's test hospitals layered in, and keeps any answer that could involve one
 * out of shared caches. The routes are CDN-cached for a day, and the CDN doesn't key on cookies, so a response computed
 * for a viewer with a test hospital, or for an address naming one, must never be stored there: otherwise it could be
 * served to someone else, or a cached "not found" served to its owner.
 */
export async function withViewerSandboxRoute(request: NextRequest, handler: () => Promise<Response>): Promise<Response> {
  const sandbox = await getSandbox()
  const response = await runWithSandbox(sandbox, handler)
  if (sandbox || namesSandbox(request)) response.headers.set("Cache-Control", "private, no-store")
  return response
}

/**
 * Whether people can create test hospitals on this deployment (sign-up and the organization console). Off unless
 * PADUA_TEST_HOSPITALS=on, so real clients don't see the option; test hospitals already made keep working either way.
 */
export const testHospitalsEnabled = () => process.env.PADUA_TEST_HOSPITALS === "on"

/**
 * What a new test hospital is made from: a random seed, an unused-looking id in the 999 range, and a real hospital to
 * alter. The source is a mid-size general acute hospital still reporting, with data in every source Padua uses (quality,
 * infections, Medicare cases and payments, wage index), so every tool has something to show for the test hospital.
 */
export async function newTestHospital() {
  const seed = randomInt(1, 2 ** 31 - 1)
  const [facilities, fields, latestYear, quality, infections, cmi, cases, penalties, outpatient, wage] = await runWithoutSandbox(() =>
    Promise.all([
      getFacilities(),
      getFields("hafd-selected"),
      getLatestYear(),
      getMetrics("cms-care-compare"),
      getMetrics("cdph-hai"),
      getMetrics("case-mix-index"),
      getInpatientCases(),
      getPenaltyHospitals(),
      getOutpatientServices(),
      getWageIndexHospitals(),
    ])
  )
  // Mostly acute care: under a fifth of patient days in long-term care, in its latest financial year.
  const [ltc, total] = ["DAY_LTC", "DAY_TOT"].map((code) => fields.fields.indexOf(code))
  const mostlyAcute = (id: string) => {
    const byYear = fields.values[id] ?? {}
    const latest = Object.keys(byYear).sort().at(-1)
    const row = latest ? byYear[latest] : null
    return !!row && !!row[total] && (row[ltc] ?? 0) / row[total]! < 0.2
  }
  const candidates = facilities
    .filter(
      (f) =>
        f.hospitalType === "Comparable" &&
        f.typeOfCare === "General" &&
        !f.closure &&
        (f.licensedBeds ?? 0) >= 150 &&
        (f.licensedBeds ?? 0) <= 450 &&
        f.financialYears.length >= 4 &&
        lastReportedYear(f) >= latestYear - 1 &&
        mostlyAcute(f.id) &&
        [quality, infections, cmi, cases, penalties, outpatient, wage].every((source) => source[f.id])
    )
    .sort((a, b) => a.id.localeCompare(b.id))
  if (!candidates.length) throw new Error("No hospital suitable to base a test hospital on")
  return { seed, publicId: `999${String(randomInt(0, 1_000_000)).padStart(6, "0")}`, sourceId: candidates[seed % candidates.length].id }
}

const namesSandbox = (request: NextRequest) =>
  [...request.nextUrl.searchParams.values(), ...request.nextUrl.pathname.split("/")].some((v) => v.split(",").some((part) => SANDBOX_ID.test(part.trim())))
