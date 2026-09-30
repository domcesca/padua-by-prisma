import "server-only"

import { createHash } from "node:crypto"

import { withTenant, type TenantContext } from "./db"

// Private uploads (V7.6.5d). Every query goes through withTenant as the signed-in admin, and none of them names an
// owner: the uploads policy (db/migrations/0005_uploads.sql) is what limits each one to that admin's own rows, and it
// fills in the owner on insert. A query here that forgot a filter would still see only the admin's own files.

export type UploadSummary = { id: string; fileName: string; label: string | null; contentType: string; sizeBytes: number; createdAt: string }
export type UploadFile = { fileName: string; contentType: string; content: Buffer }

/** An admin's own context: uploads need a person, not just an organization. */
const own = (ctx: TenantContext) => {
  if (!ctx.adminId) throw new Error("Uploads need a signed-in admin")
  return ctx
}

export function listUploads(ctx: TenantContext): Promise<UploadSummary[]> {
  return withTenant(own(ctx), async (tx) => {
    const rows = await tx.query<{ id: string; file_name: string; label: string | null; content_type: string; size_bytes: number; created_at: Date }>(
      "select id, file_name, label, content_type, size_bytes, created_at from uploads order by created_at desc, id",
    )
    return rows.map((r) => ({ id: r.id, fileName: r.file_name, label: r.label, contentType: r.content_type, sizeBytes: r.size_bytes, createdAt: r.created_at.toISOString() }))
  })
}

export function addUpload(ctx: TenantContext, file: { fileName: string; label: string | null; contentType: string; content: Buffer }): Promise<string> {
  const sha256 = createHash("sha256").update(file.content).digest("hex")
  return withTenant(own(ctx), async (tx) => {
    const [row] = await tx.query<{ id: string }>(
      "insert into uploads (file_name, label, content_type, size_bytes, sha256, content) values ($1, $2, $3, $4, $5, $6) returning id",
      [file.fileName, file.label, file.contentType, file.content.length, sha256, file.content],
    )
    return row.id
  })
}

/** The file, if it's this admin's; null for anyone else's, or none at all (the two look the same). */
export function getUploadFile(ctx: TenantContext, id: string): Promise<UploadFile | null> {
  return withTenant(own(ctx), async (tx) => {
    const [row] = await tx.query<{ file_name: string; content_type: string; content: Buffer }>(
      "select file_name, content_type, content from uploads where id = $1",
      [id],
    )
    return row ? { fileName: row.file_name, contentType: row.content_type, content: row.content } : null
  })
}

/** Deletes the admin's own upload; false when there's no such upload of theirs. */
export function deleteUpload(ctx: TenantContext, id: string): Promise<boolean> {
  return withTenant(own(ctx), async (tx) => (await tx.query("delete from uploads where id = $1 returning id", [id])).length === 1)
}
