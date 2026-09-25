"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { isActivePath, NAV_ITEMS } from "@/lib/nav"
import { hrefWithSelection, useSelection } from "@/lib/selection"
import { APP_FULL_NAME, APP_NAME } from "@/lib/brand"
import { cn } from "@/lib/utils"
import { PaduaMark } from "./padua-mark"
import { ThemeToggle } from "./theme-toggle"

export function Sidebar() {
  const pathname = usePathname()
  const selection = useSelection()

  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar backdrop-blur-2xl backdrop-saturate-150 md:flex print:hidden">
      <div className="px-5 pt-6 pb-5">
        <Link
          href="/"
          aria-label={`${APP_FULL_NAME}: home`}
          className="flex items-center gap-2.5 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <PaduaMark size={30} />
          <span>
            <span className="block text-[17px] leading-tight font-semibold tracking-tight">{APP_NAME}</span>
            <span className="block text-xs text-muted-foreground">{APP_FULL_NAME}</span>
          </span>
        </Link>
      </div>

      <nav aria-label="Sections" className="flex-1 px-3">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon, soon }) => {
            const active = isActivePath(pathname, href)
            return (
              <li key={href}>
                <Link
                  href={hrefWithSelection(href, selection)}
                  aria-current={active ? "page" : undefined}
                  data-tour={`nav-${label.toLowerCase()}`}
                  className={cn(
                    "group relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-[background-color,color,box-shadow] duration-200",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    active
                      ? "glass-subtle glow-soft font-medium text-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                  )}
                >
                  {active && (
                    <span aria-hidden className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-[image:var(--accent-gradient)]" />
                  )}
                  <Icon
                    className={cn(
                      "size-4 shrink-0",
                      active ? "text-primary" : "text-tertiary-foreground group-hover:text-muted-foreground"
                    )}
                    strokeWidth={2}
                  />
                  <span className="flex-1">{label}</span>
                  {soon && (
                    <span className="rounded-full bg-black/5 px-1.5 py-px text-[10px] font-medium tracking-wide text-muted-foreground uppercase dark:bg-white/10">
                      Soon
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="flex items-center justify-between gap-2 border-t border-sidebar-border px-5 py-4">
        <p className="text-[11px] leading-tight text-tertiary-foreground">
          Source: HCAI via
          <br />
          CalHHS Open Data
        </p>
        <ThemeToggle />
      </div>
    </aside>
  )
}
