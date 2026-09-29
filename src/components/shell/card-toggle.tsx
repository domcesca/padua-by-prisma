"use client"

import { onRadioGroupKeyDown, rovingTabIndex } from "@/lib/radio-group"
import { cn } from "@/lib/utils"

/**
 * A card's small two-way switch in its header: Chart / Table, Percent / Actual. A radio group: one tab stop, arrow
 * keys move and select (lib/radio-group.ts).
 */
export function CardToggle<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  /** Accessible name of the group: "Operating margin view". */
  label: string
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onRadioGroupKeyDown} className="flex rounded-md bg-black/5 p-0.5 dark:bg-white/8">
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          tabIndex={rovingTabIndex(value === o.value, i, true)}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-6 rounded px-2 py-0.5 text-xs font-medium transition-colors duration-150",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            value === o.value ? "bg-card text-foreground shadow-sm dark:bg-white/15" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
