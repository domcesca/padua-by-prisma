import { CircleAlert, History } from "lucide-react"

import type { FacilityFlag } from "@/lib/facility-flag"
import { cn } from "@/lib/utils"

/** The closed / outdated callout for a hospital card (lib/facility-flag.ts). Prints, since it qualifies the numbers. */
export function FacilityFlagNote({ flag, className }: { flag: FacilityFlag; className?: string }) {
  const Icon = flag.kind === "closed" ? CircleAlert : History
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed print:break-inside-avoid",
        flag.kind === "closed" ? "border border-warning/40 bg-warning/10" : "bg-black/4 dark:bg-white/6",
        className
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", flag.kind === "closed" ? "text-warning" : "text-tertiary-foreground")} aria-hidden />
      <p>
        <span className="font-medium">{flag.title}</span> <span className="text-muted-foreground">{flag.detail}</span>
      </p>
    </div>
  )
}

/** The short badge for pickers and lists. */
export function FacilityFlagBadge({ flag, className }: { flag: FacilityFlag; className?: string }) {
  return (
    <span
      title={flag.title}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-1.5 py-px text-xs leading-4 font-medium",
        flag.kind === "closed" ? "bg-warning/15 text-foreground" : "bg-black/6 text-muted-foreground dark:bg-white/10",
        className
      )}
    >
      {flag.badge}
    </span>
  )
}
