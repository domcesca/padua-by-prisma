import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AccountsUnavailable, AuthCard } from "@/components/account/auth-card"
import { SignUpForm } from "@/components/account/auth-forms"
import { getFacilityOptions, getLatestYear } from "@/lib/data/store"
import { accountsConfigured } from "@/lib/server/db"
import { getSession } from "@/lib/server/auth/session"

export const metadata: Metadata = { title: "Create an account" }

export default async function SignupPage() {
  if (await getSession()) redirect("/account")
  const [facilities, latestYear] = await Promise.all([getFacilityOptions(), getLatestYear()])
  return (
    <AuthCard
      title="Create an account"
      description="Sets up your organization with you as its owner. Padua's public hospital data stays open without an account."
    >
      {accountsConfigured() ? <SignUpForm facilities={facilities} latestYear={latestYear} /> : <AccountsUnavailable />}
    </AuthCard>
  )
}
