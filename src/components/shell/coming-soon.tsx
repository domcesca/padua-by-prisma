import type { LucideIcon } from "lucide-react"

import { PageHeader } from "./page-header"

export function ComingSoon({
  title,
  description,
  icon: Icon,
  points,
}: {
  title: string
  description: string
  icon: LucideIcon
  points: { title: string; body: string }[]
}) {
  return (
    <div className="space-y-8">
      <PageHeader title={title} description={description} />
      <section className="glass rounded-2xl p-8 sm:p-12">
        <div className="mx-auto flex max-w-lg flex-col items-center text-center">
          <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="size-6" strokeWidth={1.75} />
          </div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Coming soon</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">We&apos;re building this next.</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
            Here&apos;s what it will do. In the meantime, Benchmark and Translate cover the same data.
          </p>
        </div>
        <ul className="mx-auto mt-10 grid max-w-3xl gap-6 sm:grid-cols-3">
          {points.map((p) => (
            <li key={p.title} className="space-y-1">
              <p className="text-sm font-medium">{p.title}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
