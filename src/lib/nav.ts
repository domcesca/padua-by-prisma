import {
  BarChart3,
  BookOpenText,
  CalendarClock,
  ChartColumnBig,
  House,
  MessageSquareText,
  ScanEye,
  type LucideIcon,
} from "lucide-react"

export type NavItem = {
  href: string
  label: string
  description: string
  icon: LucideIcon
  soon?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Home",
    description: "Pick what to look at and which hospital",
    icon: House,
  },
  {
    href: "/benchmark",
    label: "Benchmark",
    description: "Compare a hospital with similar hospitals",
    icon: BarChart3,
  },
  {
    href: "/build",
    label: "Build",
    description: "Make a chart or table from the data",
    icon: ChartColumnBig,
  },
  {
    href: "/translate",
    label: "Translate",
    description: "Plain-language HCAI field guide",
    icon: BookOpenText,
  },
  {
    href: "/deadlines",
    label: "Deadlines",
    description: "HCAI reporting calendar",
    icon: CalendarClock,
  },
  {
    href: "/ask",
    label: "Ask",
    description: "Ask questions of the data",
    icon: MessageSquareText,
    soon: true,
  },
  {
    href: "/watch",
    label: "Watch",
    description: "Flag unusual changes in your data",
    icon: ScanEye,
    soon: true,
  },
]

export const isActivePath = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`)
