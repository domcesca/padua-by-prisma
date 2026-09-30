"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

import { getFacility } from "@/lib/data/store"
import { refusalText, type Role, type ScopeKind } from "@/lib/org/permissions"
import { normalizeEmail } from "@/lib/server/auth/accounts"
import { getSession } from "@/lib/server/auth/session"
import { addFacility, addTestHospital, createInvite, removeAdmin, revokeInvite, updatePerson, type Result } from "@/lib/server/org"
import { testHospitalsEnabled } from "@/lib/server/sandbox"

// The organization console's changes (V7.6.5b). Each reads the session, passes the request to a guarded database
// function, and reports back in plain words. The console only offers what the rules allow, but nothing here relies on
// that: the database decides every change.

export type ActionState = { ok?: boolean; message?: string; link?: string; email?: string; field?: string } | null

const str = (fd: FormData, key: string) => {
  const v = fd.get(key)
  return typeof v === "string" ? v : ""
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const ROLES = new Set<string>(["owner", "admin", "member"])
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The role and facility access from a form: role, scope ("organization" | "facilities") and facility (repeated). */
function grantFrom(fd: FormData): { role: Role; scope: ScopeKind; facilities: string[] } | null {
  const role = str(fd, "role")
  const scope = str(fd, "scope")
  const facilities = fd.getAll("facility").filter((f): f is string => typeof f === "string" && UUID.test(f))
  if (!ROLES.has(role) || (scope !== "organization" && scope !== "facilities")) return null
  return { role: role as Role, scope, facilities: scope === "organization" ? [] : facilities }
}

async function session() {
  const s = await getSession()
  if (!s) throw new Error("Not signed in")
  return s
}

function done(result: Result<unknown>, success: string): ActionState {
  if (!result.ok) return { ok: false, message: refusalText(result.refusal) }
  revalidatePath("/organization")
  return { ok: true, message: success }
}

export async function inviteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = normalizeEmail(str(fd, "email"))
  if (!EMAIL.test(email) || email.length > 320) return { ok: false, field: "email", message: "Enter their email address, like name@hospital.org." }
  const grant = grantFrom(fd)
  if (!grant) return { ok: false, message: refusalText("bad-request") }
  if (grant.scope === "facilities" && !grant.facilities.length) return { ok: false, field: "facility", message: refusalText("no-facilities") }
  const result = await createInvite(await session(), email, grant)
  if (!result.ok) return { ok: false, message: refusalText(result.refusal) }
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host")
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https")
  revalidatePath("/organization")
  return { ok: true, email, link: `${proto}://${host}/invite/${result.value}` }
}

export async function revokeInviteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "id")
  if (!UUID.test(id)) return { ok: false, message: refusalText("bad-request") }
  return done(await revokeInvite(await session(), id), "Invite withdrawn. The link no longer works.")
}

export async function updatePersonAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "id")
  if (!UUID.test(id)) return { ok: false, message: refusalText("bad-request") }
  const grant = fd.get("accessChanged") === "1" ? grantFrom(fd) : undefined
  if (grant === null) return { ok: false, message: refusalText("bad-request") }
  if (grant?.scope === "facilities" && !grant.facilities.length) return { ok: false, field: "facility", message: refusalText("no-facilities") }
  const manager = fd.get("managerChanged") === "1" ? str(fd, "manager") : undefined
  if (manager && !UUID.test(manager)) return { ok: false, message: refusalText("bad-request") }
  if (grant === undefined && manager === undefined) return { ok: true, message: "Nothing to change." }
  const result = await updatePerson(await session(), id, { grant, managerId: manager === undefined ? undefined : manager || null })
  return done(result, "Saved.")
}

export async function removePersonAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "id")
  if (!UUID.test(id)) return { ok: false, message: refusalText("bad-request") }
  return done(await removeAdmin(await session(), id), "Removed. They're signed out and can no longer see your organization.")
}

export async function addFacilityAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const hcaiId = str(fd, "hcai")
  const facility = hcaiId ? await getFacility(hcaiId) : null
  if (!facility) return { ok: false, field: "hcai", message: "Choose the hospital to add." }
  return done(await addFacility(await session(), facility.name, facility.id), `${facility.name} added.`)
}

/** A test hospital (V7.6.5c): made-up data, private to the organization. Only where the deployment allows them. */
export async function addTestHospitalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  if (!testHospitalsEnabled()) return { ok: false, message: "Test hospitals aren't turned on for this deployment." }
  const name = str(fd, "name").trim()
  if (!name || name.length > 200) return { ok: false, field: "name", message: "Name the test hospital (up to 200 characters)." }
  return done(await addTestHospital(await session(), name), `${name} added as a test hospital. Find it in any hospital picker.`)
}
