import type { Metadata } from "next"

import { BriefingView } from "@/components/briefing/briefing-view"
import { PageHeader } from "@/components/shell/page-header"

export const metadata: Metadata = { title: "Saved briefings" }

export default function BriefingPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Saved briefings"
        description="Findings you pinned, checked against the latest data: whether each is still a hospital priority, and whether its score moved. Pins stay in this browser only."
      />
      <BriefingView />
    </div>
  )
}
