import { ArrowRight, BarChart3, Calculator, CalendarClock, ChartColumnBig, type LucideIcon } from "lucide-react"
import Link from "next/link"

// Common actions: shortcuts to the main jobs, each opening its tool on this hospital (and, where the tool has one,
// the same peer group). Navigation only.

export function CommonActions({ facilityId, peerQuery }: { facilityId: string; peerQuery: string }) {
  const withPeers = (path: string) => `${path}?${new URLSearchParams([["facility", facilityId], ...new URLSearchParams(peerQuery)])}`
  const actions: { href: string; icon: LucideIcon; title: string; body: string }[] = [
    { href: withPeers("/compare"), icon: BarChart3, title: "Compare performance", body: "Every measure against the peer group, topic by topic." },
    { href: withPeers("/reports/build"), icon: ChartColumnBig, title: "Build a report", body: "A chart or table of the measures you pick, to copy or download." },
    { href: `/business-cases?facility=${facilityId}`, icon: Calculator, title: "Prepare a business case", body: "Payback, ROI and NPV for a new initiative." },
    { href: `/filing-calendar?facility=${facilityId}`, icon: CalendarClock, title: "Review filing dates", body: "Every HCAI due date, with extensions and what you've filed." },
  ]
  return (
    <section aria-labelledby="common-actions" className="space-y-3">
      <h2 id="common-actions" className="px-1 text-[17px] font-semibold tracking-tight">
        Common actions
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map(({ href, icon: Icon, title, body }) => (
          <li key={title}>
            <Link
              href={href}
              className="widget group flex h-full flex-col gap-1.5 p-4 transition-shadow duration-200 outline-none hover:glow-soft focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon className="size-5 text-primary" strokeWidth={1.75} aria-hidden />
              <span className="flex items-center gap-1 text-[15px] font-semibold tracking-tight">
                {title}
                <ArrowRight className="size-3.5 text-primary opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
              </span>
              <span className="text-[13px] leading-snug text-muted-foreground">{body}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
