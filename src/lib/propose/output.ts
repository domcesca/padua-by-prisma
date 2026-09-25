// What goes into the printed / PDF proposal, and in what order. Presentation only: the numbers, notes, and cautions
// are the same whatever is chosen, and the disclosures (the module's caution and notes, the method note) always print.
//
// Two presets to start from, then per-section toggles and order on top:
//   * Finance committee: today's full printout (scenario comparison, cumulative chart, year-by-year table, the full
//     "What went in" list). Links made before output settings existed open as this, so nothing they printed changes.
//   * Board summary: the condensed one-pager (scenario comparison, chart, and a short key-assumptions box; no table).
//
// Sensitivity (Advanced mode's tornado chart) prints only when it's switched on in Advanced; it's in the finance
// preset, not the board one-pager.
//
// In the link as `out=`: "board" or "finance" when it matches a preset, otherwise the sections that are on, in
// order, e.g. "out=chart,scenarios,assumptions:key".

export type SectionId = "scenarios" | "chart" | "table" | "sensitivity" | "assumptions"
export type AssumptionsDetail = "key" | "full"

export type OutputConfig = {
  /** Every section, in print order; `on` says whether it prints. */
  sections: { id: SectionId; on: boolean }[]
  /** Key assumptions (a short box) or the full "What went in" list. */
  assumptions: AssumptionsDetail
}

export type PresetId = "board" | "finance"

export const SECTION_LABELS: Record<SectionId, string> = {
  scenarios: "Scenario comparison",
  chart: "Cumulative chart",
  table: "Year-by-year table",
  sensitivity: "Sensitivity (Advanced)",
  assumptions: "Assumptions",
}

const ALL: SectionId[] = ["scenarios", "chart", "table", "sensitivity", "assumptions"]

export const PRESETS: Record<PresetId, { label: string; summary: string; config: OutputConfig }> = {
  board: {
    label: "Board summary",
    summary: "One page: scenarios, the chart, and key assumptions.",
    config: {
      sections: [
        { id: "scenarios", on: true },
        { id: "chart", on: true },
        { id: "assumptions", on: true },
        { id: "table", on: false },
        { id: "sensitivity", on: false },
      ],
      assumptions: "key",
    },
  },
  finance: {
    label: "Finance committee",
    summary: "Everything: adds the year-by-year table, sensitivity (when on in Advanced), and the full assumptions list.",
    config: {
      sections: [
        { id: "scenarios", on: true },
        { id: "chart", on: true },
        { id: "table", on: true },
        { id: "sensitivity", on: true },
        { id: "assumptions", on: true },
      ],
      assumptions: "full",
    },
  },
}

const key = (c: OutputConfig) =>
  c.sections
    .filter((s) => s.on)
    .map((s) => (s.id === "assumptions" ? `assumptions:${c.assumptions}` : s.id))
    .join(",")

/** The preset this configuration matches exactly, if any. */
export const matchingPreset = (c: OutputConfig): PresetId | null =>
  (Object.keys(PRESETS) as PresetId[]).find((p) => key(PRESETS[p].config) === key(c)) ?? null

export const outputToParam = (c: OutputConfig) => matchingPreset(c) ?? (key(c) || "none")

/**
 * `legacy`: the link predates output settings (it has a proposal but no `out`), so it keeps today's full printout.
 * A new proposal starts from the board summary.
 */
export function parseOutput(raw: string | null, legacy: boolean): OutputConfig {
  if (raw === "board" || raw === "finance") return structuredClone(PRESETS[raw].config)
  if (raw == null || raw.trim() === "") return structuredClone(PRESETS[legacy ? "finance" : "board"].config)
  if (raw === "none") return { sections: ALL.map((id) => ({ id, on: false })), assumptions: "full" }
  const on: SectionId[] = []
  let assumptions: AssumptionsDetail = "full"
  for (const part of raw.split(",")) {
    const [id, detail] = part.trim().split(":")
    if (!ALL.includes(id as SectionId) || on.includes(id as SectionId)) continue
    on.push(id as SectionId)
    if (id === "assumptions" && detail === "key") assumptions = "key"
  }
  return {
    sections: [...on.map((id) => ({ id, on: true })), ...ALL.filter((id) => !on.includes(id)).map((id) => ({ id, on: false }))],
    assumptions,
  }
}

/** Moves a section one place up or down in the print order. */
export function moveSection(c: OutputConfig, id: SectionId, by: -1 | 1): OutputConfig {
  const i = c.sections.findIndex((s) => s.id === id)
  const j = i + by
  if (i < 0 || j < 0 || j >= c.sections.length) return c
  const sections = [...c.sections]
  ;[sections[i], sections[j]] = [sections[j], sections[i]]
  return { ...c, sections }
}
