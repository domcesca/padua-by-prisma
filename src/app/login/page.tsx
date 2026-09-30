import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AccountsUnavailable, AuthCard } from "@/components/account/auth-card"
import { SignInForm } from "@/components/account/auth-forms"
import { accountsConfigured } from "@/lib/server/db"
import { getSession } from "@/lib/server/auth/session"

export const metadata: Metadata = { title: "Sign in" }

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams
  if (await getSession()) redirect("/account")
  const next = typeof params.next === "string" ? params.next : "/account"
  return (
    <AuthCard title="Sign in" description="Your organization's account. Padua's public hospital data stays open without one.">
      {accountsConfigured() ? <SignInForm next={next} notice={params.signedOut ? "You're signed out." : null} /> : <AccountsUnavailable />}
    </AuthCard>
  )
}
