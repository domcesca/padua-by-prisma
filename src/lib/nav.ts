import {
  BarChart3,
  BookOpenText,
  Calculator,
  CalendarClock,
  ChartColumnBig,
  House,
  NotebookPen,
  type LucideIcon,
} from "lucide-react"

export type NavItem = {
  href: string
  label: string
  description: string
  icon: LucideIcon
  /** The phone tab bar's label on screens under 430px, where the full name won't fit a fifth of the width on one line. */
  shortLabel?: string
  /** Left out of the phone tab bar (it holds six tabs at most); still in the desktop sidebar. */
  desktopOnly?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Overview",
    description: "Your hospital at a glance",
    icon: House,
  },
  {
    href: "/compare",
    label: "Compare",
    description: "Compare a hospital with similar hospitals",
    icon: BarChart3,
  },
  {
    href: "/reports",
    label: "Reports",
    description: "Make a chart or table, or see how two measures relate",
    icon: ChartColumnBig,
  },
  {
    href: "/business-cases",
    label: "Business cases",
    shortLabel: "Business",
    description: "Build the business case for a new initiative",
    icon: Calculator,
  },
  {
    href: "/data-definitions",
    label: "Data definitions",
    shortLabel: "Definitions",
    description: "Plain-language HCAI field guide",
    icon: BookOpenText,
  },
  {
    href: "/filing-calendar",
    label: "Filing calendar",
    description: "HCAI filing due dates",
    icon: CalendarClock,
    desktopOnly: true,
  },
  {
    href: "/briefings",
    label: "Saved briefings",
    description: "Hospital priorities you pinned, checked against the latest data",
    icon: NotebookPen,
    desktopOnly: true,
  },
]

export const isActivePath = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`)
