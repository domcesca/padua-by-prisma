import { getSession } from "@/lib/server/auth/session"
import { getUploadFile } from "@/lib/server/uploads"

// GET /uploads/<id>/download -> the signed-in admin's own file (V7.6.5d). Anyone else's, or none, is the same 404: the
// database policy decides, and a missing row doesn't say whether it exists. Always a download, never shown inline,
// never cached.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const PRIVATE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }

export async function GET(_request: Request, ctx: RouteContext<"/uploads/[id]/download">) {
  const { id } = await ctx.params
  const session = await getSession()
  if (!session?.adminId) return new Response("Sign in to download your uploads.", { status: 401, headers: PRIVATE })
  const file = UUID.test(id) ? await getUploadFile(session, id) : null
  if (!file) return new Response("Not found.", { status: 404, headers: PRIVATE })
  const ascii = file.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_")
  return new Response(new Uint8Array(file.content), {
    headers: {
      ...PRIVATE,
      "Content-Type": file.contentType,
      "Content-Length": String(file.content.length),
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  })
}
