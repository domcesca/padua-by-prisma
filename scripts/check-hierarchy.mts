// Checks the management hierarchy (V7.6.5b), on synthetic data (no organization data exists yet):
//   1. Loops: no one can end up above themselves, directly or down a long chain, through the functions or a direct
//      write, and not by two concurrent edits that are each fine alone.
//   2. Traversal: padua_manages and padua_subtree agree with an independent walk in TypeScript over random forests
//      reshaped by thousands of random moves; and they still end (not hang) if a loop were ever stored.
//   3. Access to owned data, on a stand-in table with the documented policy and padua_owned_row_guard: a manager sees
//      their reports' items down the chain (on top of facility scope), can hand them to someone in their own part of the
//      chain (logged), and can't edit them; reports don't see up; facility scope alone is view-only.
//   4. Performance: a 5,000-deep chain and a 10,000-person tree, and a 100,000-row owned table read through the policy.
//
// Needs a scratch database (CHECK_DATABASE_URL, owner role), migrated here; everything it adds is removed after.
// Run: CHECK_DATABASE_URL=postgres://… npm run check:hierarchy
import { randomUUID } from "node:crypto"

import { as, attempt, check, finish, scratchPool, type Q } from "./db-check-helpers.mts"

const pool = scratchPool()
const own = (sql: string, params?: unknown[]) => pool.query(sql, params)
const orgs: string[] = []
const tag = randomUUID().slice(0, 8)
let seed = 11
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed / 2 ** 31)
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]

/** An organization with one facility, an organization-wide owner (the actor for moves) and `n` members. */
async function makeOrg(n: number) {
  const org = randomUUID()
  const facility = randomUUID()
  const actor = randomUUID()
  orgs.push(org)
  await own("insert into organizations (id, name) values ($1, $2)", [org, `hier-${tag}`])
  await own("insert into facilities (id, organization_id, name) values ($1, $2, 'F')", [facility, org])
  await own(`insert into admins (id, organization_id, email, name, password_hash, role, facility_scope) values ($1, $2, $3, 'actor', 'x', 'owner', 'organization')`, [actor, org, `actor-${org}@h.test`])
  const ids = Array.from({ length: n }, () => randomUUID())
  for (let i = 0; i < n; i += 1000) {
    const chunk = ids.slice(i, i + 1000)
    await own(
      `insert into admins (id, organization_id, email, name, password_hash, role, facility_scope)
       select id, $2, id::text || '@h.test', 'p', 'x', 'member', 'organization' from unnest($1::uuid[]) id`,
      [chunk, org]
    )
  }
  // Bulk loads leave the planner's statistics stale until autovacuum catches up; a live organization grows one invite
  // at a time. Analyze, as autovacuum would, so the timings reflect normal running.
  await own("analyze admins")
  return { org, facility, actor, ids }
}
const setManager = (o: { org: string; actor: string }, target: string, manager: string | null, q?: Q) =>
  q ? attempt(q, "select padua_set_manager($1, $2)", [target, manager], true) : as(pool, o.org, o.actor, (qq) => attempt(qq, "select padua_set_manager($1, $2)", [target, manager], true), true)

/** Independent reference: is `m` above `r`? */
function jsManages(managerOf: Map<string, string | null>, m: string, r: string) {
  const seen = new Set<string>()
  for (let x = managerOf.get(r) ?? null; x && !seen.has(x); x = managerOf.get(x) ?? null) {
    if (x === m) return true
    seen.add(x)
  }
  return false
}

try {
  // ---------------------------------------------------------------------------------------------------------------- 1
  {
    const o = await makeOrg(60)
    const [a, b, c] = o.ids
    check("no one can be their own manager", (await setManager(o, a, a)) === "cycle")
    await setManager(o, b, a)
    check("two people can't manage each other", (await setManager(o, a, b)) === "cycle")
    for (let i = 1; i < 50; i++) await setManager(o, o.ids[i], o.ids[i - 1])
    check("the top of a 50-deep chain can't be put under its bottom", (await setManager(o, a, o.ids[49])) === "cycle")
    check("…or under anyone in between", (await setManager(o, o.ids[10], o.ids[30])) === "cycle")
    check("moving someone sideways within the chain is fine", (await setManager(o, o.ids[30], o.ids[10])) === "ok")
    check(
      "a direct write that closes a loop is stopped by the trigger, even as the database owner",
      await own("update admins set manager_id = $1 where id = $2", [o.ids[49], a]).then(
        () => false,
        (e) => /padua:cycle/.test(e.message)
      )
    )
    check("…and one naming someone as their own manager too", await own("update admins set manager_id = id where id = $1", [c]).then(() => false, (e) => /padua:cycle|manager_id <> id|check/.test(e.message)))

    // Concurrent: each edit alone is fine; together they'd form a loop. The per-organization lock makes the second wait
    // for the first and then see it.
    let raced = 0
    let loops = 0
    for (let round = 0; round < 25; round++) {
      const x = o.ids[50 + (round % 5)]
      const y = o.ids[55 + (round % 5)]
      await own("update admins set manager_id = null where id = any($1)", [[x, y]])
      const c1 = await pool.connect()
      const c2 = await pool.connect()
      const begin = async (c: typeof c1) => {
        await c.query("begin")
        await c.query("set local role padua_app")
        await c.query("select set_config('padua.organization_id', $1, true), set_config('padua.admin_id', $2, true)", [o.org, o.actor])
      }
      await begin(c1)
      await begin(c2)
      await c1.query("select padua_set_manager($1, $2)", [x, y])
      const second = c2.query("select padua_set_manager($1, $2)", [y, x]).then(
        () => "ok",
        (e) => (/padua:cycle/.test(e.message) ? "cycle" : e.message)
      )
      await new Promise((r) => setTimeout(r, 30))
      await c1.query("commit")
      const r2 = await second
      await c2.query(r2 === "ok" ? "commit" : "rollback")
      c1.release()
      c2.release()
      raced++
      const chain = (await own("select id, manager_id from admins where id = any($1)", [[x, y]])).rows
      if (chain.every((row) => row.manager_id !== null)) loops++
      if (r2 !== "cycle") console.log(`      round ${round}: second edit gave ${r2}`)
    }
    check(`two concurrent edits that together would loop: the second is refused in all ${raced} races, no loop stored`, loops === 0)
  }

  // ---------------------------------------------------------------------------------------------------------------- 2
  {
    const o = await makeOrg(300)
    const managerOf = new Map<string, string | null>(o.ids.map((id) => [id, null]))
    let agreed = 0
    let moves = 0
    let refusedLoops = 0
    await as(
      pool,
      o.org,
      o.actor,
      async (q) => {
        for (let i = 0; i < 3000; i++) {
          const t = pick(o.ids)
          const m = rand() < 0.1 ? null : pick(o.ids)
          const wouldLoop = m !== null && (m === t || jsManages(managerOf, t, m))
          const got = await setManager(o, t, m, q)
          if ((got === "cycle") === wouldLoop && (got === "ok") === !wouldLoop) agreed++
          if (got === "ok") managerOf.set(t, m)
          else refusedLoops++
          moves++
        }
      },
      true
    )
    check(`3,000 random moves: every one refused exactly when it would loop (${refusedLoops} refused)`, agreed === moves)
    const pairs = Array.from({ length: 5000 }, () => [pick(o.ids), pick(o.ids)])
    const dbManages = await as(pool, o.org, o.actor, async (q) =>
      (await q("select padua_manages(m, r) v from unnest($1::uuid[], $2::uuid[]) as t(m, r)", [pairs.map((p) => p[0]), pairs.map((p) => p[1])])).rows.map((r) => r.v)
    )
    const mismatch = pairs.filter(([m, r], i) => dbManages[i] !== jsManages(managerOf, m, r)).length
    check(`padua_manages agrees with an independent walk on 5,000 random pairs (${dbManages.filter(Boolean).length} true)`, mismatch === 0, `${mismatch} differ`)
    const sizes = await as(pool, o.org, o.actor, async (q) => (await q("select id, (select count(*)::int from padua_subtree(id)) n from unnest($1::uuid[]) id", [o.ids])).rows)
    const subMismatch = sizes.filter((row) => row.n !== 1 + o.ids.filter((r) => jsManages(managerOf, row.id, r)).length).length
    check("padua_subtree matches the independent walk for all 300 people", subMismatch === 0, `${subMismatch} differ`)

    // A loop stored behind the guard's back (trigger off, as the owner) must not hang the read functions.
    await own("alter table admins disable trigger chain_guard")
    const [p, r] = [o.ids[0], o.ids[1]]
    await own("update admins set manager_id = null where id = any($1)", [[p, r]])
    await own("update admins set manager_id = $1 where id = $2", [r, p])
    await own("update admins set manager_id = $1 where id = $2", [p, r])
    await own("alter table admins enable trigger chain_guard")
    const t0 = performance.now()
    const looped = await as(pool, o.org, o.actor, async (q) => {
      await q("set local statement_timeout = '5s'")
      return (await q("select (select count(*)::int from padua_subtree($1)) s, (select count(*)::int from padua_managers_of($1)) m, padua_manages($2, $1) x", [p, r])).rows[0]
    })
    check(`with a loop stored anyway, the traversal functions still end (${(performance.now() - t0).toFixed(0)} ms)`, looped.s >= 2 && looped.m >= 1 && looped.x === true)
    await own("update admins set manager_id = null where id = any($1)", [[p, r]])
  }

  // ---------------------------------------------------------------------------------------------------------------- 3
  {
    // CSO (whole organization, but let's scope them to F1 to show hierarchy reaches past scope) → Director (F1) →
    // Analyst (F2). A peer at F2 is outside the chain. A viewer scoped to F2 sees F2 items by scope, but can't edit.
    const org = randomUUID()
    orgs.push(org)
    const [f1, f2] = [randomUUID(), randomUUID()]
    const [owner, cso, director, analyst, peer, viewer] = Array.from({ length: 6 }, () => randomUUID())
    await own("insert into organizations (id, name) values ($1, 'owned')", [org])
    await own("insert into facilities (id, organization_id, name) values ($1, $3, 'F1'), ($2, $3, 'F2')", [f1, f2, org])
    const person = async (id: string, role: string, fac: string | null, name: string) => {
      await own(`insert into admins (id, organization_id, email, name, password_hash, role, facility_scope) values ($1, $2, $3, $4, 'x', $5, $6)`, [
        id,
        org,
        `${id}@o.test`,
        name,
        role,
        fac ? "facilities" : "organization",
      ])
      if (fac) await own("insert into admin_facilities (organization_id, admin_id, facility_id) values ($1, $2, $3)", [org, id, fac])
    }
    await person(owner, "owner", null, "owner")
    await person(cso, "member", f1, "cso")
    await person(director, "member", f1, "director")
    await person(analyst, "member", f2, "analyst")
    await person(peer, "member", f1, "peer")
    await person(viewer, "member", f2, "viewer")
    await own("update admins set manager_id = $1 where id = $2", [cso, director])
    await own("update admins set manager_id = $1 where id = $2", [director, analyst])

    await own(`
      create table check_owned_items (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null,
        facility_id uuid not null,
        owner_admin_id uuid not null,
        body text not null,
        foreign key (organization_id, facility_id) references facilities (organization_id, id) on delete cascade,
        foreign key (organization_id, owner_admin_id) references admins (organization_id, id));
      alter table check_owned_items enable row level security;
      create policy view on check_owned_items for select to padua_app using (
        organization_id = padua_current_org()
        and (facility_id = any ((select padua_scope_facilities())::uuid[]) or owner_admin_id = any ((select padua_visible_owners())::uuid[])));
      create policy change on check_owned_items for update to padua_app
        using (organization_id = padua_current_org() and owner_admin_id = any ((select padua_visible_owners())::uuid[]))
        with check (organization_id = padua_current_org());
      create trigger owned_guard before update on check_owned_items for each row execute function padua_owned_row_guard();
      grant select, update on check_owned_items to padua_app;`)
    const item = randomUUID()
    const csoItem = randomUUID()
    const item2 = randomUUID()
    await own(
      "insert into check_owned_items (id, organization_id, facility_id, owner_admin_id, body) values ($1, $3, $4, $5, 'analyst work'), ($2, $3, $6, $7, 'cso work'), ($8, $3, $4, $5, 'more analyst work')",
      [item, csoItem, org, f2, analyst, f1, cso, item2]
    )
    const sees = (who: string, id: string) => as(pool, org, who, async (q) => (await q("select 1 from check_owned_items where id = $1", [id])).rowCount === 1)
    const tryAs = (who: string, sql: string, params: unknown[], keep = false) => as(pool, org, who, (q) => attempt(q, sql, params, keep), keep)

    check("the director sees their direct report's item (outside the director's own facility)", await sees(director, item))
    check("the CSO sees it too, two levels down the chain", await sees(cso, item))
    check("a peer outside the chain doesn't see it", !(await sees(peer, item)))
    check("a report doesn't see their manager's item (the chain runs down, not up)", !(await sees(analyst, csoItem)))
    check("facility scope still applies on its own: an F2 viewer sees the F2 item", await sees(viewer, item))
    const viewerEdit = await as(pool, org, viewer, (q) => q("update check_owned_items set body = 'x' where id = $1", [item]).then((r) => r.rowCount))
    check("…but seeing by facility scope isn't permission to change it", viewerEdit === 0)
    check("the owner of an item can edit it", (await tryAs(analyst, "update check_owned_items set body = 'edited' where id = $1", [item])) === "ok")
    check("a manager can't edit a report's item", (await tryAs(cso, "update check_owned_items set body = 'changed by cso' where id = $1", [item])) === "manager-cannot-edit")
    check(
      "…nor edit it while reassigning it",
      (await tryAs(cso, "update check_owned_items set body = 'sneaky', owner_admin_id = $2 where id = $1", [item, director])) === "manager-cannot-edit"
    )
    check("a manager can't hand a report's item to someone outside their own chain", (await tryAs(cso, "update check_owned_items set owner_admin_id = $2 where id = $1", [item, peer])) === "reassign-outside-reports")
    check("a manager can hand a report's item to another of their reports", (await tryAs(cso, "update check_owned_items set owner_admin_id = $2 where id = $1", [item, director], true)) === "ok")
    const log = (await own("select from_admin, to_admin, by_admin from ownership_transfers where organization_id = $1 and table_name = 'check_owned_items'", [org])).rows
    check("the hand-off is logged: from, to, and by whom", log.length === 1 && log[0].from_admin === analyst && log[0].to_admin === director && log[0].by_admin === cso)
    check("the director can't hand it up to the CSO (outside the director's own chain)", (await tryAs(director, "update check_owned_items set owner_admin_id = $2 where id = $1", [item, cso])) === "reassign-outside-reports")
    const blocked = await as(pool, org, owner, (q) => attempt(q, "select padua_remove_admin($1)", [director]))
    check("removing someone who still owns items is refused until the items are handed on", /foreign key/.test(blocked), blocked)
    check("the CSO hands it back to the analyst", (await tryAs(cso, "update check_owned_items set owner_admin_id = $2 where id = $1", [item, analyst], true)) === "ok")
    await as(pool, org, owner, (q) => q("select padua_remove_admin($1)", [director]), true)
    const analystManager = (await own("select manager_id from admins where id = $1", [analyst])).rows[0].manager_id
    check("removing the director moves their reports up to the CSO", analystManager === cso)
    check("…so the CSO still sees the analyst's work (it would be lost if the chain were just cut)", await sees(cso, item2))
    await own("drop table check_owned_items")
  }

  // ---------------------------------------------------------------------------------------------------------------- 4
  {
    const time = async <T,>(fn: () => Promise<T>) => {
      const t = performance.now()
      const out = await fn()
      return [out, performance.now() - t] as const
    }
    const deep = await makeOrg(5000)
    await own("alter table admins disable trigger chain_guard")
    await own("update admins a set manager_id = t.boss from unnest($1::uuid[], $2::uuid[]) t(id, boss) where a.id = t.id", [deep.ids.slice(1), deep.ids.slice(0, -1)])
    await own("alter table admins enable trigger chain_guard")
    await own("analyze admins")
    const [top, bottom] = [deep.ids[0], deep.ids[4999]]
    const [m, tm] = await time(() => as(pool, deep.org, deep.actor, async (q) => (await q("select padua_manages($1, $2) v", [top, bottom])).rows[0].v))
    const [s, ts] = await time(() => as(pool, deep.org, deep.actor, async (q) => (await q("select count(*)::int n from padua_subtree($1)", [top])).rows[0].n))
    const [loop, tl] = await time(() => setManager(deep, top, bottom))
    const [move, tv] = await time(() => setManager(deep, deep.ids[4000], deep.ids[10]))
    check(`5,000-deep chain: top manages bottom (${tm.toFixed(0)} ms)`, m === true && tm < 2000)
    check(`5,000-deep chain: subtree of the top is all 5,000 (${ts.toFixed(0)} ms)`, s === 5000 && ts < 2000)
    check(`5,000-deep chain: putting the top under the bottom is refused (${tl.toFixed(0)} ms)`, loop === "cycle" && tl < 3000)
    check(`5,000-deep chain: a legitimate move near the bottom (${tv.toFixed(0)} ms)`, move === "ok" && tv < 3000)

    const wide = await makeOrg(10000)
    await own("alter table admins disable trigger chain_guard")
    await own("update admins a set manager_id = t.boss from unnest($1::uuid[], $2::uuid[]) t(id, boss) where a.id = t.id", [
      wide.ids.slice(1),
      wide.ids.slice(1).map((_, i) => wide.ids[Math.floor(i / 10)]),
    ])
    await own("alter table admins enable trigger chain_guard")
    await own("analyze admins")
    const [ws, tws] = await time(() => as(pool, wide.org, wide.actor, async (q) => (await q("select count(*)::int n from padua_subtree($1)", [wide.ids[0]])).rows[0].n))
    check(`10,000-person tree (fan-out 10): the root's subtree (${tws.toFixed(0)} ms)`, ws === 10000 && tws < 3000)

    // A 100,000-row owned table read through the policy by a mid-level manager.
    await own(`
      create table check_owned_bulk (
        id bigint generated always as identity primary key, organization_id uuid not null, facility_id uuid not null, owner_admin_id uuid not null);
      create index on check_owned_bulk (organization_id, owner_admin_id);
      alter table check_owned_bulk enable row level security;
      create policy view on check_owned_bulk for select to padua_app using (
        organization_id = padua_current_org()
        and (facility_id = any ((select padua_scope_facilities())::uuid[]) or owner_admin_id = any ((select padua_visible_owners())::uuid[])));
      grant select on check_owned_bulk to padua_app;`)
    await own("insert into check_owned_bulk (organization_id, facility_id, owner_admin_id) select $1, $2, ($3::uuid[])[1 + (g % 10000)] from generate_series(1, 100000) g", [wide.org, wide.facility, wide.ids])
    await own("analyze check_owned_bulk")
    // A manager scoped to no facility of theirs (so only the hierarchy grants access): id #2's subtree.
    const mid = wide.ids[1]
    await own("update admins set facility_scope = 'facilities' where id = $1", [mid])
    const f2 = randomUUID()
    await own("insert into facilities (id, organization_id, name) values ($1, $2, 'other')", [f2, wide.org])
    await own("insert into admin_facilities (organization_id, admin_id, facility_id) values ($1, $2, $3)", [wide.org, mid, f2])
    const expectedOwners = await as(pool, wide.org, mid, async (q) => (await q("select count(*)::int n from padua_subtree($1)", [mid])).rows[0].n)
    const [rows, tr] = await time(() => as(pool, wide.org, mid, async (q) => (await q("select count(*)::int n from check_owned_bulk")).rows[0].n))
    const expectedRows = (await own("select count(*)::int n from check_owned_bulk where owner_admin_id in (select id from admins where organization_id = $1) and owner_admin_id = any($2)", [wide.org, await as(pool, wide.org, mid, async (q) => (await q("select array_agg(s) a from padua_subtree($1) s", [mid])).rows[0].a)])).rows[0].n
    check(`100,000 owned rows, read by a manager of ${expectedOwners.toLocaleString()} people through the policy (${tr.toFixed(0)} ms)`, rows === expectedRows && rows > 0 && tr < 3000, `${rows} vs ${expectedRows}`)
    await own("drop table check_owned_bulk")
  }
} finally {
  await own("alter table admins enable trigger chain_guard").catch(() => {})
  await own("drop table if exists check_owned_items, check_owned_bulk")
  await pool.query("delete from organizations where id = any($1)", [orgs])
  await pool.end()
}
finish()
