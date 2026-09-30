import "server-only"

import { randomBytes } from "node:crypto"

import type { Person, Role, ScopeKind } from "@/lib/org/permissions"
import { anonymous, withTenant, type TenantContext } from "./db"
import { hashPassword } from "./auth/password"
import { refusalOf, sha256 } from "./auth/accounts"
import { newTestHospital } from "./sandbox"

// The organization console's data (V7.6.5b): reading an organization's people, facilities and invites, and changing
// them. Every change is a call to one of the guarded database functions (db/migrations/0002_people.sql), which decide
// whether the signed-in admin may make it; nothing here grants anything on its own. A refusal comes back as its rule's
// code (src/lib/org/permissions.ts has the wording).

export const INVITE_DAYS = 7

export type OrgPerson = Person & { name: string; email: string; createdAt: string }
export type OrgFacility = {
  id: string
  name: string
  hcaiFacilityId: string | null
  /** A test hospital's id in the app (V7.6.5c: made-up data, private to this organization), or null for a real one. */
  testId: string | null
}
export type PendingInvite = {
  id: string
  email: string
  role: Role
  scope: ScopeKind
  facilities: string[]
  invitedBy: string | null
  createdAt: string
  expiresAt: string
  expired: boolean
}
export type Organization = {
  id: string
  name: string
  actorId: string
  facilities: OrgFacility[]
  people: OrgPerson[]
  invites: PendingInvite[]
}

export type Result<T = null> = { ok: true; value: T } | { ok: false; refusal: string }

/** Runs a guarded call; a refusal becomes a result, anything else is a real error. */
async function guarded<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await fn() }
  } catch (e) {
    const refusal = refusalOf(e)
    if (refusal) return { ok: false, refusal }
    throw e
  }
}

export function getOrganization(ctx: TenantContext): Promise<Organization | null> {
  return withTenant(ctx, async (tx) => {
    const [org] = await tx.query<{ id: string; name: string }>("select id, name from organizations")
    if (!org) return null
    const facilities = await tx.query<{ id: string; name: string; hcai_facility_id: string | null; test_id: string | null }>(
      "select f.id, f.name, f.hcai_facility_id, s.public_id as test_id from facilities f left join sandbox_hospitals s on s.facility_id = f.id order by f.name"
    )
    const people = await tx.query<{
      id: string
      name: string
      email: string
      role: Role
      facility_scope: ScopeKind
      manager_id: string | null
      created_at: Date
      fac: string[] | null
    }>(
      `select a.id, a.name, a.email, a.role, a.facility_scope, a.manager_id, a.created_at,
              (select array_agg(facility_id order by facility_id) from admin_facilities f where f.admin_id = a.id) as fac
       from admins a order by a.name`
    )
    const invites = await tx.query<{
      id: string
      email: string
      role: Role
      facility_scope: ScopeKind
      created_at: Date
      expires_at: Date
      invited_by_name: string | null
      fac: string[] | null
    }>(
      `select i.id, i.email, i.role, i.facility_scope, i.created_at, i.expires_at, a.name as invited_by_name,
              (select array_agg(facility_id order by facility_id) from invite_facilities f where f.invite_id = i.id) as fac
       from invites i left join admins a on a.id = i.invited_by
       where i.accepted_at is null and i.revoked_at is null
       order by i.created_at desc`
    )
    const now = Date.now()
    return {
      id: org.id,
      name: org.name,
      actorId: ctx.adminId!,
      facilities: facilities.map((f) => ({ id: f.id, name: f.name, hcaiFacilityId: f.hcai_facility_id, testId: f.test_id })),
      people: people.map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email,
        role: p.role,
        scope: p.facility_scope,
        facilities: p.fac ?? [],
        managerId: p.manager_id,
        createdAt: p.created_at.toISOString(),
      })),
      invites: invites.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        scope: i.facility_scope,
        facilities: i.fac ?? [],
        invitedBy: i.invited_by_name,
        createdAt: i.created_at.toISOString(),
        expiresAt: i.expires_at.toISOString(),
        expired: i.expires_at.getTime() <= now,
      })),
    }
  })
}

type Grant = { role: Role; scope: ScopeKind; facilities: string[] }
const facilityArg = (g: Grant) => (g.scope === "organization" ? null : g.facilities)

/** Creates an invite and returns the one-time token for its link. Only the token's hash is stored. */
export function createInvite(ctx: TenantContext, email: string, grant: Grant): Promise<Result<string>> {
  const token = randomBytes(32).toString("base64url")
  return guarded(async () => {
    await withTenant(ctx, (tx) =>
      tx.query("select padua_create_invite($1, $2, $3, $4, $5, $6)", [email, grant.role, grant.scope, facilityArg(grant), sha256(token), INVITE_DAYS])
    )
    return token
  })
}

export const revokeInvite = (ctx: TenantContext, inviteId: string) =>
  guarded(async () => void (await withTenant(ctx, (tx) => tx.query("select padua_revoke_invite($1)", [inviteId]))))

/**
 * Changes someone's role and access and/or who they report to, in one transaction: both apply or neither. Access goes
 * first, so a new manager is checked against the person's new access.
 */
export const updatePerson = (ctx: TenantContext, adminId: string, change: { grant?: Grant; managerId?: string | null }) =>
  guarded(async () => {
    await withTenant(ctx, async (tx) => {
      if (change.grant) await tx.query("select padua_set_access($1, $2, $3, $4)", [adminId, change.grant.role, change.grant.scope, facilityArg(change.grant)])
      if (change.managerId !== undefined) await tx.query("select padua_set_manager($1, $2)", [adminId, change.managerId])
    })
  })

export const removeAdmin = (ctx: TenantContext, adminId: string) =>
  guarded(async () => void (await withTenant(ctx, (tx) => tx.query("select padua_remove_admin($1)", [adminId]))))

export const addFacility = (ctx: TenantContext, name: string, hcaiFacilityId: string | null) =>
  guarded(async () => void (await withTenant(ctx, (tx) => tx.query("select padua_add_facility($1, $2)", [name, hcaiFacilityId]))))

/** Adds a test hospital (V7.6.5c): made-up data from an altered real hospital, private to this organization. */
export const addTestHospital = (ctx: TenantContext, name: string) =>
  guarded(async () => {
    for (let attempt = 0; ; attempt++) {
      const t = await newTestHospital()
      try {
        await withTenant(ctx, (tx) => tx.query("select padua_add_test_hospital($1, $2, $3, $4)", [name, t.publicId, t.sourceId, t.seed]))
        return t.publicId
      } catch (e) {
        if (refusalOf(e) === "id-taken" && attempt < 5) continue
        throw e
      }
    }
  })

export type InviteDetails = {
  organizationName: string
  invitedBy: string | null
  email: string
  role: Role
  scope: ScopeKind
  facilityNames: string[]
  status: "pending" | "accepted" | "revoked" | "expired"
  expiresAt: string
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/

/** What an invite link shows. The token is the only authority: no session involved. */
export async function lookupInvite(token: string): Promise<InviteDetails | null> {
  if (!TOKEN.test(token)) return null
  const [row] = await anonymous((tx) =>
    tx.query<{
      organization_name: string
      invited_by_name: string | null
      email: string
      role: Role
      facility_scope: ScopeKind
      facility_names: string[]
      status: InviteDetails["status"]
      expires_at: Date
    }>("select * from padua_invite_lookup($1)", [sha256(token)])
  )
  if (!row) return null
  return {
    organizationName: row.organization_name,
    invitedBy: row.invited_by_name,
    email: row.email,
    role: row.role,
    scope: row.facility_scope,
    facilityNames: row.facility_names,
    status: row.status,
    expiresAt: row.expires_at.toISOString(),
  }
}

/** Accepts an invite: creates the admin as invited and returns their tenant context, to start their session. */
export async function acceptInvite(token: string, name: string, password: string): Promise<Result<TenantContext>> {
  if (!TOKEN.test(token)) return { ok: false, refusal: "invite-invalid" }
  const passwordHash = await hashPassword(password)
  return guarded(async () => {
    const [row] = await anonymous((tx) =>
      tx.query<{ admin_id: string; organization_id: string }>("select * from padua_accept_invite($1, $2, $3)", [sha256(token), name, passwordHash])
    )
    return { organizationId: row.organization_id, adminId: row.admin_id }
  })
}
