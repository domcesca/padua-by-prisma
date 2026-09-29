"use client"

import { ChevronsUpDown, Search } from "lucide-react"
import { useEffect, useState } from "react"

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { FacilityFlagBadge } from "@/components/shell/facility-flag-note"
import type { Ownership } from "@/lib/data/types"
import { facilityFlag, type FacilityClosure } from "@/lib/facility-flag"
import { cn } from "@/lib/utils"
import { pillClass } from "./filter-pill"

export type FacilityOption = {
  id: string
  name: string
  formerNames: string[]
  county: string | null
  city: string | null
  licensedBeds: number | null
  typeOfCare: string | null
  hospitalType: string | null
  /** For the peer-group presets (lib/benchmark/cohorts.ts). */
  ownership: Ownership
  teaching: boolean
  rural: boolean
  lastYear: number
  /** Closure evidence from the state's license listing (lib/facility-flag.ts). */
  closure: FacilityClosure | null
}

/** What cmdk matches a hospital on: its name, city, county, former names and id. */
const searchValue = (f: FacilityOption) => [f.name, f.city, f.county, ...f.formerNames, f.id].filter(Boolean).join(" ")

/** Every search word must appear; a match at the start ranks first. */
function matchScore(itemValue: string, search: string) {
  const terms = search.toLowerCase().split(/\s+/).filter(Boolean)
  const hay = itemValue.toLowerCase()
  return terms.every((t) => hay.includes(t)) ? (hay.startsWith(terms[0] ?? "") ? 1 : 0.5) : 0
}

export function FacilityPicker({
  facilities,
  value,
  onChange,
  latestYear,
  placeholder = "Search hospitals by name, city, or county",
  variant = "field",
  className,
}: {
  facilities: FacilityOption[]
  value: string | null
  onChange: (id: string) => void
  latestYear: number
  placeholder?: string
  /**
   * field: the full-width search box (Home, forms). pill: the context bar's compact pill, on exactly the same surface
   * as the bar's other pills (filter-pill.tsx's pillClass). The heavier .glass surface nested inside the bar's own
   * glass layer drew with square corners in Safari, so the pill doesn't use it.
   */
  variant?: "field" | "pill"
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [announced, setAnnounced] = useState("")
  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      const n = search.trim() ? facilities.filter((f) => matchScore(searchValue(f), search) > 0).length : facilities.length
      setAnnounced(n === 0 ? "No hospitals match." : `${n.toLocaleString("en-US")} hospital${n === 1 ? "" : "s"}${search.trim() ? " match" : ""}. Use the arrow keys to choose.`)
    }, 500)
    return () => clearTimeout(timer)
  }, [search, open, facilities])
  const selected = facilities.find((f) => f.id === value) ?? null
  const selectedFlag = selected ? facilityFlag(selected, latestYear) : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          variant === "pill"
            ? cn(pillClass(open), "min-w-0 max-w-[20rem] overflow-hidden text-left font-medium")
            : cn(
                "glass flex h-11 w-full min-w-0 items-center gap-2.5 rounded-xl px-3.5 text-left transition-shadow duration-200",
                "hover:glow-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[popup-open]:glow-soft"
              ),
          className
        )}
        aria-label={selected ? `Hospital: ${selected.name}. Change hospital` : "Choose a hospital"}
      >
        <Search className={cn("shrink-0 text-tertiary-foreground", variant === "pill" ? "size-3.5" : "size-4")} />
        <span className={cn("flex-1 truncate", variant === "pill" ? "text-[13px]" : "text-[15px]", !selected && "text-muted-foreground")}>
          {selected ? selected.name : placeholder}
        </span>
        {selectedFlag && <FacilityFlagBadge flag={selectedFlag} />}
        <ChevronsUpDown className={cn("shrink-0 text-tertiary-foreground", variant === "pill" ? "size-3.5" : "size-4")} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) min-w-80 p-0">
        <Command
          label="Hospital search"
          // cmdk ranks on `value`, which includes city, county, and former names.
          filter={matchScore}
        >
          <CommandInput placeholder="Hospital, city, or county…" autoFocus value={search} onValueChange={setSearch} />
          {/* The combobox doesn't say how many results a search leaves; this does, once typing pauses. */}
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {announced}
          </p>
          <CommandList className="max-h-80">
            <CommandEmpty>No hospitals match.</CommandEmpty>
            <CommandGroup>
              {facilities.map((f) => {
                const flag = facilityFlag(f, latestYear)
                return (
                <CommandItem
                  key={f.id}
                  value={searchValue(f)}
                  onSelect={() => {
                    onChange(f.id)
                    setOpen(false)
                  }}
                  data-checked={f.id === value}
                  className="items-start py-2 data-[checked=true]:*:[svg]:text-primary"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm">
                      <span className="truncate">{f.name}</span>
                      {flag && <FacilityFlagBadge flag={flag} />}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[f.city, f.county && `${f.county} County`].filter(Boolean).join(" · ")}
                      {f.licensedBeds != null && ` · ${f.licensedBeds} beds`}
                      {f.lastYear < latestYear && ` · last reported ${f.lastYear}`}
                    </p>
                  </div>
                </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
