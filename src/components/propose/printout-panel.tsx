"use client"

import { ArrowDown, ArrowUp } from "lucide-react"

import { Segmented } from "@/components/shell/segmented"
import { matchingPreset, moveSection, PRESETS, SECTION_LABELS, type OutputConfig, type PresetId } from "@/lib/propose/output"
import { cn } from "@/lib/utils"

/** Choose what the printout includes: start from a preset, then switch sections on or off and reorder them. */
export function PrintoutPanel({ value, onChange }: { value: OutputConfig; onChange: (next: OutputConfig) => void }) {
  const preset = matchingPreset(value)
  const iconButton =
    "flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-30"

  return (
    <div className="glass space-y-4 rounded-2xl p-4">
      <div className="space-y-1.5">
        <p className="text-[13px] font-medium">Start from</p>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<PresetId | "custom">
            label="Printout preset"
            size="sm"
            value={preset ?? "custom"}
            onChange={(p) => p !== "custom" && onChange(structuredClone(PRESETS[p].config))}
            options={[
              { value: "board", label: PRESETS.board.label },
              { value: "finance", label: PRESETS.finance.label },
              ...(preset ? [] : [{ value: "custom" as const, label: "Customized" }]),
            ]}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {preset ? PRESETS[preset].summary : "Adjusted from a preset. Pick one above to start over."}
        </p>
      </div>

      <div className="space-y-1.5">
        <p className="text-[13px] font-medium">Sections, in print order</p>
        <ol className="divide-y divide-border/60 rounded-xl border border-border">
          {value.sections.map((s, i) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-[13px]">
                <input
                  type="checkbox"
                  checked={s.on}
                  onChange={(e) => onChange({ ...value, sections: value.sections.map((x) => (x.id === s.id ? { ...x, on: e.target.checked } : x)) })}
                  className="size-4 accent-[var(--primary)]"
                />
                <span className={cn(!s.on && "text-muted-foreground")}>{SECTION_LABELS[s.id]}</span>
              </label>
              {s.id === "assumptions" && s.on && (
                <Segmented
                  label="Assumptions detail"
                  size="sm"
                  value={value.assumptions}
                  onChange={(assumptions) => onChange({ ...value, assumptions })}
                  options={[
                    { value: "key", label: "Key" },
                    { value: "full", label: "Full list" },
                  ]}
                />
              )}
              <span className="flex items-center">
                <button type="button" className={iconButton} disabled={i === 0} onClick={() => onChange(moveSection(value, s.id, -1))} aria-label={`Move ${SECTION_LABELS[s.id]} up`}>
                  <ArrowUp className="size-4" />
                </button>
                <button
                  type="button"
                  className={iconButton}
                  disabled={i === value.sections.length - 1}
                  onClick={() => onChange(moveSection(value, s.id, 1))}
                  aria-label={`Move ${SECTION_LABELS[s.id]} down`}
                >
                  <ArrowDown className="size-4" />
                </button>
              </span>
            </li>
          ))}
        </ol>
        <p className="text-xs leading-relaxed text-muted-foreground">
          The title, hospital, any caution, and the notes on sources and method always print. The screen keeps showing
          everything; this only changes the printout and PDF. Saved in the link.
        </p>
      </div>
    </div>
  )
}
