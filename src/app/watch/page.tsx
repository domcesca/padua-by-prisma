import { ScanEye } from "lucide-react"
import type { Metadata } from "next"

import { ComingSoon } from "@/components/shell/coming-soon"

export const metadata: Metadata = { title: "Watch" }

export default function WatchPage() {
  return (
    <ComingSoon
      title="Watch"
      description="Upload your hospital’s own data and see which numbers moved more than they should have."
      icon={ScanEye}
      points={[
        {
          title: "Bring your own extract",
          body: "Upload an internal report or an HCAI filing draft before you submit it.",
        },
        {
          title: "Flag unusual changes",
          body: "Year-over-year moves are compared with your history and your peers’ typical swings.",
        },
        {
          title: "Explain the flag",
          body: "Each flag links to the field’s definition and the most common reasons it moves.",
        },
      ]}
    />
  )
}
