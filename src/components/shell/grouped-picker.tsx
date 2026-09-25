"use client"

import { ChevronDown, ChevronRight, X } from "lucide-react"
import { useState } from "react"

import { pillClass } from "@/components/benchmark/filter-pill"
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

// The app's one pattern for long lists (metrics, units): search as you type, with options in
// groups that stay collapsed until opened. Searching shows every match, best first. Used inline
// (Build, the home page) or in a pill's popover (Benchmark, Correlate) via PickerPill.

export type PickerOption = {
  value: string
  label: string
  hint?: string
  /** Heading the option is listed under; options without one are listed first, ungrouped. */
  group?: string
  /** Extra text search matches on (e.g. a metric's one-line summary). */
  keywords?: string[]
}

type PickerProps = {
  /** What's being picked, for the search placeholder and labels ("metrics"). */
  noun: string
  options: PickerOption[]
  selected: string[]
  onChange: (next: string[]) => void
  multiple?: boolean
  /** Multi-select only: most that can be chosen; the rest are disabled once reached. */
  max?: number
  autoFocus?: boolean
  listClassName?: string
}

/** Up to this many choices show as removable chips above the search; more become a "Chosen" group. */
const CHIP_LIMIT = 4
const CHOSEN = "\u0000chosen"

// Every search term must appear in the label, group, or keywords; label matches rank first.
function matchScore(o: PickerOption, terms: string[]) {
  const label = o.label.toLowerCase()
  const hay = [label, o.group ?? "", ...(o.keywords ?? [])].join(" ").toLowerCase()
  if (!terms.every((t) => hay.includes(t))) return 0
  const inLabel = terms.every((t) => label.includes(t))
  if (label.startsWith(terms[0]) || label.includes(` ${terms[0]}`)) return inLabel ? 3 : 2
  return inLabel ? 2 : 1
}

export function GroupedPicker({ noun, options, selected, onChange, multiple = false, max, autoFocus, listClassName }: PickerProps) {
  const [query, setQuery] = useState("")
  const groups = [...new Set(options.map((o) => o.group ?? ""))]
  // One group (or none) is short enough to list as is.
  const collapsible = groups.filter(Boolean).length > 1
  const [openGroups, setOpenGroups] = useState<Set<string>>(() =>
    // A single choice opens on its own group, so the current value is in view.
    multiple ? new Set() : new Set(options.filter((o) => selected.includes(o.value)).map((o) => o.group ?? ""))
  )
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const searching = terms.length > 0
  const scored = new Map(options.map((o) => [o.value, searching ? matchScore(o, terms) : 1]))
  const best = (g: string) => Math.max(0, ...options.filter((o) => (o.group ?? "") === g).map((o) => scored.get(o.value)!))
  const shownGroups = searching ? groups.filter((g) => best(g) > 0).sort((a, b) => best(b) - best(a)) : groups
  const full = multiple && max != null && selected.length >= max
  const byValue = new Map(options.map((o) => [o.value, o]))
  const chosen = selected.map((v) => byValue.get(v)).filter((o): o is PickerOption => !!o)

  function toggle(value: string) {
    if (!multiple) return onChange([value])
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])
  }

  function toggleGroup(group: string) {
    const next = new Set(openGroups)
    if (next.has(group)) next.delete(group)
    else next.add(group)
    setOpenGroups(next)
  }

  const item = (o: PickerOption, indent: boolean, key = o.value) => {
    const on = selected.includes(o.value)
    return (
      <CommandItem
        key={key}
        value={key}
        data-checked={on}
        disabled={full && !on}
        onSelect={() => toggle(o.value)}
        className={cn("data-[checked=true]:*:[svg]:text-primary", indent && "pl-7")}
      >
        <span className="min-w-0 flex-1 truncate">{o.label}</span>
        {o.hint && <span className="shrink-0 text-xs text-muted-foreground">{o.hint}</span>}
      </CommandItem>
    )
  }

  // A group's heading row: opens and closes the group, with how many of its options are chosen.
  const header = (id: string, label: string, count: number | null, chosenCount: number) => {
    const open = openGroups.has(id)
    const Chevron = open ? ChevronDown : ChevronRight
    return (
      <CommandItem
        value={`__group ${id}`}
        aria-expanded={open}
        onSelect={() => toggleGroup(id)}
        // The item's built-in check icon means nothing on a heading.
        className="font-medium [&>svg:last-child]:hidden"
      >
        <Chevron className="size-3.5! text-tertiary-foreground" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {chosenCount > 0 && (
          <span className="rounded-full bg-primary/12 px-1.5 text-[11px] font-medium text-primary">
            {count == null ? chosenCount : `${chosenCount} chosen`}
          </span>
        )}
        {count != null && <span className="text-xs font-normal text-tertiary-foreground">{count}</span>}
      </CommandItem>
    )
  }

  return (
    <Command shouldFilter={false} loop className="p-0">
      {multiple && chosen.length > 0 && chosen.length <= CHIP_LIMIT && (
        <div className="flex flex-wrap gap-1 px-1 pt-1 pb-1.5" aria-label={`Chosen ${noun}`}>
          {chosen.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              className="glass-subtle ring-accent inline-flex h-6 max-w-full items-center gap-1 rounded-full pr-1.5 pl-2.5 text-[12px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label={`Remove ${o.label}`}
            >
              <span className="truncate">{o.label}</span>
              <X className="size-3 shrink-0 opacity-60" />
            </button>
          ))}
        </div>
      )}
      <CommandInput placeholder={`Search ${noun}…`} value={query} onValueChange={setQuery} autoFocus={autoFocus} aria-label={`Search ${noun}`} />
      <CommandList className={cn("mt-1 max-h-72", listClassName)}>
        {searching && shownGroups.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No {noun} match.</p>}
        {multiple && !searching && chosen.length > CHIP_LIMIT && (
          <CommandGroup className="p-0.5">
            {header(CHOSEN, "Chosen", null, chosen.length)}
            {openGroups.has(CHOSEN) && chosen.map((o) => item(o, true, `__chosen ${o.value}`))}
          </CommandGroup>
        )}
        {shownGroups.map((group) => {
          const members = options.filter((o) => (o.group ?? "") === group)
          if (searching) {
            const hits = members.filter((o) => scored.get(o.value)! > 0).sort((a, b) => scored.get(b.value)! - scored.get(a.value)!)
            return (
              <CommandGroup key={group} heading={group || undefined} className="p-0.5">
                {hits.map((o) => item(o, false))}
              </CommandGroup>
            )
          }
          if (!collapsible || !group) {
            return (
              <CommandGroup key={group} className="p-0.5">
                {members.map((o) => item(o, false))}
              </CommandGroup>
            )
          }
          return (
            <CommandGroup key={group} className="p-0.5">
              {header(group, group, members.length, members.filter((o) => selected.includes(o.value)).length)}
              {openGroups.has(group) && members.map((o) => item(o, true))}
            </CommandGroup>
          )
        })}
      </CommandList>
      {full && <p className="px-2 pt-1.5 text-xs text-muted-foreground">That&apos;s the most you can pick; remove one to add another.</p>}
    </Command>
  )
}

/** GroupedPicker in a pill's popover, for toolbars. */
export function PickerPill({
  label,
  summary,
  active: activeOverride,
  wide = false,
  actions,
  ...picker
}: PickerProps & {
  label: string
  /** Text shown in the pill; null shows the label. */
  summary: string | null
  /** Force the highlighted style on/off. */
  active?: boolean
  wide?: boolean
  /** Shortcuts under the list, e.g. "Back to the standard set". */
  actions?: { label: string; onSelect: () => void }[]
}) {
  const [open, setOpen] = useState(false)
  const active = activeOverride ?? summary != null
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={pillClass(active)} aria-label={`${label}: ${summary ?? "choose"}`}>
        <span className={cn(summary != null && "sr-only")}>{label}</span>
        {summary != null && <span className={cn(wide ? "max-w-72" : "max-w-44", "truncate", active && "font-medium")}>{summary}</span>}
        <ChevronDown className="size-3.5 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("max-w-[calc(100vw-2rem)] p-1.5", wide ? "w-80" : "w-72")}>
        <GroupedPicker
          {...picker}
          autoFocus
          onChange={(next) => {
            picker.onChange(next)
            if (!picker.multiple) setOpen(false)
          }}
        />
        {actions?.length ? (
          <div className="flex flex-wrap gap-x-4 border-t border-border px-2 pt-2 pb-1">
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => {
                  a.onSelect()
                  setOpen(false)
                }}
                className="text-[13px] font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {a.label}
              </button>
            ))}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
