import type { Metadata } from "next"

import { BriefingView } from "@/components/briefing/briefing-view"
import { PageHeader } from "@/components/shell/page-header"

export const metadata: Metadata = { title: "Briefing" }

export default function BriefingPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Briefing"
        description="Key findings you pinned, checked against the latest data: whether each is still a key finding, and whether its score moved. Pins stay in this browser only."
      />
      <BriefingView />
    </div>
  )
}
