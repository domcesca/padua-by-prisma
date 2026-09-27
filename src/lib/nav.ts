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
  /** Left out of the phone tab bar (it holds six tabs at most); still in the desktop sidebar. */
  desktopOnly?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Overview",
    description: "Pick what to look at and which hospital",
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
    description: "Build the business case for a new initiative",
    icon: Calculator,
  },
  {
    href: "/data-definitions",
    label: "Data definitions",
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
