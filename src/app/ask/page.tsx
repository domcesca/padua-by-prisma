import { MessageSquareText } from "lucide-react"
import type { Metadata } from "next"

import { ComingSoon } from "@/components/shell/coming-soon"

export const metadata: Metadata = { title: "Ask" }

export default function AskPage() {
  return (
    <ComingSoon
      title="Ask"
      description="Ask a question about California hospitals in plain English and get a chart or table back."
      icon={MessageSquareText}
      points={[
        {
          title: "Plain-English questions",
          body: "“Which district hospitals in the Central Valley had positive margins three years running?”",
        },
        {
          title: "Answers you can check",
          body: "Every answer shows the fields and filters it used, linked to their definitions in Translate.",
        },
        {
          title: "Charts, not paragraphs",
          body: "Results come back as the same clean charts and tables used in Benchmark, ready to export.",
        },
      ]}
    />
  )
}
