"use client"

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { SlidersHorizontal, X } from "lucide-react"

import { cn } from "@/lib/utils"

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
    <DialogPrimitive.Root>
      <div className="glass-strong sticky top-12 z-20 -mx-4 flex items-center gap-3 border-b border-border px-4 py-2 md:hidden print:hidden">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] leading-tight font-semibold">{hospital ?? "No hospital chosen"}</p>
          <p className="truncate text-xs leading-tight text-muted-foreground">
            {topic}
            {period && <> · {period}</>}
          </p>
        </div>
        <DialogPrimitive.Trigger
          className="glass-subtle inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={`${title}${active ? `: ${active} set` : ""}`}
        >
          <SlidersHorizontal className="size-3.5" aria-hidden />
          Filters
          {active > 0 && (
            <span className="num rounded-full bg-primary px-1.5 text-xs leading-5 text-primary-foreground" aria-hidden>
              {active}
            </span>
          )}
        </DialogPrimitive.Trigger>
      </div>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/25 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup
          className={cn(
            "glass-strong fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] outline-none",
            "data-open:animate-in data-open:slide-in-from-bottom data-closed:animate-out data-closed:slide-out-to-bottom"
          )}
        >
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-black/15 dark:bg-white/20" aria-hidden />
          <div className="mb-3 flex items-center justify-between gap-2">
            <DialogPrimitive.Title className="text-[15px] font-semibold tracking-tight">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Close"
              className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="space-y-3">{children}</div>
          <DialogPrimitive.Close className="btn-accent mt-4 h-10 w-full rounded-full text-[15px] font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            Done
          </DialogPrimitive.Close>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
