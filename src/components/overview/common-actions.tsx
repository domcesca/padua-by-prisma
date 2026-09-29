import { ArrowRight, BarChart3, Calculator, CalendarClock, ChartColumnBig, type LucideIcon } from "lucide-react"
import Link from "next/link"

// Common actions (V7.5.5: in Overview's sidebar, the page footer on phones): shortcuts to the main jobs, each opening
// its tool on this hospital (and, where the tool has one, the same peer group). Navigation only.

export function CommonActions({ facilityId, peerQuery }: { facilityId: string; peerQuery: string }) {
  const withPeers = (path: string) => `${path}?${new URLSearchParams([["facility", facilityId], ...new URLSearchParams(peerQuery)])}`
  const actions: {
    href: string
    icon: LucideIcon
    title: string
    body: string
  }[] = [
    {
      href: withPeers("/compare"),
      icon: BarChart3,
      title: "Compare performance",
      body: "Every measure against the peer group.",
    },
    {
      href: withPeers("/reports/build"),
      icon: ChartColumnBig,
      title: "Build a report",
      body: "A chart or table of the measures you pick.",
    },
    {
      href: `/business-cases?facility=${facilityId}`,
      icon: Calculator,
      title: "Prepare a business case",
      body: "Payback, ROI and NPV for an initiative.",
    },
    {
      href: `/filing-calendar?facility=${facilityId}`,
      icon: CalendarClock,
      title: "Review filing dates",
      body: "Every HCAI due date and what you've filed.",
    },
  ]
  return (
    <section aria-labelledby="common-actions" className="widget space-y-2 p-4">
      <h2 id="common-actions" className="text-[15px] font-semibold tracking-tight">
        Common actions
      </h2>
      <ul className="-mx-1.5 grid gap-0.5 sm:grid-cols-2 lg:grid-cols-1">
        {actions.map(({ href, icon: Icon, title, body }) => (
          <li key={title}>
            <Link
              href={href}
              className="group flex gap-2.5 rounded-lg px-1.5 py-2 outline-none hover:bg-black/4 focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-white/6"
            >
              <Icon className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={1.75} aria-hidden />
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-[14px] font-medium">
                  {title}
                  <ArrowRight className="size-3.5 text-primary opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                </span>
                <span className="block text-xs leading-snug text-muted-foreground">{body}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
