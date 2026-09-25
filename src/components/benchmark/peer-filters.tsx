"use client"

import { Info, RotateCcw } from "lucide-react"

import { PickerPill } from "@/components/shell/grouped-picker"
import { Segmented } from "@/components/shell/segmented"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  BED_PRESETS,
  bedsLabel,
  DEFAULT_FILTERS,
  isDefaultFilters,
  OWNERSHIP_LABEL,
  OWNERSHIP_OPTIONS,
  RADIUS_OPTIONS,
  type PeerFilters,
  type PeerMode,
  type TeachingFilter,
} from "@/lib/benchmark/filters"
import { MIN_PEERS } from "@/lib/benchmark/peers"
import type { Ownership } from "@/lib/data/types"
import { FilterPill, TogglePill } from "./filter-pill"

const TEACHING_OPTIONS: { value: TeachingFilter; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "teaching", label: "Teaching hospitals" },
  { value: "rural", label: "Small & rural hospitals" },
  { value: "neither", label: "Neither teaching nor rural" },
]

type FacilityContext = {
  county: string | null
  licensedBeds: number | null
  ownership: Ownership
  latitude: number | null
  longitude: number | null
}

export function PeerFilterBar({
  filters,
  applied,
  onChange,
  counties,
  facility,
}: {
  /** What was asked for (mode + any custom filters). */
  filters: PeerFilters
  /** What's actually applied — for "similar", the filters chosen automatically. */
  applied: PeerFilters | null
  onChange: (next: PeerFilters) => void
  counties: string[]
  facility: FacilityContext | null
}) {
  const shown = applied ?? filters
  // Editing any filter turns the current group into a custom one.
  const edit = (patch: Partial<PeerFilters>) => onChange({ ...shown, ...patch, mode: "custom" })
  const located = facility?.latitude != null && facility?.longitude != null

  const similar =
    facility?.licensedBeds != null
      ? {
          min: Math.max(0, Math.round((facility.licensedBeds * 0.7) / 5) * 5),
          max: Math.round((facility.licensedBeds * 1.3) / 5) * 5,
        }
      : null

  const countySummary =
    shown.counties.length === 0 ? null : shown.counties.length === 1 ? shown.counties[0] : `${shown.counties.length} counties`
  const ownershipSummary =
    shown.ownership.length === 0
      ? null
      : shown.ownership.length === 1
        ? OWNERSHIP_LABEL[shown.ownership[0]]
        : shown.ownership.every((o) => ["government", "state", "other"].includes(o))
          ? "Public & other"
          : `${shown.ownership.length} ownership types`
  const bedValue = BED_PRESETS.findIndex((p) => p.min === shown.bedsMin && p.max === shown.bedsMax)

  const modeOptions: { value: PeerMode; label: string }[] = [
    { value: "similar", label: "Similar hospitals" },
    { value: "statewide", label: "All of California" },
    ...(filters.mode === "custom" ? [{ value: "custom" as const, label: "Custom" }] : []),
  ]

  return (
    <div className="space-y-2.5" role="group" aria-label="Peer group">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium text-muted-foreground">Peer group</span>
        <Segmented
          label="Peer group"
          size="sm"
          value={filters.mode}
          onChange={(mode) => mode !== "custom" && onChange({ ...DEFAULT_FILTERS, mode, includeNonComparable: filters.includeNonComparable })}
          options={modeOptions}
        />
        <PeerGroupInfo />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PickerPill
          noun="counties"
          label="County"
          summary={countySummary}
          options={counties.map((c) => ({ value: c, label: c }))}
          selected={shown.counties}
          onChange={(counties) => edit({ counties, radiusMiles: null })}
          multiple
          actions={
            facility?.county && !(shown.counties.length === 1 && shown.counties[0] === facility.county)
              ? [{ label: `Use ${facility.county} County`, onSelect: () => edit({ counties: [facility.county!], radiusMiles: null }) }]
              : undefined
          }
        />
        {located && (
          <FilterPill
            label="Distance"
            summary={shown.radiusMiles != null ? `Within ${shown.radiusMiles} mi` : null}
            options={[
              { value: "any", label: "Any distance" },
              ...RADIUS_OPTIONS.map((m) => ({ value: String(m), label: `Within ${m} miles` })),
            ]}
            selected={[shown.radiusMiles != null ? String(shown.radiusMiles) : "any"]}
            onChange={([v]) => edit({ radiusMiles: v === "any" ? null : Number(v), counties: v === "any" ? shown.counties : [] })}
            footer={<p className="px-1 text-xs leading-snug text-muted-foreground">Straight-line distance, not drive time.</p>}
          />
        )}
        <FilterPill
          label="Ownership"
          summary={ownershipSummary}
          options={OWNERSHIP_OPTIONS}
          selected={shown.ownership}
          onChange={(values) => edit({ ownership: values as Ownership[] })}
          multiple
          quickActions={
            facility && !(shown.ownership.length === 1 && shown.ownership[0] === facility.ownership)
              ? [{ label: `Same as this hospital (${OWNERSHIP_LABEL[facility.ownership]})`, onSelect: () => edit({ ownership: [facility.ownership] }) }]
              : undefined
          }
        />
        <FilterPill
          label="Bed size"
          summary={bedsLabel(shown.bedsMin, shown.bedsMax)}
          options={BED_PRESETS.map((p, i) => ({ value: String(i), label: p.label }))}
          selected={bedValue >= 0 ? [String(bedValue)] : []}
          onChange={([v]) => {
            const p = BED_PRESETS[Number(v)]
            edit({ bedsMin: p.min, bedsMax: p.max })
          }}
          quickActions={
            similar
              ? [{ label: `Similar size (${similar.min}–${similar.max} beds)`, onSelect: () => edit({ bedsMin: similar.min, bedsMax: similar.max }) }]
              : undefined
          }
        />
        <FilterPill
          label="Teaching status"
          summary={shown.teaching === "any" ? null : TEACHING_OPTIONS.find((o) => o.value === shown.teaching)!.label}
          options={TEACHING_OPTIONS}
          selected={[shown.teaching]}
          onChange={([v]) => edit({ teaching: v as TeachingFilter })}
        />
        <TogglePill
          label="Include Kaiser & non-comparable"
          pressed={filters.includeNonComparable}
          onPressedChange={(includeNonComparable) => onChange({ ...filters, includeNonComparable })}
        />
        {!isDefaultFilters(filters) && (
          <button
            type="button"
            onClick={() => onChange(DEFAULT_FILTERS)}
            className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-[13px] text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <RotateCcw className="size-3.5" />
            Reset
          </button>
        )}
      </div>
    </div>
  )
}

function PeerGroupInfo() {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="How similar hospitals are chosen"
        className="rounded-full text-tertiary-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Info className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-88 gap-2.5 p-4 text-[13px] leading-relaxed">
        <p className="font-medium">How similar hospitals are chosen</p>
        <p className="text-muted-foreground">
          Hospitals of the same type of care in the same county, with the same bed-size band (under 100, 100–299, 300+)
          and ownership type. If that finds fewer than {MIN_PEERS}, the group widens to the nearest hospitals by distance,
          then drops ownership, then goes statewide.
        </p>
        <p className="text-muted-foreground">
          This isn’t a service area. A true primary or secondary service area is built from where a hospital’s patients
          live, which needs HCAI’s patient-level discharge data — available only through a formal data request, and not
          used here.
        </p>
      </PopoverContent>
    </Popover>
  )
}
