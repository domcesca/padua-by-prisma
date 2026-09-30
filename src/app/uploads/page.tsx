import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { PageHeader } from "@/components/shell/page-header"
import { UploadForm, UploadList } from "@/components/uploads/uploads"
import { getSession } from "@/lib/server/auth/session"
import { listUploads } from "@/lib/server/uploads"

export const metadata: Metadata = { title: "My uploads" }

// Private uploads (V7.6.5d): your own files, which no one else in Padua can see, including your organization's
// owners and whoever you report to.

export default async function UploadsPage() {
  const session = await getSession()
  if (!session?.adminId) redirect("/login?next=/uploads")
  const uploads = await listUploads(session)
  return (
    <div className="space-y-6">
      <PageHeader
        title="My uploads"
        eyebrow="Your data"
        description="Files you bring to Padua. They're private to you: no one else can see them, including your organization's owners and whoever you report to."
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr] lg:items-start">
        <UploadForm />
        <UploadList uploads={uploads} />
      </div>
    </div>
  )
}
