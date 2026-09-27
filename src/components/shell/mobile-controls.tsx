"use client"

import { SlidersHorizontal } from "lucide-react"

import { MobileSheet } from "./mobile-sheet"

// Small screens: a tool's filter strip folds into a summary bar that stays pinned under the app header, always showing
// the hospital, the topic, and the data period, with a bottom sheet holding the full controls. From md up the controls
// show inline as before and this renders nothing.

export function MobileControls({
  hospital,
  topic,
  period,
  active = 0,
  title = "View and filters",
  children,
}: {
  hospital: string | null
  /** What's shown: "Utilization · Intensive Care". */
  topic: string
  /** The years the data covers: "Calendar years 2019–2024". */
  period: string | null
  /** How many controls are set away from their defaults. */
  active?: number
  title?: string
  children: React.ReactNode
}) {
  return (
    <MobileSheet
      sticky
      title={title}
      triggerLabel={`${title}${active ? `: ${active} set` : ""}`}
      summary={
        <>
          <p className="truncate text-[13px] leading-tight font-semibold">{hospital ?? "No hospital chosen"}</p>
          <p className="truncate text-xs leading-tight text-muted-foreground">
            {topic}
            {period && <> · {period}</>}
          </p>
        </>
      }
      trigger={
        <>
          <SlidersHorizontal className="size-3.5" aria-hidden />
          Filters
          {active > 0 && (
            <span className="num rounded-full bg-primary px-1.5 text-xs leading-5 text-primary-foreground" aria-hidden>
              {active}
            </span>
          )}
        </>
      }
    >
      {children}
    </MobileSheet>
  )
}
