import {
  BarChart3,
  BookOpenText,
  CalendarClock,
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
    href: "/benchmark",
    label: "Benchmark",
    description: "Compare a hospital with its peers",
    icon: BarChart3,
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
