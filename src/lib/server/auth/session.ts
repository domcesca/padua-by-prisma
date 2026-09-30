import "server-only"

import { cookies } from "next/headers"
import { cache } from "react"

import { accountsConfigured, type TenantContext } from "../db"
import { createSession, resolveSession, SESSION_DAYS } from "./accounts"

// The session cookie (V7.6.5a): an opaque random token, httpOnly so page scripts can't read it, SameSite=Lax so other
// sites' forms don't carry it (server actions also check the Origin header), Secure outside local development.

const COOKIE = "padua_session"

/** The signed-in admin for this request, or null. Once per request however many components ask. */
export const getSession = cache(async (): Promise<TenantContext | null> => {
  // Read the cookie first, whatever the configuration: it marks the page as per-request, so one built without
  // DATABASE_URL isn't frozen as a static page that ignores a database added later.
  const token = (await cookies()).get(COOKIE)?.value
  if (!accountsConfigured() || !token) return null
  return resolveSession(token)
})

/** For server actions and route handlers only: cookies can't be set while a page renders. */
export async function startSession(ctx: TenantContext) {
  const token = await createSession(ctx)
  ;(await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  })
}

/** The raw token, for sign-out (which deletes that one session). */
export const sessionToken = async () => (await cookies()).get(COOKIE)?.value ?? null

export async function clearSessionCookie() {
  ;(await cookies()).delete(COOKIE)
}
