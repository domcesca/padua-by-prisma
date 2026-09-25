"use client"

import { RotateCcw } from "lucide-react"

import {
  BED_PRESETS,
  DEFAULT_FILTERS,
  isDefaultFilters,
  OWNERSHIP_LABEL,
  OWNERSHIP_OPTIONS,
  type PeerFilters,
  type TeachingFilter,
} from "@/lib/benchmark/filters"
import type { Ownership } from "@/lib/data/types"
import { FilterPill, TogglePill } from "./filter-pill"

const TEACHING_OPTIONS: { value: TeachingFilter; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "teaching", label: "Teaching hospitals" },
  { value: "rural", label: "Small & rural hospitals" },
  { value: "neither", label: "Neither teaching nor rural" },
]

function bedsLabel(min: number | null, max: number | null) {
  if (min == null && max == null) return null
  const preset = BED_PRESETS.find((p) => p.min === min && p.max === max)
  if (preset) return `${preset.label} beds`
  if (min != null && max != null) return `${min}–${max} beds`
  return min != null ? `${min}+ beds` : `Up to ${max} beds`
}

export function PeerFilterBar({
  filters,
  onChange,
  counties,
  facility,
}: {
  filters: PeerFilters
  onChange: (next: PeerFilters) => void
  counties: string[]
  facility: { county: string | null; licensedBeds: number | null; ownership: Ownership } | null
}) {
  const set = (patch: Partial<PeerFilters>) => onChange({ ...filters, ...patch })

  const similar =
    facility?.licensedBeds != null
      ? {
          min: Math.max(0, Math.round((facility.licensedBeds * 0.7) / 5) * 5),
          max: Math.round((facility.licensedBeds * 1.3) / 5) * 5,
        }
      : null

  const countySummary =
    filters.counties.length === 0
      ? null
      : filters.counties.length === 1
        ? filters.counties[0]
        : `${filters.counties.length} counties`

  const ownershipSummary =
    filters.ownership.length === 0
      ? null
      : filters.ownership.length === 1
        ? OWNERSHIP_LABEL[filters.ownership[0]]
        : `${filters.ownership.length} ownership types`

  const bedValue = BED_PRESETS.findIndex((p) => p.min === filters.bedsMin && p.max === filters.bedsMax)

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Peer group filters">
      <FilterPill
        label="County"
        summary={countySummary}
        options={counties.map((c) => ({ value: c, label: c }))}
        selected={filters.counties}
        onChange={(counties) => set({ counties })}
        multiple
        searchable
        quickActions={
          facility?.county && !filters.counties.includes(facility.county)
            ? [{ label: `Use ${facility.county} County`, onSelect: () => set({ counties: [facility.county!] }) }]
            : undefined
        }
      />
      <FilterPill
        label="Ownership"
        summary={ownershipSummary}
        options={OWNERSHIP_OPTIONS}
        selected={filters.ownership}
        onChange={(values) => set({ ownership: values as Ownership[] })}
        multiple
        quickActions={
          facility && !(filters.ownership.length === 1 && filters.ownership[0] === facility.ownership)
            ? [{ label: `Same as this hospital (${OWNERSHIP_LABEL[facility.ownership]})`, onSelect: () => set({ ownership: [facility.ownership] }) }]
            : undefined
        }
      />
      <FilterPill
        label="Bed size"
        summary={bedsLabel(filters.bedsMin, filters.bedsMax)}
        options={BED_PRESETS.map((p, i) => ({ value: String(i), label: p.label }))}
        selected={bedValue >= 0 ? [String(bedValue)] : []}
        onChange={([v]) => {
          const p = BED_PRESETS[Number(v)]
          set({ bedsMin: p.min, bedsMax: p.max })
        }}
        quickActions={
          similar
            ? [{ label: `Similar size (${similar.min}–${similar.max} beds)`, onSelect: () => set({ bedsMin: similar.min, bedsMax: similar.max }) }]
            : undefined
        }
      />
      <FilterPill
        label="Teaching status"
        summary={filters.teaching === "any" ? null : TEACHING_OPTIONS.find((o) => o.value === filters.teaching)!.label}
        options={TEACHING_OPTIONS}
        selected={[filters.teaching]}
        onChange={([v]) => set({ teaching: v as TeachingFilter })}
      />
      <TogglePill
        label="Include Kaiser & non-comparable"
        pressed={filters.includeNonComparable}
        onPressedChange={(includeNonComparable) => set({ includeNonComparable })}
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
  )
}
