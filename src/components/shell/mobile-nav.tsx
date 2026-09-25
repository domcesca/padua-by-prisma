"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { isActivePath, NAV_ITEMS } from "@/lib/nav"
import { hrefWithSelection, useSelection } from "@/lib/selection"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "./theme-toggle"

/** Compact title bar shown above the content on small screens. */
export function MobileHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-sidebar-border bg-sidebar px-4 backdrop-blur-xl md:hidden">
      <Link href="/" className="text-[15px] font-semibold tracking-tight">
        HCAI Insights
      </Link>
      <ThemeToggle />
    </header>
  )
}

/** iOS-style bottom tab bar; "coming soon" sections are left to the desktop sidebar. */
export function MobileTabBar() {
  const pathname = usePathname()
  const selection = useSelection()
  const items = NAV_ITEMS.filter((i) => !i.soon)
  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActivePath(pathname, href)
          return (
            <li key={href}>
              <Link
                href={hrefWithSelection(href, selection)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-tertiary-foreground"
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
