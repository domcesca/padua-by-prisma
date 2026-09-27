import { MessageSquareText, ScanEye, type LucideIcon } from "lucide-react"
import type { Metadata } from "next"

import { PageHeader } from "@/components/shell/page-header"

export const metadata: Metadata = { title: "What's next" }

// Tools being built, kept out of the main navigation until they work. Linked from the sidebar footer; the old /ask and
// /watch addresses redirect here (next.config.ts).

const PLANNED: { title: string; description: string; icon: LucideIcon; points: { title: string; body: string }[] }[] = [
  {
    title: "Ask",
    description: "Ask a question about California hospitals in plain English and get a chart or table back.",
    icon: MessageSquareText,
    points: [
      {
        title: "Plain-English questions",
        body: "“Which district hospitals in the Central Valley had positive margins three years running?”",
      },
      {
        title: "Answers you can check",
        body: "Every answer shows the fields and filters it used, linked to their definitions in Data definitions.",
      },
      {
        title: "Charts, not paragraphs",
        body: "Results come back as the same clean charts and tables used in Compare, ready to export.",
      },
    ],
  },
  {
    title: "Watch",
    description: "Upload your hospital’s own data and see which numbers moved more than they should have.",
    icon: ScanEye,
    points: [
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
    ],
  },
]

export default function WhatsNextPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="What's next"
        description="Tools we're building. In the meantime, Compare and Data definitions cover the same data."
      />
      {PLANNED.map(({ title, description, icon: Icon, points }) => (
        <section key={title} aria-labelledby={`next-${title}`} className="glass rounded-2xl p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="size-5" strokeWidth={1.75} />
            </div>
            <div className="space-y-1">
              <h2 id={`next-${title}`} className="text-lg font-semibold tracking-tight">
                {title}
              </h2>
              <p className="text-[15px] leading-relaxed text-muted-foreground">{description}</p>
            </div>
          </div>
          <ul className="mt-6 grid gap-6 sm:grid-cols-3">
            {points.map((p) => (
              <li key={p.title} className="space-y-1">
                <p className="text-sm font-medium">{p.title}</p>
                <p className="text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
