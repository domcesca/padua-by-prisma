"use client"

import { CircleUserRound } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { isActivePath, NAV_ITEMS } from "@/lib/nav"
import { hrefWithSelection, useSelection } from "@/lib/selection"
import { APP_BYLINE, APP_FULL_NAME, APP_NAME } from "@/lib/brand"
import { cn } from "@/lib/utils"
import { PaduaMark } from "./padua-mark"
import { ThemeToggle } from "./theme-toggle"

/** Compact title bar shown above the content on small screens. */
export function MobileHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-sidebar-border bg-sidebar px-4 backdrop-blur-2xl backdrop-saturate-150 md:hidden print:hidden">
      <Link href="/" aria-label={`${APP_FULL_NAME}: home`} className="flex items-center gap-2 text-[16px] font-semibold tracking-tight">
        <PaduaMark size={22} />
        <span className="whitespace-nowrap">
          {APP_NAME} <span className="text-[12px] font-medium tracking-normal text-primary">{APP_BYLINE}</span>
        </span>
      </Link>
      <div className="flex items-center gap-1">
        <Link
          href="/account"
          aria-label="Account"
          className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-black/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:hover:bg-white/10"
        >
          <CircleUserRound className="size-5" aria-hidden />
        </Link>
        <ThemeToggle />
      </div>
    </header>
  )
}

/** iOS-style bottom tab bar; desktop-only sections are left to the desktop sidebar. */
export function MobileTabBar() {
  const pathname = usePathname()
  const selection = useSelection()
  const items = NAV_ITEMS.filter((i) => !i.desktopOnly)
  return (
    <nav
      data-tour="nav"
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl backdrop-saturate-150 md:hidden print:hidden"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map(({ href, label, shortLabel, icon: Icon }) => {
          const active = isActivePath(pathname, href)
          return (
            <li key={href}>
              <Link
                href={hrefWithSelection(href, selection)}
                aria-current={active ? "page" : undefined}
                aria-label={shortLabel ? label : undefined}
                data-tour={`nav-${href.slice(1) || "overview"}`}
                className={cn(
                  "relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-tertiary-foreground"
                )}
              >
                {active && (
                  <span aria-hidden className="absolute top-0 left-1/2 h-[3px] w-8 -translate-x-1/2 rounded-b-full bg-[image:var(--accent-gradient)]" />
                )}
                <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
                {/* One line always: a two-word name ("Business cases") shows its short form below 430px. */}
                {shortLabel ? (
                  <>
                    <span className="whitespace-nowrap min-[430px]:hidden">{shortLabel}</span>
                    <span className="hidden whitespace-nowrap min-[430px]:inline">{label}</span>
                  </>
                ) : (
                  <span className="whitespace-nowrap">{label}</span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
