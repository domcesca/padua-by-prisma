"use client"

import { ChevronsUpDown, Search } from "lucide-react"
import { useState } from "react"

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { FacilityFlagBadge } from "@/components/shell/facility-flag-note"
import { facilityFlag, type FacilityClosure } from "@/lib/facility-flag"
import { cn } from "@/lib/utils"

export type FacilityOption = {
  id: string
  name: string
  formerNames: string[]
  county: string | null
  city: string | null
  licensedBeds: number | null
  typeOfCare: string | null
  hospitalType: string | null
  lastYear: number
  /** Closure evidence from the state's license listing (lib/facility-flag.ts). */
  closure: FacilityClosure | null
}

export function FacilityPicker({
  facilities,
  value,
  onChange,
  latestYear,
  placeholder = "Search hospitals by name, city, or county",
  className,
}: {
  facilities: FacilityOption[]
  value: string | null
  onChange: (id: string) => void
  latestYear: number
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = facilities.find((f) => f.id === value) ?? null
  const selectedFlag = selected ? facilityFlag(selected, latestYear) : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "glass flex h-11 w-full min-w-0 items-center gap-2.5 rounded-xl px-3.5 text-left transition-shadow duration-200",
          "hover:glow-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[popup-open]:glow-soft",
          className
        )}
        aria-label={selected ? `Hospital: ${selected.name}. Change hospital` : "Choose a hospital"}
      >
        <Search className="size-4 shrink-0 text-tertiary-foreground" />
        <span className={cn("flex-1 truncate text-[15px]", !selected && "text-muted-foreground")}>
          {selected ? selected.name : placeholder}
        </span>
        {selectedFlag && <FacilityFlagBadge flag={selectedFlag} />}
        <ChevronsUpDown className="size-4 shrink-0 text-tertiary-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) min-w-80 p-0">
        <Command
          // cmdk ranks on `value`, which includes city, county, and former names.
          filter={(itemValue, search) => {
            const terms = search.toLowerCase().split(/\s+/).filter(Boolean)
            const hay = itemValue.toLowerCase()
            return terms.every((t) => hay.includes(t)) ? (hay.startsWith(terms[0] ?? "") ? 1 : 0.5) : 0
          }}
        >
          <CommandInput placeholder="Hospital, city, or county…" autoFocus />
          <CommandList className="max-h-80">
            <CommandEmpty>No hospitals match.</CommandEmpty>
            <CommandGroup>
              {facilities.map((f) => {
                const flag = facilityFlag(f, latestYear)
                return (
                <CommandItem
                  key={f.id}
                  value={[f.name, f.city, f.county, ...f.formerNames, f.id].filter(Boolean).join(" ")}
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
