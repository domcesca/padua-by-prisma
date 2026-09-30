// Applies db/migrations/*.sql, in name order, to the accounts database (V7.6.5a). Each file runs once, in its own
// transaction, recorded in schema_migrations; an advisory lock keeps two runs from racing. Connect as the database's
// owner role (DATABASE_URL, from the environment or .env.local): the migration creates the padua_app role the app
// acts as, and grants the owner membership in it.
// Run: npm run db:migrate
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import pg from "pg"

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL isn't set (environment or .env.local). Nothing to migrate.")
  process.exit(1)
}

const dir = join(import.meta.dirname, "..", "db", "migrations")
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()

const client = new pg.Client({ connectionString: url })
await client.connect()
try {
  await client.query("select pg_advisory_lock(7_605_001)")
  await client.query("create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())")
  const done = new Set((await client.query<{ version: string }>("select version from schema_migrations")).rows.map((r) => r.version))
  let applied = 0
  for (const file of files) {
    if (done.has(file)) continue
    await client.query("begin")
    try {
      await client.query(readFileSync(join(dir, file), "utf8"))
      await client.query("insert into schema_migrations (version) values ($1)", [file])
      await client.query("commit")
    } catch (e) {
      await client.query("rollback")
      throw new Error(`${file}: ${(e as Error).message}`)
    }
    console.log(`applied ${file}`)
    applied++
  }
  console.log(applied ? `${applied} migration${applied === 1 ? "" : "s"} applied.` : "Up to date.")
} finally {
  await client.query("select pg_advisory_unlock(7_605_001)").catch(() => {})
  await client.end()
}
