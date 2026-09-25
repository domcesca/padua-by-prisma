import { CircleAlert } from "lucide-react"

import { QUALITY_FLAGS, type QualityFlag } from "@/lib/status"
import { cn } from "@/lib/utils"

// One predictable status line per metric card (lib/status.ts): data through · period type · published · processed ·
// audit status, then any quality flags in words. Replaces the per-card footnotes it gathers up.

export type StatusLineProps = {
  /** The period the value covers: "2024", "Jul 2021–Jun 2024". Null when there's no value. */
  through: string | null
  /** "Calendar year", "Report year (hospital fiscal year)", … */
  periodType: string
  /** "Published Oct 2025" or "Source updated Aug 2026". */
  published?: string | null
  /** "Processed Sep 25, 2026". */
  processed?: string | null
  audit?: string | null
  /** Anything else about coverage, e.g. "2025 not yet published". */
  note?: string | null
  flags?: QualityFlag[]
  /** Extra detail for a flag (why the record is matched, which years aren't out yet). */
  flagDetail?: Partial<Record<QualityFlag, string>>
  className?: string
}

export function StatusLine({ through, periodType, published, processed, audit, note, flags = [], flagDetail = {}, className }: StatusLineProps) {
  const parts = [
    through ? `Data through ${through}` : null,
    periodType,
    published,
    processed,
    audit,
    note,
  ].filter((p): p is string => !!p)
  return (
    <div className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-snug text-muted-foreground", className)}>
      <p className="sr-only">Data status:</p>
      <p>
        {parts.map((p, i) => (
          <span key={p}>
            {i > 0 && <span aria-hidden> · </span>}
            {p}
            {i < parts.length - 1 && <span className="sr-only">;</span>}
          </span>
        ))}
      </p>
      {flags.map((f) => {
        const detail = flagDetail[f] ?? QUALITY_FLAGS[f].meaning
        return (
          <span
            key={f}
            title={detail}
            className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-px text-xs font-medium text-foreground"
          >
            <CircleAlert className="size-3 shrink-0 text-warning" aria-hidden />
            {QUALITY_FLAGS[f].label}
            <span className="sr-only">: {detail}</span>
          </span>
        )
      })}
    </div>
  )
}
