"use client"

import { cn } from "@/lib/utils"

/** iOS-style segmented control (a radio group). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "md",
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  label: string
  size?: "sm" | "md"
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("glass-subtle inline-flex rounded-full p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full font-medium transition-[background-color,color,box-shadow] duration-200",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            size === "sm" ? "h-7 px-3 text-[12px]" : "h-8 px-4 text-[13px]",
            value === o.value
              ? "surface ring-accent glow-soft text-foreground dark:bg-white/14"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
