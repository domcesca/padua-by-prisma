import "server-only"

import { createHash, randomBytes, randomUUID } from "node:crypto"

import { anonymous, withTenant, type TenantContext } from "../db"
import { decoyHash, hashPassword, verifyPassword } from "./password"

// Accounts (V7.6.5a): sign-up, sign-in, sessions, and reading the signed-in admin's own account. Everything that touches
// an organization's rows goes through withTenant with a context built here from a verified session; see db.ts.

export type Role = "owner" | "admin" | "member"
export type FacilityScope = "organization" | "facilities"

export const SESSION_DAYS = 14
/** Failed sign-ins allowed per email within the window before sign-in is refused for that email. */
const MAX_FAILURES = 10
const FAILURE_WINDOW_MINUTES = 15

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")
export const normalizeEmail = (email: string) => email.trim().toLowerCase()

/**
 * Creates an organization with one facility and its first admin, the Owner, whose scope is the whole organization.
 * The organization and admin ids are made here and set as the transaction's tenant context; padua_sign_up (the only way
 * the app can create people, V7.6.5b) creates exactly that organization and admin.
 */
export async function createAccount(input: {
  name: string
  email: string
  password: string
  organizationName: string
  facility: { name: string; hcaiFacilityId: string | null }
}): Promise<{ ok: true; ctx: TenantContext } | { ok: false; reason: "email-taken" }> {
  const ctx = { organizationId: randomUUID(), adminId: randomUUID() }
  const passwordHash = await hashPassword(input.password)
  try {
    await withTenant(ctx, (tx) =>
      tx.query("select padua_sign_up($1, $2, $3, $4, $5, $6)", [
        input.organizationName.trim(),
        input.facility.name,
        input.facility.hcaiFacilityId,
        normalizeEmail(input.email),
        input.name.trim(),
        passwordHash,
      ])
    )
  } catch (e) {
    if (refusalOf(e) === "email-taken") return { ok: false, reason: "email-taken" }
    throw e
  }
  return { ok: true, ctx }
}

/** The rule a guarded database function refused on ("padua:<code>", db/migrations/0002_people.sql), or null. */
export function refusalOf(e: unknown): string | null {
  const m = /^padua:([a-z-]+)$/.exec((e as { message?: string })?.message ?? "")
  return m ? m[1] : null
}

/** Checks an email and password. Unknown email and wrong password are indistinguishable, in result and in time. */
export async function verifyLogin(email: string, password: string): Promise<{ ok: true; ctx: TenantContext } | { ok: false; reason: "invalid" | "throttled" }> {
  const emailHash = sha256(normalizeEmail(email))
  return anonymous(async (tx) => {
    const [{ n }] = await tx.query<{ n: number }>(
      `select count(*)::int as n from login_failures where email_hash = $1 and failed_at > now() - make_interval(mins => $2)`,
      [emailHash, FAILURE_WINDOW_MINUTES]
    )
    if (n >= MAX_FAILURES) return { ok: false, reason: "throttled" } as const
    const [found] = await tx.query<{ admin_id: string; organization_id: string; password_hash: string }>("select * from padua_login_lookup($1)", [email])
    const valid = await verifyPassword(password, found?.password_hash ?? (await decoyHash()))
    if (!found || !valid) {
      await tx.query("insert into login_failures (email_hash) values ($1)", [emailHash])
      return { ok: false, reason: "invalid" } as const
    }
    await tx.query("delete from login_failures where email_hash = $1", [emailHash])
    return { ok: true, ctx: { organizationId: found.organization_id, adminId: found.admin_id } } as const
  })
}

/** Starts a session and returns its token, for the cookie. Only the token's hash is stored. */
export async function createSession(ctx: TenantContext) {
  const token = randomBytes(32).toString("base64url")
  await withTenant(ctx, (tx) =>
    tx.query(`insert into sessions (token_hash, organization_id, admin_id, expires_at) values ($1, $2, $3, now() + make_interval(days => $4))`, [
      sha256(token),
      ctx.organizationId,
      ctx.adminId,
      SESSION_DAYS,
    ])
  )
  return token
}

/** The signed-in admin for a session token, or null if it's unknown or expired. */
export async function resolveSession(token: string): Promise<TenantContext | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  const [row] = await anonymous((tx) => tx.query<{ admin_id: string; organization_id: string }>("select * from padua_session_lookup($1)", [sha256(token)]))
  return row ? { organizationId: row.organization_id, adminId: row.admin_id } : null
}

export async function deleteSession(ctx: TenantContext, token: string) {
  await withTenant(ctx, (tx) => tx.query("delete from sessions where token_hash = $1", [sha256(token)]))
}

export type Account = {
  admin: { id: string; name: string; email: string; role: Role; facilityScope: FacilityScope; createdAt: string }
  organization: { id: string; name: string; createdAt: string }
  /** Every facility in the organization. */
  facilities: { id: string; name: string; hcaiFacilityId: string | null }[]
  /** The facilities this admin's scope covers, by padua_in_scope: the rule future facility-level policies will use. */
  inScope: string[]
  /** Who they report to (V7.6.5b), and how many report to them directly. */
  manager: { id: string; name: string } | null
  directReports: number
}

/** The signed-in admin's own account: their organization, its facilities, their role and scope. */
export function getAccount(ctx: TenantContext): Promise<Account | null> {
  return withTenant(ctx, async (tx) => {
    const [admin] = await tx.query<{ id: string; name: string; email: string; role: Role; facility_scope: FacilityScope; created_at: Date }>(
      "select id, name, email, role, facility_scope, created_at from admins where id = $1",
      [ctx.adminId]
    )
    const [org] = await tx.query<{ id: string; name: string; created_at: Date }>("select id, name, created_at from organizations")
    if (!admin || !org) return null
    const facilities = await tx.query<{ id: string; name: string; hcai_facility_id: string | null }>(
      "select id, name, hcai_facility_id from facilities order by name"
    )
    const [manager] = await tx.query<{ id: string; name: string }>("select m.id, m.name from admins a join admins m on m.id = a.manager_id where a.id = $1", [ctx.adminId])
    const [{ n }] = await tx.query<{ n: number }>("select count(*)::int as n from admins where manager_id = $1", [ctx.adminId])
    return {
      manager: manager ?? null,
      directReports: n,
      admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role, facilityScope: admin.facility_scope, createdAt: admin.created_at.toISOString() },
      organization: { id: org.id, name: org.name, createdAt: org.created_at.toISOString() },
      facilities: facilities.map((f) => ({ id: f.id, name: f.name, hcaiFacilityId: f.hcai_facility_id })),
      inScope: (await tx.query<{ id: string }>("select id from facilities where padua_in_scope(id)")).map((r) => r.id),
    }
  })
}
