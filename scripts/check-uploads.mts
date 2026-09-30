// Checks private uploads (V7.6.5d) in the database itself: each admin's uploads, file contents included, are theirs
// alone. Queries run the way the app runs them (src/lib/server/db.ts: SET LOCAL ROLE padua_app, organization and admin
// set per transaction) and most deliberately leave out any owner filter, so it's the policy that's being tested.
//   1. Across organizations: B's owner and A's people never see, list, read, delete or write each other's uploads.
//   2. Within one organization: not the owner, not an admin, not a manager up the reporting chain, not a report.
//   3. Writes: an upload can't be made for someone else, can't be moved to someone else, can't be edited at all.
//   4. The schema: RLS on, one policy, no SECURITY DEFINER function reads the table; removing a person removes theirs.
//   5. The content check (src/lib/uploads/sniff.ts): real files of each type pass, disguised ones don't.
//
// Needs a scratch database (CHECK_DATABASE_URL, owner role), migrated here; everything it adds is removed after.
// Run: CHECK_DATABASE_URL=postgres://… npm run check:uploads
import { randomUUID } from "node:crypto"

import { cleanFileName, sniff } from "../src/lib/uploads/sniff.ts"
import { as, attempt, check, finish, scratchPool, type Q } from "./db-check-helpers.mts"

const pool = scratchPool()
const own = (sql: string, params?: unknown[]) => pool.query(sql, params)
const tag = randomUUID().slice(0, 8)

// A: an owner; an admin who manages a member (the member reports to the admin, who reports to the owner).
// B: an owner. Everyone is organization-scoped, the widest facility access there is.
const A = { org: randomUUID(), f: randomUUID(), owner: randomUUID(), admin: randomUUID(), member: randomUUID() }
const B = { org: randomUUID(), f: randomUUID(), owner: randomUUID() }
const people = { aOwner: [A.org, A.owner], aAdmin: [A.org, A.admin], aMember: [A.org, A.member], bOwner: [B.org, B.owner] } as const
type Who = keyof typeof people
const upload: Record<Who, string> = { aOwner: "", aAdmin: "", aMember: "", bOwner: "" }

const insert = "insert into uploads (file_name, label, content_type, size_bytes, sha256, content) values ($1, $2, 'text/csv', $3, repeat('0', 64), $4) returning id"
const actAs = <T,>(who: Who, fn: (q: Q) => Promise<T>, commit = false) => as(pool, people[who][0], people[who][1], fn, commit)

try {
  for (const o of [A, B]) {
    await own("insert into organizations (id, name) values ($1, $2)", [o.org, `uploads-${tag}`])
    await own("insert into facilities (id, organization_id, name) values ($1, $2, 'F')", [o.f, o.org])
  }
  const person = (org: string, id: string, role: string, manager: string | null) =>
    own("insert into admins (id, organization_id, email, name, password_hash, role, facility_scope, manager_id) values ($1, $2, $3, 'p', 'x', $4, 'organization', $5)", [id, org, `${id}@uploads.test`, role, manager])
  await person(A.org, A.owner, "owner", null)
  await person(A.org, A.admin, "admin", A.owner)
  await person(A.org, A.member, "member", A.admin)
  await person(B.org, B.owner, "owner", null)

  // Everyone uploads one file, as themselves, the way the app does (no owner columns in the insert).
  for (const who of Object.keys(people) as Who[]) {
    const body = Buffer.from(`secret of ${who}\n`)
    upload[who] = await actAs(who, async (q) => (await q(insert, [`${who}.csv`, null, body.length, body])).rows[0].id as string, true)
    const [row] = (await own("select organization_id, admin_id from uploads where id = $1", [upload[who]])).rows
    check(`${who}: an upload is owned by whoever made it (filled in by the database)`, row.organization_id === people[who][0] && row.admin_id === people[who][1])
  }

  // ------------------------------------------------------------------------------------------------ 1 and 2: reading
  for (const who of Object.keys(people) as Who[]) {
    await actAs(who, async (q) => {
      const all = (await q("select id, admin_id from uploads")).rows
      check(`${who}: an unfiltered list shows only their own upload`, all.length === 1 && all[0].id === upload[who] && all[0].admin_id === people[who][1], `saw ${all.length}`)
      check(`${who}: counting every upload counts one`, Number((await q("select count(*) n from uploads")).rows[0].n) === 1)
      for (const other of Object.keys(people) as Who[]) {
        if (other === who) continue
        const byId = await q("select content from uploads where id = $1", [upload[other]])
        const byOwner = await q("select id from uploads where admin_id = $1 or organization_id = $2", [people[other][1], people[other][0]])
        check(`${who}: ${other}'s upload can't be read by id, content included, or listed by owner`, byId.rowCount === 0 && byOwner.rows.every((r) => r.id === upload[who]))
      }
    })
  }
  await actAs("aAdmin", async (q) => {
    const chain = (await q("select count(*) n from uploads u where u.admin_id in (select padua_subtree(padua_current_admin()))")).rows[0].n
    check("the member's manager: joining on their own reporting chain still shows only their own upload", Number(chain) === 1)
  })
  await actAs("aOwner", async (q) => {
    const joined = (await q("select count(*) n from uploads u join admins a on a.id = u.admin_id")).rows[0].n
    check("A's owner: joining uploads to every person in the organization shows only their own", Number(joined) === 1)
  })

  // ------------------------------------------------------------------------------------------------ 1 and 2: deleting
  const deletes: [Who, Who, string][] = [
    ["aOwner", "aMember", "the owner deleting a member's"],
    ["aAdmin", "aMember", "a manager deleting their report's"],
    ["aMember", "aAdmin", "a report deleting their manager's"],
    ["aOwner", "aAdmin", "the owner deleting an admin's"],
    ["bOwner", "aOwner", "another organization's owner deleting A's owner's"],
    ["aOwner", "bOwner", "A's owner deleting B's owner's"],
  ]
  for (const [who, other, label] of deletes) {
    await actAs(who, async (q) => {
      const byId = (await q("delete from uploads where id = $1", [upload[other]])).rowCount
      const all = (await q("delete from uploads where admin_id <> padua_current_admin()")).rowCount
      check(`${label} upload removes nothing (by id, or everyone else's at once)`, byId === 0 && all === 0)
    }, true)
  }
  const survivors = Number((await own("select count(*) n from uploads where id = any($1::uuid[])", [Object.values(upload)])).rows[0].n)
  check("after every attempt above (committed), all four uploads are still there", survivors === 4)

  // -------------------------------------------------------------------------------------------------------- 3: writes
  await actAs("aOwner", async (q) => {
    const forOther = await attempt(q, "insert into uploads (organization_id, admin_id, file_name, content_type, size_bytes, sha256, content) values ($1, $2, 'x.csv', 'text/csv', 1, repeat('0', 64), 'x')", [A.org, A.member])
    check("the owner can't make an upload that belongs to a member", forOther !== "ok", forOther)
    const intoB = await attempt(q, "insert into uploads (organization_id, admin_id, file_name, content_type, size_bytes, sha256, content) values ($1, $2, 'x.csv', 'text/csv', 1, repeat('0', 64), 'x')", [B.org, B.owner])
    check("A's owner can't make an upload that belongs to B's owner", intoB !== "ok", intoB)
    const move = await attempt(q, "update uploads set admin_id = $1 where id = $2", [A.member, upload.aOwner])
    check("an upload can't be handed to someone else (no updates at all)", /permission denied/.test(move), move)
    const edit = await attempt(q, "update uploads set content = 'changed' where id = $1", [upload.aOwner])
    check("an upload can't be edited, even by its owner", /permission denied/.test(edit), edit)
    check("an admin can delete their own upload", (await attempt(q, "delete from uploads where id = $1", [upload.aOwner], true)) === "ok" && (await q("select 1 from uploads")).rowCount === 0)
    const ownOk = await attempt(q, insert, ["own.csv", "Label", 1, Buffer.from("x")])
    check("an admin can add an upload of their own", ownOk === "ok", ownOk)
    const badType = await attempt(q, "insert into uploads (file_name, content_type, size_bytes, sha256, content) values ('x.pdf', 'application/pdf', 1, repeat('0', 64), 'x')")
    check("the database itself refuses a type outside the four", badType !== "ok")
    const badSize = await attempt(q, "insert into uploads (file_name, content_type, size_bytes, sha256, content) values ('x.csv', 'text/csv', 5, repeat('0', 64), 'x')")
    check("the database refuses a size that doesn't match the content", badSize !== "ok")
    const badName = await attempt(q, "insert into uploads (file_name, content_type, size_bytes, sha256, content) values ('../x.csv', 'text/csv', 1, repeat('0', 64), 'x')")
    check("the database refuses a file name with a path in it", badName !== "ok")
  })

  // An organization with no admin set (anonymous), or an admin id from B set against A: nothing to see or write.
  await as(pool, null, null, async (q) => check("no one signed in: no uploads visible", (await q("select 1 from uploads")).rowCount === 0))
  await as(pool, A.org, null, async (q) => {
    check("an organization set but no admin: no uploads visible, not even the organization's", (await q("select 1 from uploads")).rowCount === 0)
    check("an organization set but no admin: can't upload", (await attempt(q, insert, ["x.csv", null, 1, Buffer.from("x")])) !== "ok")
  })
  await as(pool, A.org, B.owner, async (q) => {
    check("B's owner's id set against A's organization: sees nothing", (await q("select 1 from uploads")).rowCount === 0)
    check("B's owner's id set against A's organization: can't upload", (await attempt(q, insert, ["x.csv", null, 1, Buffer.from("x")])) !== "ok")
  })
  await actAs("aMember", async (q) => {
    check("the app role can't turn RLS off for uploads", (await attempt(q, "alter table uploads disable row level security")) !== "ok")
    check("the app role can't add a policy of its own", (await attempt(q, "create policy mine on uploads to padua_app using (true)")) !== "ok")
  })

  // -------------------------------------------------------------------------------------------------------- 4: schema
  const rls = (await own("select relrowsecurity from pg_class where oid = 'uploads'::regclass")).rows[0].relrowsecurity
  const policies = (await own("select policyname, cmd from pg_policies where tablename = 'uploads'")).rows
  check("uploads has row-level security, with exactly one policy covering every command", rls === true && policies.length === 1 && policies[0].cmd === "ALL", JSON.stringify(policies))
  const definers = (await own("select proname from pg_proc where prosecdef and prosrc ~* '\\muploads\\M'")).rows.map((r) => r.proname)
  check("no SECURITY DEFINER function reads or writes uploads", definers.length === 0, definers.join(", "))
  await actAs("aOwner", async (q) => check("removing a person (padua_remove_admin) works with uploads in place", (await attempt(q, "select padua_remove_admin($1)", [A.member], true)) === "ok"), true)
  check("removing a person removes their uploads", (await own("select 1 from uploads where id = $1", [upload.aMember])).rowCount === 0)

  // ------------------------------------------------------------------------------------------------- 5: content check
  const zip = (names: string[]) => {
    // A minimal stored ZIP with empty entries: local headers, then the central directory, then its end record.
    const parts: Buffer[] = []
    const central: Buffer[] = []
    let offset = 0
    for (const n of names) {
      const name = Buffer.from(n)
      const local = Buffer.alloc(30)
      local.writeUInt32LE(0x04034b50, 0)
      local.writeUInt16LE(name.length, 26)
      parts.push(local, name)
      const c = Buffer.alloc(46)
      c.writeUInt32LE(0x02014b50, 0)
      c.writeUInt16LE(name.length, 28)
      c.writeUInt32LE(offset, 42)
      central.push(c, name)
      offset += 30 + name.length
    }
    const cd = Buffer.concat(central)
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(names.length, 8)
    end.writeUInt16LE(names.length, 10)
    end.writeUInt32LE(cd.length, 12)
    end.writeUInt32LE(offset, 16)
    return Buffer.concat([...parts, cd, end])
  }
  const workbook = zip(["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/worksheets/sheet1.xml"])
  const docx = zip(["[Content_Types].xml", "word/document.xml"])
  const macro = zip(["[Content_Types].xml", "xl/workbook.xml", "xl/vbaProject.bin"])
  const pdf = Buffer.from("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj\n", "latin1")
  const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00])
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])
  const cases: [string, Buffer, string | null][] = [
    ["data.csv", Buffer.from('year,beds\n2024,"1,200"\n2025,1210\n'), "text/csv"],
    ["windows.csv", Buffer.from("name,city\nJos\xe9,San Jos\xe9\r\n", "latin1"), "text/csv"],
    ["bom.csv", Buffer.from("\ufeffa,b\n1,2\n"), "text/csv"],
    ["book.xlsx", workbook, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ["data.json", Buffer.from('{"beds": [1, 2]}'), "application/json"],
    ["notes.txt", Buffer.from("Plain notes.\n"), "text/plain"],
    ["UPPER.CSV", Buffer.from("a\n1\n"), "text/csv"],
    ["report.pdf", pdf, null],
    ["report.pdf.csv", pdf, null],
    ["program.exe", exe, null],
    ["program.csv", exe, null],
    ["picture.txt", png, null],
    ["picture.xlsx", png, null],
    ["letter.xlsx", docx, null],
    ["macros.xlsx", macro, null],
    ["renamed.xlsx", Buffer.from("a,b\n1,2\n"), null],
    ["book.csv", workbook, null],
    ["book.json", workbook, null],
    ["broken.json", Buffer.from('{"beds": '), null],
    ["latin1.json", Buffer.from('{"city": "San Jos\xe9"}', "latin1"), null],
    ["open-quote.csv", Buffer.from('a,b\n"1,2\n'), null],
    ["blank.csv", Buffer.from("\n\n  \n"), null],
    ["empty.txt", Buffer.alloc(0), null],
    ["too-big.txt", Buffer.alloc(4 * 1024 * 1024 + 1, 0x61), null],
    ["old.xls", Buffer.from("a,b\n"), null],
    ["noextension", Buffer.from("a,b\n"), null],
    ["page.html", Buffer.from("<html></html>"), null],
  ]
  for (const [name, bytes, expected] of cases) {
    const r = sniff(name, bytes)
    const got = r.ok ? r.contentType : null
    check(`content check: ${name} ${expected ? `accepted as ${expected}` : "rejected"}`, got === expected, r.ok ? got! : r.reason)
  }
  check("file names: a path is stripped to its last part", cleanFileName("C:\\Users\\me\\data.csv") === "data.csv" && cleanFileName("../../etc/data.csv") === "data.csv")
  check("file names: control characters removed, long names cut with the extension kept", cleanFileName("a\u0000b\n.csv") === "ab.csv" && cleanFileName(`${"x".repeat(300)}.xlsx`).length === 255 && cleanFileName(`${"x".repeat(300)}.xlsx`).endsWith(".xlsx"))
} finally {
  await own("delete from organizations where id = any($1::uuid[])", [[A.org, B.org]])
  await pool.end()
}
finish()
