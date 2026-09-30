// Checks the privilege-escalation guard (V7.6.5b): every way to change people, invites and facilities, against the
// rules in src/lib/org/permissions.ts. For each guarded function it tries every combination of actor, target and grant
// in a test organization (12 people: each role with each of four scopes, over three facilities) and requires the
// database's answer to match the rules exactly, including the reason for a refusal. Then it walks the invite lifecycle
// (expiry, reuse, revocation, replacement, a weakened inviter) and the last-owner rule, and confirms the app role can't
// write any of it directly.
//
// Needs a scratch database (CHECK_DATABASE_URL, owner role), migrated here; the test organizations are removed after.
// Run: CHECK_DATABASE_URL=postgres://… npm run check:permissions
import { randomUUID } from "node:crypto"

import {
  canAddFacility,
  canInvite,
  canRemove,
  canRevokeInvite,
  canSetAccess,
  canSetManager,
  ROLES,
  type Access,
  type Person,
  type Role,
  type ScopeKind,
} from "../src/lib/org/permissions.ts"
import { as, attempt, check, finish, scratchPool, type Q } from "./db-check-helpers.mts"

const pool = scratchPool()
const tag = randomUUID().slice(0, 8)
const orgs: string[] = []

const ORG = randomUUID()
const F = [randomUUID(), randomUUID(), randomUUID()].sort()
const SCOPES: { scope: ScopeKind; facilities: string[] }[] = [
  { scope: "organization", facilities: [] },
  { scope: "facilities", facilities: [F[0]] },
  { scope: "facilities", facilities: [F[0], F[1]].sort() },
  { scope: "facilities", facilities: [F[1]] },
]
const GRANTS: Access[] = ROLES.flatMap((role) => [...SCOPES, { scope: "facilities" as const, facilities: [] }].map((s) => ({ role, ...s })))
const scopeName = (s: { scope: ScopeKind; facilities: string[] }) => (s.scope === "organization" ? "org" : `{${s.facilities.map((f) => `F${F.indexOf(f) + 1}`).join(",")}}`)
const describe = (a: Access) => `${a.role}${scopeName(a)}`

const people: Person[] = ROLES.flatMap((role) => SCOPES.map((s) => ({ id: randomUUID(), role, ...s, managerId: null })))
const owners = people.filter((p) => p.role === "owner").length

const own = (sql: string, params?: unknown[]) => pool.query(sql, params)
const facArray = (a: Access) => (a.scope === "organization" ? null : a.facilities)

async function seedOrg() {
  orgs.push(ORG)
  await own("insert into organizations (id, name) values ($1, $2)", [ORG, `perm-${tag}`])
  for (const [i, f] of F.entries()) await own("insert into facilities (id, organization_id, name) values ($1, $2, $3)", [f, ORG, `F${i + 1}`])
  for (const p of people) {
    await own(`insert into admins (id, organization_id, email, name, password_hash, role, facility_scope) values ($1, $2, $3, $4, 'x', $5, $6)`, [
      p.id,
      ORG,
      `${p.id}@perm.test`,
      describe(p),
      p.role,
      p.scope,
    ])
    for (const f of p.facilities) await own("insert into admin_facilities (organization_id, admin_id, facility_id) values ($1, $2, $3)", [ORG, p.id, f])
  }
}

/** Runs `fn` for every actor, each in its own transaction as that actor; every attempt inside is undone. */
async function eachActor(fn: (actor: Person, q: Q) => Promise<void>) {
  for (const actor of people) await as(pool, ORG, actor.id, (q) => fn(actor, q))
}

type Mismatch = string
async function matrix(name: string, run: (report: (label: string, expected: string | null, got: string) => void) => Promise<void>) {
  const mismatches: Mismatch[] = []
  let n = 0
  let allowed = 0
  await run((label, expected, got) => {
    n++
    const want = expected ?? "ok"
    if (want === "ok") allowed++
    if (want !== got) mismatches.push(`${label}: expected ${want}, got ${got}`)
  })
  check(`${name}: database matches the rules in all ${n} combinations (${allowed} allowed, ${n - allowed} refused)`, mismatches.length === 0, mismatches.slice(0, 8).join("\n      "))
}

try {
  await seedOrg()

  await matrix("set role and scope", async (report) => {
    await eachActor(async (actor, q) => {
      for (const target of people)
        for (const g of GRANTS) {
          const got = await attempt(q, "select padua_set_access($1, $2, $3, $4)", [target.id, g.role, g.scope, facArray(g)])
          report(`${describe(actor)} sets ${describe(target)}${actor.id === target.id ? " (self)" : ""} to ${describe(g)}`, canSetAccess(actor, target, g, owners), got)
        }
    })
  })

  await matrix("invite", async (report) => {
    let i = 0
    await eachActor(async (actor, q) => {
      for (const g of GRANTS) {
        i++
        const got = await attempt(q, "select padua_create_invite($1, $2, $3, $4, $5, 7)", [`new-${i}-${tag}@perm.test`, g.role, g.scope, facArray(g), `tok-${i}-${tag}`])
        report(`${describe(actor)} invites ${describe(g)}`, canInvite(actor, g), got)
      }
    })
  })

  await matrix("revoke invite", async (report) => {
    const invites: (Access & { id: string })[] = []
    const inviter = people.find((p) => p.role === "owner" && p.scope === "organization")!
    for (const [i, g] of GRANTS.entries()) {
      if (g.scope === "facilities" && !g.facilities.length) continue
      const r = await own(
        `insert into invites (organization_id, email, role, facility_scope, token_hash, invited_by, expires_at) values ($1, $2, $3, $4, $5, $6, now() + interval '7 days') returning id`,
        [ORG, `pending-${i}-${tag}@perm.test`, g.role, g.scope, `pend-${i}-${tag}`, inviter.id]
      )
      for (const f of g.facilities) await own("insert into invite_facilities (organization_id, invite_id, facility_id) values ($1, $2, $3)", [ORG, r.rows[0].id, f])
      invites.push({ ...g, id: r.rows[0].id })
    }
    await eachActor(async (actor, q) => {
      for (const inv of invites) report(`${describe(actor)} revokes an invite for ${describe(inv)}`, canRevokeInvite(actor, inv), await attempt(q, "select padua_revoke_invite($1)", [inv.id]))
    })
    await own("delete from invites where organization_id = $1", [ORG])
  })

  await matrix("remove", async (report) => {
    await eachActor(async (actor, q) => {
      for (const target of people) report(`${describe(actor)} removes ${describe(target)}`, canRemove(actor, target, owners), await attempt(q, "select padua_remove_admin($1)", [target.id]))
    })
  })

  await matrix("add facility", async (report) => {
    let i = 0
    await eachActor(async (actor, q) => {
      i++
      report(`${describe(actor)} adds a facility`, canAddFacility(actor), await attempt(q, "select padua_add_facility('New', $1)", [`hcai-${i}-${tag}`]))
    })
  })

  // V7.6.5c: a test hospital is a facility, under the same rule.
  await matrix("add test hospital", async (report) => {
    let i = 0
    await eachActor(async (actor, q) => {
      i++
      const id = `999${String(100000 + ((i * 7919 + Number.parseInt(tag, 16)) % 900000)).padStart(6, "0")}`
      report(`${describe(actor)} adds a test hospital`, canAddFacility(actor), await attempt(q, "select padua_add_test_hospital('XYZ', $1, '106410817', 1)", [id]))
    })
  })
  {
    const owner = people.find((p) => p.role === "owner" && p.scope === "organization")!
    const id = `999${String(Number.parseInt(tag, 16) % 1_000_000).padStart(6, "0")}`
    await as(pool, ORG, owner.id, (q) => attempt(q, "select padua_add_test_hospital('XYZ', $1, '106410817', 1)", [id], true), true)
    check(
      "a test hospital's public id can't be reused (the app picks another)",
      (await as(pool, ORG, owner.id, (q) => attempt(q, "select padua_add_test_hospital('XYZ 2', $1, '106410817', 2)", [id]))) === "id-taken"
    )
    check("a test hospital needs a name", (await as(pool, ORG, owner.id, (q) => attempt(q, "select padua_add_test_hospital(' ', $1, '106410817', 3)", ["999000003"]))) === "bad-request")
  }

  // Set manager, over three reporting structures: none; one where people report across facilities (so a manager's
  // chain reaches outside some actors' scope); and a deterministic random forest.
  const byKey = (role: Role, s: number) => people.find((p) => p.role === role && p.scope === SCOPES[s].scope && p.facilities.join() === SCOPES[s].facilities.join())!
  let seed = 7
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed / 2 ** 31)
  const structures: [string, [Person, Person][]][] = [
    ["no reporting lines", []],
    [
      "reporting across facilities",
      [
        [byKey("admin", 1), byKey("owner", 0)],
        [byKey("member", 3), byKey("admin", 1)],
        [byKey("member", 1), byKey("member", 3)],
        [byKey("admin", 3), byKey("admin", 2)],
      ],
    ],
    [
      "random forest",
      (() => {
        const order = [...people].sort(() => rand() - 0.5)
        return order.slice(1).flatMap((p, i) => (rand() < 0.7 ? [[p, order[Math.floor(rand() * (i + 1))]] as [Person, Person]] : []))
      })(),
    ],
  ]
  for (const [label, links] of structures) {
    await own("update admins set manager_id = null where organization_id = $1", [ORG])
    for (const p of people) p.managerId = null
    for (const [report, manager] of links) {
      await own("update admins set manager_id = $1 where id = $2", [manager.id, report.id])
      report.managerId = manager.id
    }
    await matrix(`set manager (${label})`, async (report) => {
      await eachActor(async (actor, q) => {
        for (const target of people)
          for (const manager of [null, ...people]) {
            const got = await attempt(q, "select padua_set_manager($1, $2)", [target.id, manager?.id ?? null])
            report(`${describe(actor)} puts ${describe(target)} under ${manager ? describe(manager) : "no one"}`, canSetManager(actor, people, target.id, manager?.id ?? null), got)
          }
      })
    })
  }
  await own("update admins set manager_id = null where organization_id = $1", [ORG])
  for (const p of people) p.managerId = null

  // The escalation cases the rules exist for, spelled out
  const ownerOrg = byKey("owner", 0)
  const adminOrg = byKey("admin", 0)
  const adminF1 = byKey("admin", 1)
  const adminF2 = byKey("admin", 3)
  const memberF1 = byKey("member", 1)
  const memberF2 = byKey("member", 3)
  const cases: [string, Person, string, unknown[], string][] = [
    ["an admin can't make themselves an owner", adminOrg, "select padua_set_access($1, 'owner', 'organization', null)", [adminOrg.id], "role-too-high"],
    ["an admin seeing F1 can't give themselves the whole organization", adminF1, "select padua_set_access($1, 'admin', 'organization', null)", [adminF1.id], "scope-too-broad"],
    ["an admin seeing F1 can't add F2 to their own access", adminF1, "select padua_set_access($1, 'admin', 'facilities', $2)", [adminF1.id, [F[0], F[1]]], "scope-too-broad"],
    ["an admin can't invite an owner", adminOrg, "select padua_create_invite('e1@perm.test', 'owner', 'organization', null, 'e1', 7)", [], "role-too-high"],
    ["an admin seeing F1 can't invite someone who'd see the whole organization", adminF1, "select padua_create_invite('e2@perm.test', 'member', 'organization', null, 'e2', 7)", [], "scope-too-broad"],
    ["an admin seeing F1 can't invite someone to F2", adminF1, "select padua_create_invite('e3@perm.test', 'member', 'facilities', $1, 'e3', 7)", [[F[1]]], "scope-too-broad"],
    ["an admin can't promote a member above admin", adminOrg, "select padua_set_access($1, 'owner', 'organization', null)", [memberF1.id], "role-too-high"],
    ["an admin can't demote an owner", adminOrg, "select padua_set_access($1, 'member', 'organization', null)", [ownerOrg.id], "target-outranks"],
    ["an admin can't remove an owner", adminOrg, "select padua_remove_admin($1)", [ownerOrg.id], "target-outranks"],
    ["an admin seeing F1 can't change someone at F2", adminF1, "select padua_set_access($1, 'member', 'facilities', $2)", [memberF2.id, [F[0]]], "target-outside-scope"],
    ["a member can't change anyone, themselves included", memberF1, "select padua_set_access($1, 'member', 'facilities', $2)", [memberF1.id, [F[0]]], "not-a-manager"],
    ["a member can't invite", memberF1, "select padua_create_invite('e4@perm.test', 'member', 'facilities', $1, 'e4', 7)", [[F[0]]], "not-a-manager"],
    ["an admin seeing F2 can't make themselves manager of an F1 member", adminF2, "select padua_set_manager($1, $2)", [memberF1.id, adminF2.id], "target-outside-scope"],
    ["an owner can narrow their own access (allowed)", ownerOrg, "select padua_set_access($1, 'owner', 'facilities', $2)", [ownerOrg.id, [F[0]]], "ok"],
  ]
  for (const [name, actor, sql, params, want] of cases) {
    const got = await as(pool, ORG, actor.id, (q) => attempt(q, sql, params))
    check(name, got === want, `got ${got}`)
  }
  // Reports outside the actor's reach: adminF1 manages memberF1; an owner puts memberF2 under memberF1. adminF1 may not
  // now put memberF1 (and with them memberF2) under themselves.
  await own("update admins set manager_id = $1 where id = $2", [memberF1.id, memberF2.id])
  check(
    "an admin can't take over a reporting line that reaches outside their access",
    (await as(pool, ORG, adminF1.id, (q) => attempt(q, "select padua_set_manager($1, $2)", [memberF1.id, adminF1.id]))) === "reports-outside-scope"
  )
  await own("update admins set manager_id = null where id = $1", [memberF2.id])

  // No direct writes: the app role has no privilege to change any of it outside the functions
  const direct: [string, string, unknown[]][] = [
    ["raise a role", "update admins set role = 'owner' where id = $1", [memberF1.id]],
    ["widen a scope", "update admins set facility_scope = 'organization' where id = $1", [memberF1.id]],
    ["add a facility to someone's access", "insert into admin_facilities (organization_id, admin_id, facility_id) values ($1, $2, $3)", [ORG, memberF1.id, F[1]]],
    ["set a manager", "update admins set manager_id = $1 where id = $2", [ownerOrg.id, memberF1.id]],
    ["insert a person", "insert into admins (organization_id, email, name, password_hash, role, facility_scope) values ($1, 'z@perm.test', 'z', 'x', 'owner', 'organization')", [ORG]],
    ["delete a person", "delete from admins where id = $1", [memberF1.id]],
    ["write an invite", "insert into invites (organization_id, email, role, facility_scope, token_hash, expires_at) values ($1, 'z@perm.test', 'owner', 'organization', 'z', now())", [ORG]],
    ["read invite token hashes", "select token_hash from invites", []],
    ["add a facility", "insert into facilities (organization_id, name) values ($1, 'z')", [ORG]],
  ]
  for (const [name, sql, params] of direct) {
    const got = await as(pool, ORG, ownerOrg.id, (q) => attempt(q, sql, params))
    check(`the app role can't ${name} directly, even as an owner`, /permission denied/.test(got), got)
  }

  // Invite lifecycle
  const inviteAs = (actor: Person, email: string, role: Role, scope: ScopeKind, fac: string[] | null, token: string, days = 7) =>
    as(pool, ORG, actor.id, (q) => attempt(q, "select padua_create_invite($1, $2, $3, $4, $5, $6)", [email, role, scope, fac, token, days], true), true)
  const accept = (token: string, name = "New Person") =>
    as(pool, null, null, (q) => attempt(q, "select * from padua_accept_invite($1, $2, 'scrypt$x')", [token, name], true), true)
  const lookup = (token: string) => as(pool, null, null, async (q) => (await q("select * from padua_invite_lookup($1)", [token])).rows[0] ?? null)

  check("an admin seeing F1 invites a member to F1", (await inviteAs(adminF1, `life1-${tag}@perm.test`, "member", "facilities", [F[0]], `life1-${tag}`)) === "ok")
  const l1 = await lookup(`life1-${tag}`)
  check("the link shows the organization, inviter, role and facilities before accepting", l1?.status === "pending" && l1.role === "member" && l1.invited_by_name === describe(adminF1) && l1.facility_names.join() === "F1")
  check("an unknown link shows nothing", (await lookup(`nope-${tag}`)) === null)
  check("accepting the link works", (await accept(`life1-${tag}`)) === "ok")
  const joined = (await own("select role, facility_scope, padua_facilities_of(id) fac from admins where email = $1 and organization_id = $2", [`life1-${tag}@perm.test`, ORG])).rows[0]
  check("the new person has exactly the invited role and access", joined?.role === "member" && joined.facility_scope === "facilities" && joined.fac.join() === F[0])
  check("the link works only once", (await accept(`life1-${tag}`)) === "invite-accepted")
  check("the used link now shows as accepted", (await lookup(`life1-${tag}`))?.status === "accepted")
  check("an unknown link can't be accepted", (await accept(`nope-${tag}`)) === "invite-invalid")
  check("inviting someone already in the organization is refused", (await inviteAs(ownerOrg, `life1-${tag}@perm.test`, "member", "organization", null, `dup-${tag}`)) === "already-member")

  await inviteAs(ownerOrg, `life2-${tag}@perm.test`, "member", "organization", null, `life2-${tag}`)
  await as(pool, ORG, ownerOrg.id, async (q) => {
    const id = (await q("select id from invites where email = $1", [`life2-${tag}@perm.test`])).rows[0].id
    check("an owner revokes a pending invite", (await attempt(q, "select padua_revoke_invite($1)", [id], true)) === "ok")
    check("revoking it twice is refused", (await attempt(q, "select padua_revoke_invite($1)", [id])) === "invite-not-pending")
  }, true)
  check("a revoked link can't be accepted", (await accept(`life2-${tag}`)) === "invite-revoked")

  await inviteAs(ownerOrg, `life3-${tag}@perm.test`, "member", "organization", null, `life3-${tag}`)
  await own("update invites set expires_at = now() - interval '1 second' where token_hash = $1", [`life3-${tag}`])
  check("an expired link can't be accepted", (await accept(`life3-${tag}`)) === "invite-expired")
  check("an expired link shows as expired", (await lookup(`life3-${tag}`))?.status === "expired")
  check("invites last 1 to 30 days, nothing else", (await inviteAs(ownerOrg, `life3b-${tag}@perm.test`, "member", "organization", null, `life3b-${tag}`, 90)) === "bad-request")

  await inviteAs(ownerOrg, `life4-${tag}@perm.test`, "member", "organization", null, `life4a-${tag}`)
  await inviteAs(ownerOrg, `life4-${tag}@perm.test`, "admin", "organization", null, `life4b-${tag}`)
  check("inviting the same email again replaces the older link", (await accept(`life4a-${tag}`)) === "invite-revoked" && (await accept(`life4b-${tag}`)) === "ok")

  await inviteAs(ownerOrg, `life5-${tag}@perm.test`, "owner", "organization", null, `life5a-${tag}`)
  check("an admin can't replace an owner's invite with their own", (await inviteAs(adminOrg, `life5-${tag}@perm.test`, "member", "organization", null, `life5b-${tag}`)) === "target-outranks")
  check("the owner's invite still works", (await accept(`life5a-${tag}`)) === "ok")

  await inviteAs(adminOrg, `life6-${tag}@perm.test`, "admin", "organization", null, `life6-${tag}`)
  await as(pool, ORG, ownerOrg.id, (q) => attempt(q, "select padua_set_access($1, 'member', 'organization', null)", [adminOrg.id], true), true)
  check("an invite from someone since demoted can't be accepted", (await accept(`life6-${tag}`)) === "invite-inviter-changed")
  await as(pool, ORG, ownerOrg.id, (q) => attempt(q, "select padua_set_access($1, 'admin', 'organization', null)", [adminOrg.id], true), true)

  const OTHER = randomUUID()
  orgs.push(OTHER)
  await own("insert into organizations (id, name) values ($1, 'other')", [OTHER])
  await own(`insert into admins (organization_id, email, name, password_hash, role, facility_scope) values ($1, $2, 'o', 'x', 'owner', 'organization')`, [OTHER, `taken-${tag}@perm.test`])
  await inviteAs(ownerOrg, `taken-${tag}@perm.test`, "member", "organization", null, `life7-${tag}`)
  check("an email that already has an account elsewhere can't accept (one person, one organization)", (await accept(`life7-${tag}`)) === "email-taken")

  // Last owner
  const SOLO = randomUUID()
  orgs.push(SOLO)
  const soloOwner = randomUUID()
  const soloOwner2 = randomUUID()
  await own("insert into organizations (id, name) values ($1, 'solo')", [SOLO])
  await own(`insert into admins (id, organization_id, email, name, password_hash, role, facility_scope) values ($1, $2, $3, 'solo', 'x', 'owner', 'organization')`, [soloOwner, SOLO, `solo-${tag}@perm.test`])
  const solo = (sql: string, params: unknown[], who = soloOwner) => as(pool, SOLO, who, (q) => attempt(q, sql, params, true), true)
  check("the only owner can't step down", (await solo("select padua_set_access($1, 'admin', 'organization', null)", [soloOwner])) === "last-owner")
  check("the only owner can't remove themselves", (await solo("select padua_remove_admin($1)", [soloOwner])) === "self-remove")
  await own(`insert into admins (id, organization_id, email, name, password_hash, role, facility_scope) values ($1, $2, $3, 'solo2', 'x', 'owner', 'organization')`, [soloOwner2, SOLO, `solo2-${tag}@perm.test`])
  check("with a second owner, one can step down", (await solo("select padua_set_access($1, 'admin', 'organization', null)", [soloOwner])) === "ok")
  check("…and then the remaining owner can't", (await solo("select padua_set_access($1, 'member', 'organization', null)", [soloOwner2], soloOwner2)) === "last-owner")
  check(
    "the backstop holds even for a direct write by the database owner",
    await own("update admins set role = 'member' where id = $1", [soloOwner2]).then(
      () => false,
      (e) => /padua:last-owner/.test(e.message)
    )
  )
} finally {
  await pool.query("delete from organizations where id = any($1)", [orgs])
  await pool.end()
}
finish()
