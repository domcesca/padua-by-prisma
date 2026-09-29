"use client"

import { useRef, useState } from "react"

import { cn } from "@/lib/utils"

// Keyboard access to chart tooltips, shared by every chart (Compare's trends, Reports, Correlate, Business cases). The
// chart itself stays aria-hidden (its table view is the screen-reader version); this wrapper is one tab stop around it.
// Focusing it shows the tooltip on a data point, as hovering would; the arrow keys step to the previous or next point
// (Home and End jump to the first and last), and Escape hides the tooltip. What the tooltip says is also announced, so
// a screen reader hears each point as it's reached. A mouse still works as before and wins while it's over the chart.
//
// Charts drive their tooltip from the index: Recharts through <Tooltip defaultIndex>, others by showing their own.

const NEXT = new Set(["ArrowRight", "ArrowDown"])
const PREV = new Set(["ArrowLeft", "ArrowUp"])

export function KeyboardChart({
  label,
  count,
  noun,
  describe,
  start = "last",
  className,
  children,
}: {
  /** What the chart shows, e.g. "Operating margin, 2019 to 2024". */
  label: string
  /** How many points the keys step through. */
  count: number
  /** What a step moves between, for the instructions: "years", "hospitals". */
  noun: string
  /** The tooltip's content as one sentence, for the announcement. */
  describe: (index: number) => string
  /** The point shown first on focus: the latest (a trend) or the first (a ranking). */
  start?: "first" | "last"
  className?: string
  children: (active: number | null) => React.ReactNode
}) {
  const [active, setActive] = useState<number | null>(null)
  const pointer = useRef(false)
  const clamp = (i: number) => Math.min(Math.max(i, 0), count - 1)

  function onKeyDown(e: React.KeyboardEvent) {
    if (!count) return
    let next: number | null | undefined
    if (NEXT.has(e.key)) next = active == null ? (start === "last" ? count - 1 : 0) : clamp(active + 1)
    else if (PREV.has(e.key)) next = active == null ? (start === "last" ? count - 1 : 0) : clamp(active - 1)
    else if (e.key === "Home") next = 0
    else if (e.key === "End") next = count - 1
    else if (e.key === "Escape" && active != null) next = null
    if (next === undefined) return
    e.preventDefault()
    setActive(next)
  }

  return (
    <div
      role="group"
      aria-roledescription="chart"
      aria-label={`${label}. Use the arrow keys to step through the ${noun}.`}
      tabIndex={count ? 0 : -1}
      onKeyDown={onKeyDown}
      // A click focuses the chart too; only keyboard focus opens a tooltip (the mouse has its own).
      onPointerDown={() => (pointer.current = true)}
      onFocus={() => {
        if (!pointer.current && count) setActive(clamp(start === "last" ? count - 1 : 0))
        pointer.current = false
      }}
      onBlur={() => setActive(null)}
      className={cn("relative rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card", className)}
    >
      {children(active != null && active < count ? active : null)}
      <p className="sr-only" aria-live="polite" aria-atomic>
        {active != null && active < count ? describe(active) : ""}
      </p>
    </div>
  )
}
