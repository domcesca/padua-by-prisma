"use server"

import { redirect } from "next/navigation"

import { getFacility } from "@/lib/data/store"
import { AccountsUnavailableError } from "@/lib/server/db"
import { createAccount, deleteSession, normalizeEmail, verifyLogin } from "@/lib/server/auth/accounts"
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/server/auth/password"
import { clearSessionCookie, getSession, sessionToken, startSession } from "@/lib/server/auth/session"
import { refusalText } from "@/lib/org/permissions"
import { acceptInvite } from "@/lib/server/org"
import { newTestHospital, testHospitalsEnabled } from "@/lib/server/sandbox"

// Sign-up, sign-in and sign-out (V7.6.5a). Server actions: Next checks each POST's Origin against the host, and every
// field is validated here, whatever the form did.

export type FormState = {
  /** Per field, shown under the field. */
  errors?: Partial<Record<"name" | "email" | "password" | "organization" | "facility", string>>
  /** For the whole form, shown above the button. */
  message?: string
  /** What was typed (never the password), so a failed submit doesn't clear the form. */
  values?: Record<string, string>
} | null

const str = (fd: FormData, key: string) => {
  const v = fd.get(key)
  return typeof v === "string" ? v : ""
}
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Only a path on this site: "/account", not "//evil.example" or "https://…". */
const safeNext = (next: string) => (/^\/(?![/\\])/.test(next) ? next : "/account")

const UNAVAILABLE = "Accounts aren't set up on this deployment yet."

export async function signUp(_: FormState, fd: FormData): Promise<FormState> {
  const name = str(fd, "name").trim()
  const email = normalizeEmail(str(fd, "email"))
  const password = str(fd, "password")
  const organization = str(fd, "organization").trim()
  const facilityId = str(fd, "facility")
  // V7.6.5c: a made-up test hospital instead of a real one, where this deployment allows it.
  const useTest = testHospitalsEnabled() && str(fd, "hospitalKind") === "test"
  const testName = str(fd, "testName").trim()
  const values = { name, email, organization, facility: facilityId, hospitalKind: useTest ? "test" : "real", testName }

  const errors: NonNullable<FormState>["errors"] = {}
  if (!name) errors.name = "Enter your name."
  else if (name.length > 200) errors.name = "Keep your name under 200 characters."
  if (!EMAIL.test(email) || email.length > 320) errors.email = "Enter an email address, like name@hospital.org."
  if (password.length < PASSWORD_MIN) errors.password = `Use at least ${PASSWORD_MIN} characters.`
  else if (password.length > PASSWORD_MAX) errors.password = `Use at most ${PASSWORD_MAX} characters.`
  if (!organization) errors.organization = "Enter your organization's name."
  else if (organization.length > 200) errors.organization = "Keep the name under 200 characters."
  // A real hospital's name comes from the public data, not the form.
  const facility = !useTest && facilityId ? await getFacility(facilityId) : null
  if (useTest) {
    if (!testName) errors.facility = "Name the test hospital."
    else if (testName.length > 200) errors.facility = "Keep the name under 200 characters."
  } else if (!facility) errors.facility = "Choose your hospital."
  if (Object.keys(errors).length) return { errors, values }

  try {
    const result = await createAccount({
      name,
      email,
      password,
      organizationName: organization,
      facility: useTest ? { name: testName, test: newTestHospital } : { name: facility!.name, hcaiFacilityId: facility!.id },
    })
    if (!result.ok) return { errors: { email: "An account with this email already exists. Sign in instead." }, values }
    await startSession(result.ctx)
  } catch (e) {
    if (e instanceof AccountsUnavailableError) return { message: UNAVAILABLE, values }
    throw e
  }
  redirect("/account")
}

export async function signIn(_: FormState, fd: FormData): Promise<FormState> {
  const email = normalizeEmail(str(fd, "email"))
  const password = str(fd, "password")
  const values = { email }
  if (!email || !password) return { message: "Enter your email and password.", values }
  if (password.length > PASSWORD_MAX) return { message: "That email and password don't match an account.", values }

  try {
    const result = await verifyLogin(email, password)
    if (!result.ok)
      return {
        message:
          result.reason === "throttled"
            ? "Too many attempts for this email. Wait 15 minutes, then try again."
            : "That email and password don't match an account.",
        values,
      }
    await startSession(result.ctx)
  } catch (e) {
    if (e instanceof AccountsUnavailableError) return { message: UNAVAILABLE, values }
    throw e
  }
  redirect(safeNext(str(fd, "next")))
}

export async function signOut() {
  const [session, token] = await Promise.all([getSession(), sessionToken()])
  if (session && token) await deleteSession(session, token)
  await clearSessionCookie()
  redirect("/login?signedOut=1")
}

/** Accepting an invite (V7.6.5b): name and password; the email, organization, role and access come from the invite. */
export async function acceptInviteAction(_: FormState, fd: FormData): Promise<FormState> {
  const token = str(fd, "token")
  const name = str(fd, "name").trim()
  const password = str(fd, "password")
  const values = { name }
  const errors: NonNullable<FormState>["errors"] = {}
  if (!name) errors.name = "Enter your name."
  else if (name.length > 200) errors.name = "Keep your name under 200 characters."
  if (password.length < PASSWORD_MIN) errors.password = `Use at least ${PASSWORD_MIN} characters.`
  else if (password.length > PASSWORD_MAX) errors.password = `Use at most ${PASSWORD_MAX} characters.`
  if (Object.keys(errors).length) return { errors, values }

  try {
    const result = await acceptInvite(token, name, password)
    if (!result.ok) return { message: refusalText(result.refusal), values }
    // Whoever was signed in on this browser before is signed out: the session now belongs to the new account.
    const [previous, previousToken] = await Promise.all([getSession(), sessionToken()])
    if (previous && previousToken) await deleteSession(previous, previousToken)
    await startSession(result.value)
  } catch (e) {
    if (e instanceof AccountsUnavailableError) return { message: UNAVAILABLE, values }
    throw e
  }
  redirect("/account?joined=1")
}
