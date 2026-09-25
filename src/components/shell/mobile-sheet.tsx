"use client"

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

// Small screens: a panel folds into a one-line summary bar, and a button on it opens the full panel in a bottom sheet.
// The filter strips (MobileControls) and Benchmark's key findings use it, so both fold away the same way. From md up
// the panel shows inline and this renders nothing.

export function MobileSheet({
  summary,
  trigger,
  triggerLabel,
  title,
  sticky = false,
  done = "Done",
  className,
  children,
}: {
  /** What the bar says while folded. */
  summary: React.ReactNode
  /** The button's content (icon, word, count). */
  trigger: React.ReactNode
  /** The button's accessible name. */
  triggerLabel: string
  title: string
  /** Pinned under the app header (the filter strip); otherwise the bar sits in the page flow. */
  sticky?: boolean
  done?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <DialogPrimitive.Root>
      <div
        className={cn(
          "flex items-center gap-3 md:hidden print:hidden",
          sticky ? "glass-strong sticky top-12 z-20 -mx-4 border-b border-border px-4 py-2" : "glass rounded-2xl px-4 py-2.5",
          className
        )}
      >
        <div className="min-w-0 flex-1">{summary}</div>
        <DialogPrimitive.Trigger
          className="glass-subtle inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={triggerLabel}
        >
          {trigger}
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
            {done}
          </DialogPrimitive.Close>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
