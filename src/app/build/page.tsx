import { ChartColumnBig } from "lucide-react"
import type { Metadata } from "next"

import { ComingSoon } from "@/components/shell/coming-soon"

export const metadata: Metadata = { title: "Build" }

export default function BuildPage() {
  return (
    <ComingSoon
      title="Build"
      description="Make a chart or table from a defined list of financial and utilization metrics."
      icon={ChartColumnBig}
      points={[
        { title: "Pick metrics", body: "From the same catalog Benchmark uses." },
        { title: "Pick a chart", body: "Bar, line, or a simple table." },
        { title: "Group it", body: "By hospital, by year, or by peer group." },
      ]}
    />
  )
}
