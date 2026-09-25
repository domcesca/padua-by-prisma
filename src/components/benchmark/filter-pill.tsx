"use client"

import { ChevronDown } from "lucide-react"
import { useState } from "react"

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

type Option = { value: string; label: string; hint?: string }

const pillClass = (active: boolean) =>
  cn(
    "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] whitespace-nowrap transition-colors duration-150",
    "ring-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
    active
      ? "bg-primary/10 text-primary ring-primary/20 dark:bg-primary/20"
      : "bg-card text-foreground ring-black/8 hover:bg-muted dark:ring-white/12"
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
        {summary != null && <span className={cn("max-w-44 truncate", active && "font-medium")}>{summary}</span>}
        <ChevronDown className="size-3.5 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
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
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.value}`}
                  data-checked={selected.includes(o.value)}
                  onSelect={() => toggle(o.value)}
                  className="data-[checked=true]:*:[svg]:text-primary"
                >
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="text-xs text-muted-foreground">{o.hint}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
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
