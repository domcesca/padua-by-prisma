// Checks the organization boundary in the database itself (V7.6.5a): with two organizations in place, acting as one
// must never read, change or point at the other's rows, whatever the query asks for. Queries run the way the app runs
// them (src/lib/server/db.ts): a transaction that drops to padua_app and sets padua.organization_id. The point is that
// isolation holds even for a query with no organization filter at all, so most checks deliberately leave it out.
//
// Needs a scratch database it may write to: CHECK_DATABASE_URL, connecting as the database owner. It migrates it,
// adds two test organizations, and removes them (and its one test table) at the end. Optionally CHECK_APP_DATABASE_URL:
// a second, non-owner login that is a member of padua_app (the recommended production setup), checked the same way.
// Run: CHECK_DATABASE_URL=postgres://… npm run check:isolation
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { join } from "node:path"

import pg from "pg"

const ownerUrl = process.env.CHECK_DATABASE_URL
if (!ownerUrl) {
  console.error("Set CHECK_DATABASE_URL to a scratch database (owner role). It is migrated and written to.")
  process.exit(1)
}
execFileSync(process.execPath, ["--no-warnings", join(import.meta.dirname, "db-migrate.mts")], { env: { ...process.env, DATABASE_URL: ownerUrl }, stdio: "inherit" })

let failures = 0
let passes = 0
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passes++
  else failures++
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail && !ok ? `: ${detail}` : ""}`)
}

type Q = (sql: string, params?: unknown[]) => Promise<pg.QueryResult>
/** One transaction as padua_app, as the app does it; rolled back unless `commit`. */
async function as(pool: pg.Pool, org: string | null, admin: string | null, fn: (q: Q) => Promise<void>, commit = false) {
  const c = await pool.connect()
  try {
    await c.query("begin")
    await c.query("set local role padua_app")
    if (org) await c.query("select set_config('padua.organization_id', $1, true)", [org])
    if (admin) await c.query("select set_config('padua.admin_id', $1, true)", [admin])
    await fn((sql, params) => c.query(sql, params))
    await c.query(commit ? "commit" : "rollback")
  } catch (e) {
    await c.query("rollback").catch(() => {})
    throw e
  } finally {
    c.release()
  }
}
/** Did the statement fail? (Each attempt in its own savepoint, so the transaction carries on.) */
async function rejects(q: Q, sql: string, params?: unknown[]) {
  await q("savepoint attempt")
  try {
    await q(sql, params)
    await q("release savepoint attempt")
    return null
  } catch (e) {
    await q("rollback to savepoint attempt")
    return (e as Error).message
  }
}

const owner = new pg.Pool({ connectionString: ownerUrl, max: 3 })
const tag = randomUUID().slice(0, 8)
// Two organizations: A with two facilities, an owner and a member scoped to one facility; B with one facility and owner.
const A = { org: randomUUID(), f1: randomUUID(), f2: randomUUID(), owner: randomUUID(), member: randomUUID() }
const B = { org: randomUUID(), f1: randomUUID(), owner: randomUUID() }
const future = new Date(Date.now() + 86_400_000)

async function seed(pool: pg.Pool) {
  await as(
    pool,
    A.org,
    A.owner,
    async (q) => {
      await q("insert into organizations (id, name) values ($1, $2)", [A.org, `check-A-${tag}`])
      await q("insert into facilities (id, organization_id, name, hcai_facility_id) values ($1, $3, 'A one', null), ($2, $3, 'A two', null)", [A.f1, A.f2, A.org])
      await q(
        `insert into admins (id, organization_id, email, name, password_hash, role, facility_scope, manager_id) values
         ($1, $3, $4, 'A owner', 'scrypt$x', 'owner', 'organization', null),
         ($2, $3, $5, 'A member', 'scrypt$x', 'member', 'facilities', $1)`,
        [A.owner, A.member, A.org, `a-owner-${tag}@check.test`, `a-member-${tag}@check.test`]
      )
      await q("insert into admin_facilities (organization_id, admin_id, facility_id) values ($1, $2, $3)", [A.org, A.member, A.f1])
      await q("insert into sessions (token_hash, organization_id, admin_id, expires_at) values ($1, $2, $3, $4)", [`a-${tag}`, A.org, A.owner, future])
    },
    true
  )
  await as(
    pool,
    B.org,
    B.owner,
    async (q) => {
      await q("insert into organizations (id, name) values ($1, $2)", [B.org, `check-B-${tag}`])
      await q("insert into facilities (id, organization_id, name) values ($1, $2, 'B one')", [B.f1, B.org])
      await q(`insert into admins (id, organization_id, email, name, password_hash, role, facility_scope) values ($1, $2, $3, 'B owner', 'scrypt$x', 'owner', 'organization')`, [
        B.owner,
        B.org,
        `b-owner-${tag}@check.test`,
      ])
      await q("insert into sessions (token_hash, organization_id, admin_id, expires_at) values ($1, $2, $3, $4)", [`b-${tag}`, B.org, B.owner, future])
      await q("insert into sessions (token_hash, organization_id, admin_id, expires_at) values ($1, $2, $3, now() - interval '1 minute')", [`b-old-${tag}`, B.org, B.owner])
    },
    true
  )
}

const TABLES = ["organizations", "facilities", "admins", "admin_facilities", "sessions"]
const orgCol = (t: string) => (t === "organizations" ? "id" : "organization_id")

async function run(pool: pg.Pool, label: string) {
  console.log(`\n# ${label}`)
  const idsOf = async (q: Q, t: string) => (await q(`select ${orgCol(t)} as org from ${t}`)).rows.map((r) => r.org as string)

  // Reads
  await as(pool, null, null, async (q) => {
    for (const t of TABLES) check(`no organization set: ${t} is empty`, (await idsOf(q, t)).length === 0)
  })
  await as(pool, A.org, A.owner, async (q) => {
    for (const t of TABLES) {
      const ids = await idsOf(q, t)
      check(`as A: ${t} holds only A's rows (unfiltered select)`, ids.length > 0 && ids.every((id) => id === A.org), `saw ${new Set(ids).size} orgs`)
      const asked = await q(`select 1 from ${t} where ${orgCol(t)} = $1`, [B.org])
      check(`as A: asking for B's ${t} by id returns nothing`, asked.rowCount === 0)
    }
    const joined = await q("select count(*)::int n from facilities f join admins a on true")
    check("as A: a join across tables stays inside A", joined.rows[0].n === 2 * 2)
  })

  // Writes aimed at B
  await as(pool, A.org, A.owner, async (q) => {
    check("as A: insert a facility into B is refused", !!(await rejects(q, "insert into facilities (organization_id, name) values ($1, 'x')", [B.org])))
    check("as A: insert an admin into B is refused", !!(await rejects(q, "insert into admins (organization_id, email, name, password_hash, role, facility_scope) values ($1, $2, 'x', 'x', 'owner', 'organization')", [B.org, `x-${tag}@check.test`])))
    check("as A: insert a session for B's owner is refused", !!(await rejects(q, "insert into sessions (token_hash, organization_id, admin_id, expires_at) values ($1, $2, $3, now() + interval '1 day')", [`x-${tag}`, B.org, B.owner])))
    check("as A: a session under A for B's admin is refused", !!(await rejects(q, "insert into sessions (token_hash, organization_id, admin_id, expires_at) values ($1, $2, $3, now() + interval '1 day')", [`y-${tag}`, A.org, B.owner])))
    check("as A: scope an A admin to B's facility is refused", !!(await rejects(q, "insert into admin_facilities (organization_id, admin_id, facility_id) values ($1, $2, $3)", [A.org, A.member, B.f1])))
    check("as A: make B's owner an A admin's manager is refused", !!(await rejects(q, "update admins set manager_id = $1 where id = $2", [B.owner, A.member])))
    check("as A: create an organization other than A is refused", !!(await rejects(q, "insert into organizations (id, name) values ($1, 'x')", [randomUUID()])))
    check("as A: move an A facility into B is refused", !!(await rejects(q, "update facilities set organization_id = $1 where id = $2", [B.org, A.f1])))
    const upd = await q("update facilities set name = 'changed' where id = $1", [B.f1])
    check("as A: update B's facility changes nothing", upd.rowCount === 0)
    const renamed = await q("update organizations set name = 'changed' where id = $1", [B.org])
    check("as A: rename B changes nothing", renamed.rowCount === 0)
    const del = await q("delete from sessions where organization_id = $1", [B.org])
    check("as A: delete B's sessions removes nothing", del.rowCount === 0)
    check("as A: deleting an organization isn't permitted at all", !!(await rejects(q, "delete from organizations")))
  })

  // Column privileges and role changes
  await as(pool, A.org, A.owner, async (q) => {
    check("password hashes can't be read by the app role", /permission denied/.test((await rejects(q, "select password_hash from admins")) ?? ""))
    check("the app role can't grant itself out of RLS", !!(await rejects(q, "alter role padua_app bypassrls")))
    check("the app role can't turn RLS off", !!(await rejects(q, "alter table facilities disable row level security")))
  })

  // The two lookups that run before an organization is known
  await as(pool, null, null, async (q) => {
    const login = (await q("select * from padua_login_lookup($1)", [`A-OWNER-${tag}@check.test `])).rows
    check("sign-in lookup finds one admin by email (case and spaces ignored)", login.length === 1 && login[0].admin_id === A.owner && login[0].organization_id === A.org)
    check("sign-in lookup of an unknown email finds nothing", (await q("select * from padua_login_lookup($1)", [`nobody-${tag}@check.test`])).rowCount === 0)
    const s = (await q("select * from padua_session_lookup($1)", [`b-${tag}`])).rows
    check("session lookup resolves a live session to its own organization", s.length === 1 && s[0].organization_id === B.org && s[0].admin_id === B.owner)
    check("session lookup ignores an expired session", (await q("select * from padua_session_lookup($1)", [`b-old-${tag}`])).rowCount === 0)
    check("session lookup exposes no other columns", !("token_hash" in (s[0] ?? {})))
  })

  // Facility scope: the rule future facility-level policies will use
  await as(pool, A.org, A.member, async (q) => {
    const r = (await q("select padua_in_scope($1) a1, padua_in_scope($2) a2, padua_in_scope($3) b1", [A.f1, A.f2, B.f1])).rows[0]
    check("member scoped to one facility: in scope", r.a1 === true)
    check("member scoped to one facility: the other facility is out of scope", r.a2 === false)
    check("member scoped to one facility: B's facility is out of scope", r.b1 === false)
  })
  await as(pool, A.org, A.owner, async (q) => {
    const r = (await q("select padua_in_scope($1) a1, padua_in_scope($2) a2, padua_in_scope($3) b1", [A.f1, A.f2, B.f1])).rows[0]
    check("organization-scoped owner: both A facilities in scope, B's not", r.a1 === true && r.a2 === true && r.b1 === false, JSON.stringify(r))
    check("organization-scoped owner: an unknown facility id isn't in scope", (await q("select padua_in_scope(gen_random_uuid()) x")).rows[0].x === false)
  })
  await as(pool, A.org, B.owner, async (q) => {
    const r = (await q("select padua_in_scope($1) a1", [A.f1])).rows[0]
    check("an admin id from B set against A's organization has no scope", r.a1 === false)
  })

  // A future organization-owned, facility-level table, with the policy pattern the migration documents
  await as(pool, A.org, A.member, async (q) => {
    const notes = (await q("select facility_id from check_org_notes")).rows.map((r) => r.facility_id)
    check("future data, as A's scoped member: only their facility's rows", notes.length === 1 && notes[0] === A.f1)
  })
  await as(pool, A.org, A.owner, async (q) => {
    const n = (await q("select count(*)::int n from check_org_notes")).rows[0].n
    check("future data, as A's owner: both A facilities, none of B's", n === 2)
    check("future data, as A: writing a note for B's facility is refused", !!(await rejects(q, "insert into check_org_notes (organization_id, facility_id, body) values ($1, $2, 'x')", [A.org, B.f1])))
  })
}

try {
  await seed(owner)
  // Stand-in for later organization data (saved briefings, uploads …): a facility-level table with the documented policy.
  await owner.query(`
    create table check_org_notes (
      organization_id uuid not null, facility_id uuid not null, body text not null,
      foreign key (organization_id, facility_id) references facilities (organization_id, id) on delete cascade);
    alter table check_org_notes enable row level security;
    create policy tenant on check_org_notes to padua_app
      using (organization_id = padua_current_org() and padua_in_scope(facility_id))
      with check (organization_id = padua_current_org() and padua_in_scope(facility_id));
    grant select, insert on check_org_notes to padua_app;`)
  await owner.query("insert into check_org_notes values ($1, $2, 'a1'), ($1, $3, 'a2'), ($4, $5, 'b1')", [A.org, A.f1, A.f2, B.org, B.f1])

  await run(owner, "Connected as the database owner (then SET ROLE padua_app)")
  if (process.env.CHECK_APP_DATABASE_URL) {
    const app = new pg.Pool({ connectionString: process.env.CHECK_APP_DATABASE_URL, max: 3 })
    await run(app, "Connected as a non-owner login role, member of padua_app")
    await as(app, A.org, A.owner, async (q) => {
      await q("reset role")
      // With NOINHERIT membership the login has no table access of its own at all; with INHERIT, padua_app's policies.
      const denied = await rejects(q, "select 1 from facilities where organization_id <> $1", [A.org])
      const others = denied ? 0 : (await q("select count(*)::int n from facilities where organization_id <> $1", [A.org])).rows[0].n
      check("non-owner login: even after RESET ROLE, B's rows stay out of reach", others === 0, `saw ${others} of other organizations' facilities`)
    })
    await app.end()
  }
} finally {
  await owner.query("drop table if exists check_org_notes")
  await owner.query("delete from organizations where id = any($1)", [[A.org, B.org]])
  await owner.end()
}

console.log(`\n${passes} passed, ${failures} failed.`)
process.exit(failures ? 1 : 0)
