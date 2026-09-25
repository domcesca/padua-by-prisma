"use client"

import { ChevronDown } from "lucide-react"
import { useState } from "react"

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

type Option = { value: string; label: string; hint?: string; /** Options sharing a group are listed under it as a heading. */ group?: string }

export const pillClass = (active: boolean) =>
  cn(
    "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] whitespace-nowrap transition-[background-color,box-shadow] duration-200",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
    // Active filters get the accent hairline and a soft glow; resting ones are quiet glass.
    active
      ? "glass-subtle ring-accent glow-soft text-foreground"
      : "glass-subtle text-foreground hover:bg-white/80 dark:hover:bg-white/10"
  )

/** A pill-shaped filter that opens a searchable, optionally multi-select list. */
export function FilterPill({
  label,
  summary,
  options,
  selected,
  onChange,
  multiple = false,
  searchable = false,
  quickActions,
  footer,
  active: activeOverride,
  wide = false,
}: {
  label: string
  /** Text shown in the pill when something is selected. */
  summary: string | null
  options: Option[]
  selected: string[]
  onChange: (next: string[]) => void
  multiple?: boolean
  searchable?: boolean
  quickActions?: { label: string; onSelect: () => void }[]
  footer?: React.ReactNode
  /** Force the highlighted style on/off (e.g. a non-default value that still shows a summary). */
  active?: boolean
  /** A wider list, for long option labels. */
  wide?: boolean
}) {
  const [open, setOpen] = useState(false)
  const active = activeOverride ?? summary != null

  function toggle(value: string) {
    if (!multiple) {
      onChange([value])
      setOpen(false)
      return
    }
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={pillClass(active)} aria-label={`${label}: ${summary ?? "any"}`}>
        <span className={cn(summary != null && "sr-only")}>{label}</span>
        {summary != null && <span className={cn(wide ? "max-w-72" : "max-w-44", "truncate", active && "font-medium")}>{summary}</span>}
        <ChevronDown className="size-3.5 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("p-0", wide ? "w-80" : "w-64")}>
        <Command>
          {searchable && <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />}
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            {(quickActions?.length || (multiple && selected.length > 0)) && (
              <>
                <CommandGroup>
                  {quickActions?.map((a) => (
                    <CommandItem
                      key={a.label}
                      value={`__action ${a.label}`}
                      onSelect={() => {
                        a.onSelect()
                        setOpen(false)
                      }}
                      className="text-primary"
                    >
                      {a.label}
                    </CommandItem>
                  ))}
                  {multiple && selected.length > 0 && (
                    <CommandItem value="__action clear" onSelect={() => onChange([])} className="text-muted-foreground">
                      Clear selection
                    </CommandItem>
                  )}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            {[...new Set(options.map((o) => o.group))].map((group) => (
              <CommandGroup key={group ?? ""} heading={group}>
                {options
                  .filter((o) => o.group === group)
                  .map((o) => (
                    <CommandItem
                      key={o.value}
                      value={`${o.label} ${o.group ?? ""} ${o.value}`}
                      data-checked={selected.includes(o.value)}
                      onSelect={() => toggle(o.value)}
                      className="data-[checked=true]:*:[svg]:text-primary"
                    >
                      <span className="flex-1 truncate">{o.label}</span>
                      {o.hint && <span className="text-xs text-muted-foreground">{o.hint}</span>}
                    </CommandItem>
                  ))}
              </CommandGroup>
            ))}
          </CommandList>
          {footer && <div className="border-t border-border p-2">{footer}</div>}
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function TogglePill({
  label,
  pressed,
  onPressedChange,
}: {
  label: string
  pressed: boolean
  onPressedChange: (next: boolean) => void
}) {
  return (
    <button type="button" aria-pressed={pressed} onClick={() => onPressedChange(!pressed)} className={pillClass(pressed)}>
      {label}
    </button>
  )
}
