import { ArrowRight, ChartColumnBig, ChartScatter } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { AboutTool } from "@/components/shell/about-tool"
import { PageHeader } from "@/components/shell/page-header"

export const metadata: Metadata = { title: "Build" }

// Build is a landing page for two tools: the report builder (/build/report) and Correlate (/build/correlate). A hospital
// and topic in the link (from the nav) carry through to both. Older /build links with report settings were the report
// builder itself, so they go straight there.

const PASS_THROUGH = new Set(["facility", "category"])

const TOOLS = [
  {
    href: "/build/report",
    icon: ChartColumnBig,
    title: "Build a report",
    body: "Pick measures and years for one hospital, or several side by side, and get a chart or table you can copy or download.",
    example: "e.g. operating margin and occupancy, 2019–2024",
    keep: ["facility", "category"],
    cta: "Open the report builder",
  },
  {
    href: "/build/correlate",
    icon: ChartScatter,
    title: "Correlate",
    body: "See whether two measures move together across a hospital's peers, one dot per hospital. It shows a pattern, not a cause.",
    example: "e.g. are costs high, or are patients just sicker?",
    keep: ["facility"],
    cta: "Open Correlate",
  },
]

export default async function BuildHubPage({ searchParams }: PageProps<"/build">) {
  const sp = await searchParams
  const params = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])))
  if ([...params.keys()].some((k) => !PASS_THROUGH.has(k))) redirect(`/build/report?${params}`)

  const hrefFor = (href: string, keep: string[]) => {
    const q = new URLSearchParams([...params].filter(([k]) => keep.includes(k)))
    return q.size ? `${href}?${q}` : href
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Build" description="Make your own view of the data. Two tools:" actions={<AboutTool id="build" />} />
      <div className="grid gap-4 md:grid-cols-2">
        {TOOLS.map(({ href, icon: Icon, title, body, example, keep, cta }) => (
          <Link
            key={href}
            href={hrefFor(href, keep)}
            className="glass group flex flex-col gap-3 rounded-2xl p-6 transition-shadow duration-200 hover:glow-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="size-5" strokeWidth={1.75} />
            </span>
            <span className="space-y-1.5">
              <span className="block text-[19px] font-semibold tracking-tight">{title}</span>
              <span className="block text-[14px] leading-relaxed text-muted-foreground">{body}</span>
              <span className="block text-[13px] text-tertiary-foreground">{example}</span>
            </span>
            <span className="mt-auto inline-flex items-center gap-1 text-[14px] font-medium text-primary">
              {cta} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
