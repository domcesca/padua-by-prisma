"use client"

import { useId, useState } from "react"

import { cn } from "@/lib/utils"

const grouped = (n: number, decimals: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: decimals, useGrouping: true })

/**
 * A number input for money and counts: shows "1,250,000" at rest, plain digits while editing, and
 * reports a clean number on every keystroke. Empty means 0.
 */
export function NumberField({
  value,
  onChange,
  label,
  hideLabel = false,
  prefix,
  suffix,
  min = 0,
  max = 1e10,
  decimals = 0,
  hint,
  className,
  inputClassName,
  disabled,
}: {
  value: number
  onChange: (n: number) => void
  label: string
  hideLabel?: boolean
  prefix?: string
  suffix?: string
  min?: number
  max?: number
  decimals?: number
  hint?: React.ReactNode
  className?: string
  inputClassName?: string
  disabled?: boolean
}) {
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (value === 0 ? "" : grouped(value, decimals))

  function change(raw: string) {
    const cleaned = raw.replace(/[^\d.\-]/g, "")
    setDraft(raw)
    if (cleaned === "" || cleaned === "-" || cleaned === ".") return onChange(0)
    const n = Number(cleaned)
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)))
  }

  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={id} className={cn("mb-1 block text-[13px] font-medium", hideLabel && "sr-only")}>
        {label}
      </label>
      <div
        className={cn(
          "glass-subtle flex h-10 items-center gap-1 rounded-xl px-3 transition-shadow focus-within:ring-2 focus-within:ring-ring",
          disabled && "opacity-50",
          inputClassName
        )}
      >
        {prefix && <span className="text-sm text-muted-foreground">{prefix}</span>}
        <input
          id={id}
          inputMode={decimals > 0 ? "decimal" : "numeric"}
          autoComplete="off"
          value={shown}
          placeholder="0"
          disabled={disabled}
          onFocus={() => setDraft(value === 0 ? "" : String(value))}
          onBlur={() => setDraft(null)}
          onChange={(e) => change(e.target.value)}
          className="num min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-tertiary-foreground"
        />
        {suffix && <span className="shrink-0 text-sm text-muted-foreground">{suffix}</span>}
      </div>
      {hint && <p className="mt-1 text-xs leading-snug text-muted-foreground">{hint}</p>}
    </div>
  )
}
