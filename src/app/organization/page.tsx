import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { OrgConsole } from "@/components/organization/org-console"
import { PageHeader } from "@/components/shell/page-header"
import { getFacilityOptions, getLatestYear } from "@/lib/data/store"
import { managesPeople } from "@/lib/org/permissions"
import { getSession } from "@/lib/server/auth/session"
import { getOrganization } from "@/lib/server/org"
import { testHospitalsEnabled } from "@/lib/server/sandbox"

export const metadata: Metadata = { title: "Organization" }

// The organization console (V7.6.5b): owners and admins see and edit the organization's structure here. Members get a
// note instead; the database would refuse their changes anyway.

export default async function OrganizationPage() {
  const session = await getSession()
  if (!session) redirect("/login?next=/organization")
  const org = await getOrganization(session)
  if (!org) redirect("/login?next=/organization")
  const actor = org.people.find((p) => p.id === org.actorId)
  if (!actor) redirect("/login?next=/organization")

  if (!managesPeople(actor))
    return (
      <div className="space-y-6">
        <PageHeader title={org.name} description="Your organization's people and facilities." />
        <div className="widget max-w-2xl p-5 text-[15px] leading-relaxed">
          <p>Your organization&apos;s owners and admins manage this page: who&apos;s in the organization, their roles and access, and who reports to whom.</p>
          <p className="mt-2 text-muted-foreground">
            Your own role and access are on your{" "}
            <Link href="/account" className="font-medium text-primary hover:underline">
              account page
            </Link>
            .
          </p>
        </div>
      </div>
    )

  const [hospitals, latestYear] = await Promise.all([getFacilityOptions(), getLatestYear()])
  return (
    <div className="space-y-6">
      <PageHeader
        title={org.name}
        eyebrow="Organization"
        description="Your organization's facilities and people: invite colleagues, set each person's role and facility access, and who reports to whom."
      />
      <OrgConsole org={org} hospitals={hospitals} latestYear={latestYear} testHospitals={testHospitalsEnabled()} />
    </div>
  )
}
