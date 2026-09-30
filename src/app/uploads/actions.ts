"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/server/auth/session"
import { addUpload, deleteUpload } from "@/lib/server/uploads"
import { cleanFileName, MAX_UPLOAD_BYTES, sniff } from "@/lib/uploads/sniff"

// Upload and delete (V7.6.5d). The file's type is decided from its bytes (lib/uploads/sniff.ts); the owner comes from
// the session inside the database, never from the form.

export type UploadState = { ok?: boolean; message?: string; field?: "file" | "label" } | null

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export async function uploadAction(_: UploadState, fd: FormData): Promise<UploadState> {
  const session = await getSession()
  if (!session?.adminId) return { ok: false, message: "Your session has ended. Sign in again to upload." }
  const file = fd.get("file")
  if (!(file instanceof File) || file.size === 0) return { ok: false, field: "file", message: "Choose a file to upload." }
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, field: "file", message: "Files can be up to 4 MB." }
  const labelRaw = fd.get("label")
  const label = typeof labelRaw === "string" ? labelRaw.trim() : ""
  if (label.length > 200) return { ok: false, field: "label", message: "Keep the label under 200 characters." }
  const fileName = cleanFileName(file.name)
  if (!fileName) return { ok: false, field: "file", message: "That file has no name. Rename it and try again." }
  const content = Buffer.from(await file.arrayBuffer())
  const kind = sniff(fileName, content)
  if (!kind.ok) return { ok: false, field: "file", message: kind.reason }
  await addUpload(session, { fileName, label: label || null, contentType: kind.contentType, content })
  revalidatePath("/uploads")
  return { ok: true, message: `${fileName} uploaded.` }
}

export async function deleteUploadAction(_: UploadState, fd: FormData): Promise<UploadState> {
  const session = await getSession()
  if (!session?.adminId) return { ok: false, message: "Your session has ended. Sign in again." }
  const id = fd.get("id")
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, message: "That upload wasn't found." }
  if (!(await deleteUpload(session, id))) return { ok: false, message: "That upload wasn't found. It may already be deleted." }
  revalidatePath("/uploads")
  return { ok: true, message: "Deleted." }
}
