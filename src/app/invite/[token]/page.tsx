import type { Metadata } from "next"
import Link from "next/link"

import { AccountsUnavailable, AuthCard } from "@/components/account/auth-card"
import { AcceptInviteForm } from "@/components/account/auth-forms"
import { refusalText, ROLE_TEXT } from "@/lib/org/permissions"
import { accountsConfigured } from "@/lib/server/db"
import { getSession } from "@/lib/server/auth/session"
import { lookupInvite } from "@/lib/server/org"

// The page an invite link opens (V7.6.5b). The token in the address is the only authority: no referrer is sent from
// this page (so the token doesn't leak to linked sites), and it isn't indexed.
export const metadata: Metadata = { title: "Join your organization", referrer: "no-referrer", robots: { index: false, follow: false } }

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params
  if (!accountsConfigured())
    return (
      <AuthCard title="Join your organization" description="Accept an invite to Padua.">
        <AccountsUnavailable />
      </AuthCard>
    )
  const [invite, session] = await Promise.all([lookupInvite(token), getSession()])

  if (!invite || invite.status !== "pending") {
    const code = !invite ? "invite-invalid" : invite.status === "accepted" ? "invite-accepted" : invite.status === "revoked" ? "invite-revoked" : "invite-expired"
    return (
      <AuthCard title="This invite can't be used" description={refusalText(code)}>
        <p className="text-[14px] text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </AuthCard>
    )
  }

  const access = invite.scope === "organization" ? "the whole organization" : invite.facilityNames.join(", ")
  return (
    <AuthCard
      title={`Join ${invite.organizationName}`}
      description={`${invite.invitedBy ?? "Your organization"} invited you to Padua as ${invite.role === "member" ? "a" : "an"} ${ROLE_TEXT[invite.role].label.toLowerCase()}, with access to ${access}.`}
    >
      {session && (
        <p role="status" className="mb-4 rounded-xl bg-warning/10 px-3 py-2 text-[14px]">
          You&apos;re signed in to another account on this browser. Accepting signs you out of it.
        </p>
      )}
      <AcceptInviteForm token={token} email={invite.email} expiresAt={invite.expiresAt} />
    </AuthCard>
  )
}
