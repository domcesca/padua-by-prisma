import "server-only"

import pg from "pg"

// The accounts database (V7.6.5a): the one way the app reaches it. Every query runs in a transaction that first drops
// to the padua_app role, so row-level security (db/migrations/0001_accounts.sql) applies whatever role the connection
// string logs in as. Organization data is read and written only through withTenant, which sets the organization the
// policies filter on; `anonymous` is for the steps before anyone is known (sign-in, sign-up, session lookup) and sees
// no organization's rows at all.
//
// Padua's public HCAI data doesn't come through here: it's read from disk (lib/data) and open to everyone.

export type Tx = { query: <R extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params?: unknown[]) => Promise<R[]> }

/**
 * Who a tenant transaction acts for. Only lib/server/auth creates one, from a verified session (or from sign-up, for the
 * organization it just created); nothing takes an organization id from a request.
 */
export type TenantContext = { readonly organizationId: string; readonly adminId: string | null }

declare global {
  var __paduaPool: pg.Pool | undefined
}

/** Accounts need a database; without DATABASE_URL the app runs as before, with sign-in unavailable. */
export const accountsConfigured = () => !!process.env.DATABASE_URL

function pool() {
  const url = process.env.DATABASE_URL
  if (!url) throw new AccountsUnavailableError()
  // One pool per server process (and across dev reloads). Small: serverless functions each get their own.
  globalThis.__paduaPool ??= new pg.Pool({ connectionString: url, max: 5, idleTimeoutMillis: 10_000 })
  return globalThis.__paduaPool
}

export class AccountsUnavailableError extends Error {
  constructor() {
    super("Accounts aren't set up on this deployment (no DATABASE_URL).")
  }
}

async function transaction<T>(settings: Record<string, string>, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool().connect()
  try {
    await client.query("begin")
    // Both are transaction-local: they end with the commit or rollback, so a pooled connection never carries one
    // organization's setting into another request.
    await client.query("set local role padua_app")
    for (const [key, value] of Object.entries(settings)) await client.query("select set_config($1, $2, true)", [key, value])
    const tx: Tx = { query: async (sql, params) => (await client.query(sql, params)).rows }
    const result = await fn(tx)
    await client.query("commit")
    return result
  } catch (e) {
    await client.query("rollback").catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

/** Runs `fn` as the given organization: the only way to reach organization-owned rows. */
export function withTenant<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>) {
  return transaction({ "padua.organization_id": ctx.organizationId, "padua.admin_id": ctx.adminId ?? "" }, fn)
}

/** Runs `fn` with no organization set: sees no organization's rows; can call the sign-in and session lookups. */
export function anonymous<T>(fn: (tx: Tx) => Promise<T>) {
  return transaction({}, fn)
}
