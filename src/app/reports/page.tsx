import { ArrowRight, ChartColumnBig, ChartScatter } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { AboutTool } from "@/components/shell/about-tool"
import { PageHeader } from "@/components/shell/page-header"
import { REPORT_TEMPLATES } from "@/lib/report/templates"

export const metadata: Metadata = { title: "Reports" }

// Reports (Build before V7.2) is a landing page for two tools: the report builder (/reports/build) and Correlate (/reports/correlate). A hospital
// and topic in the link (from the nav) carry through to both. Older /build and /reports links with report settings were the report
// builder itself, so they go straight there.

// The peer group (Benchmark's peer filters) carries through too.
const PEER_KEYS = ["peers", "county", "within", "ownership", "bedsMin", "bedsMax", "teaching", "all"]
const PASS_THROUGH = new Set(["facility", "category", ...PEER_KEYS])

// Correlate is advanced analysis (V7.5): a sibling of the report builder, labeled as the more technical of the two.

const TOOLS = [
  {
    href: "/reports/build",
    icon: ChartColumnBig,
    title: "Build a report",
    eyebrow: null,
    body: "Start from a template or pick measures — financial, utilization, quality, infections — and get charts with a one-line summary each, ready to print or download.",
    example: "e.g. operating margin and occupancy, 2019–2024",
    keep: ["facility", "category", ...PEER_KEYS],
    cta: "Open the report builder",
  },
  {
    href: "/reports/correlate",
    icon: ChartScatter,
    title: "Correlate",
    eyebrow: "Advanced analysis",
    body: "See whether two measures move together across a hospital's peers, one dot per hospital. It shows a pattern, not a cause.",
    example: "e.g. are costs high, or are patients just sicker?",
    keep: ["facility", ...PEER_KEYS],
    cta: "Open Correlate",
  },
]

export default async function BuildHubPage({ searchParams }: PageProps<"/reports">) {
  const sp = await searchParams
  const params = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])))
  if ([...params.keys()].some((k) => !PASS_THROUGH.has(k))) redirect(`/reports/build?${params}`)

  const hrefFor = (href: string, keep: string[]) => {
    const [path, query] = href.split("?")
    const q = new URLSearchParams([...new URLSearchParams(query), ...[...params].filter(([k]) => keep.includes(k))])
    return q.size ? `${path}?${q}` : path
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Reports" description="Make your own view of the data. Two tools:" actions={<AboutTool id="build" />} />
      <div className="grid gap-4 md:grid-cols-2">
        {TOOLS.map(({ href, icon: Icon, title, eyebrow, body, example, keep, cta }) => (
          <Link
            key={href}
            href={hrefFor(href, keep)}
            className="glass group flex flex-col gap-3 rounded-2xl p-6 transition-shadow duration-200 hover:glow-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="size-5" strokeWidth={1.75} />
            </span>
            <span className="space-y-1.5">
              {eyebrow && <span className="block text-xs font-semibold tracking-wide text-tertiary-foreground uppercase">{eyebrow}</span>}
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
      <section aria-labelledby="report-templates" className="space-y-3">
        <h2 id="report-templates" className="text-[15px] font-semibold tracking-tight">
          Or start a report from a template
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {REPORT_TEMPLATES.filter((t) => t.id !== "custom").map((t) => (
            <li key={t.id}>
              <Link
                href={hrefFor(`/reports/build?template=${t.id}`, TOOLS[0].keep)}
                className="glass-subtle flex h-full flex-col gap-1 rounded-xl p-3.5 transition-shadow hover:glow-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="text-[14px] font-medium">{t.label}</span>
                <span className="text-[13px] leading-snug text-muted-foreground">{t.purpose}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
