// Shared by check-permissions.mts and check-hierarchy.mts (V7.6.5b): a scratch database, migrated, and transactions run
// the way the app runs them (src/lib/server/db.ts: SET LOCAL ROLE padua_app, organization and admin set per transaction).
import { execFileSync } from "node:child_process"
import { join } from "node:path"

import pg from "pg"

export function scratchPool() {
  const url = process.env.CHECK_DATABASE_URL
  if (!url) {
    console.error("Set CHECK_DATABASE_URL to a scratch database (owner role). It is migrated and written to.")
    process.exit(1)
  }
  execFileSync(process.execPath, ["--no-warnings", join(import.meta.dirname, "db-migrate.mts")], { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit" })
  return new pg.Pool({ connectionString: url, max: 6 })
}

export type Q = (sql: string, params?: unknown[]) => Promise<pg.QueryResult>

/** One transaction as padua_app for the given organization and admin; rolled back unless `commit`. */
export async function as<T>(pool: pg.Pool, org: string | null, admin: string | null, fn: (q: Q) => Promise<T>, commit = false): Promise<T> {
  const c = await pool.connect()
  try {
    await c.query("begin")
    await c.query("set local role padua_app")
    if (org) await c.query("select set_config('padua.organization_id', $1, true)", [org])
    if (admin) await c.query("select set_config('padua.admin_id', $1, true)", [admin])
    const out = await fn((sql, params) => c.query(sql, params))
    await c.query(commit ? "commit" : "rollback")
    return out
  } catch (e) {
    await c.query("rollback").catch(() => {})
    throw e
  } finally {
    c.release()
  }
}

/** Runs one statement in a savepoint and undoes it. Returns the padua:<code> it raised, "ok", or another error's text. */
export async function attempt(q: Q, sql: string, params?: unknown[], keep = false): Promise<string> {
  await q("savepoint attempt")
  try {
    await q(sql, params)
    await q(keep ? "release savepoint attempt" : "rollback to savepoint attempt")
    return "ok"
  } catch (e) {
    await q("rollback to savepoint attempt")
    const m = /padua:([a-z-]+)/.exec((e as Error).message)
    return m ? m[1] : `error: ${(e as Error).message}`
  }
}

let passes = 0
let failures = 0
export function check(name: string, ok: boolean, detail = "") {
  if (ok) passes++
  else failures++
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail && !ok ? `: ${detail}` : ""}`)
}
export function finish() {
  console.log(`\n${passes} passed, ${failures} failed.`)
  process.exit(failures ? 1 : 0)
}
