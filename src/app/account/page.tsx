import { Building2, LogOut, ShieldCheck, UserRound } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { PageHeader } from "@/components/shell/page-header"
import { getAccount, type FacilityScope, type Role } from "@/lib/server/auth/accounts"
import { getSession } from "@/lib/server/auth/session"
import { signOut } from "./actions"

export const metadata: Metadata = { title: "Account" }

// The signed-in admin's account (V7.6.5a): their organization, its facilities, and their access, which has two
// independent parts: role (what they can manage) and facility scope (which hospitals they see). Read-only for now;
// managing people, roles and scopes comes with invites.

const ROLES: Record<Role, { label: string; body: string }> = {
  owner: { label: "Owner", body: "Manages the organization and its people. Every organization has at least one owner." },
  admin: { label: "Admin", body: "Manages the organization and its people." },
  member: { label: "Member", body: "Views and contributes within their facility scope." },
}

const scopeLabel = (scope: FacilityScope, n: number, total: number) =>
  scope === "organization"
    ? `The whole organization: ${total === 1 ? "its one facility" : `all ${total} facilities`}, and any added later`
    : `${n} of the organization's ${total} ${total === 1 ? "facility" : "facilities"}`

const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="text-[15px]">{children}</dd>
    </div>
  )
}

export default async function AccountPage() {
  const session = await getSession()
  if (!session) redirect("/login?next=/account")
  const account = await getAccount(session)
  // A session whose admin no longer exists: treat as signed out.
  if (!account) redirect("/login?next=/account")
  const { admin, organization, facilities, inScope } = account
  const scoped = new Set(inScope)
  const role = ROLES[admin.role]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Account"
        description="Your organization and your access in Padua. The public hospital data is the same for everyone, whatever your access."
        actions={
          <form action={signOut}>
            <button
              type="submit"
              className="glass-subtle inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium hover:bg-white/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:hover:bg-white/10"
            >
              <LogOut className="size-4" aria-hidden />
              Sign out
            </button>
          </form>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="you-title" className="widget p-5">
          <h2 id="you-title" className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
            <UserRound className="size-4 text-primary" aria-hidden />
            You
          </h2>
          <dl className="mt-2 divide-y divide-border/60">
            <Row label="Name">{admin.name}</Row>
            <Row label="Email">{admin.email}</Row>
            <Row label="Member since">{date(admin.createdAt)}</Row>
          </dl>
        </section>

        <section aria-labelledby="access-title" className="widget p-5">
          <h2 id="access-title" className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            Your access
          </h2>
          <dl className="mt-2 divide-y divide-border/60">
            <Row label="Role">
              <span className="font-medium">{role.label}</span>
              <span className="block text-[13px] text-muted-foreground">{role.body}</span>
            </Row>
            <Row label="Facility scope">
              {scopeLabel(admin.facilityScope, inScope.length, facilities.length)}
              <span className="block text-[13px] text-muted-foreground">Which hospitals&apos; organization data you see. Set separately from your role.</span>
            </Row>
          </dl>
        </section>
      </div>

      <section aria-labelledby="org-title" className="widget p-5">
        <h2 id="org-title" className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
          <Building2 className="size-4 text-primary" aria-hidden />
          {organization.name}
        </h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Organization · created {date(organization.createdAt)} · {facilities.length} {facilities.length === 1 ? "facility" : "facilities"}
        </p>
        <ul className="mt-3 divide-y divide-border/60">
          {facilities.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
              <span className="text-[15px] font-medium">{f.name}</span>
              <span className="text-[13px] text-muted-foreground">{scoped.has(f.id) ? "In your scope" : "Outside your scope"}</span>
              {f.hcaiFacilityId && (
                <Link href={`/?facility=${encodeURIComponent(f.hcaiFacilityId)}`} className="ml-auto text-[14px] font-medium text-primary hover:underline">
                  Open in Overview
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="next-title" className="rounded-2xl bg-black/4 p-5 dark:bg-white/6">
        <h2 id="next-title" className="text-[15px] font-semibold">Coming next</h2>
        <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
          Inviting colleagues, adding your organization&apos;s other hospitals, and setting each person&apos;s role and scope. Saved work (business case
          drafts, pinned briefings) still lives in this browser for now.
        </p>
      </section>
    </div>
  )
}
