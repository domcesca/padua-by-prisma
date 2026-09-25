// Benchmark's service lines: HCAI's 14 bed classifications (utilization report page 3) grouped into the service lines
// an admin thinks in. Every classification belongs to exactly one line, so the lines add up to the hospital's total
// licensed beds, patient days, and discharges with nothing counted twice.
//
// To regroup a classification, rename a line, or add one, edit this list; nothing else needs to change (the server
// checks at load that each classification is assigned exactly once). Classification ids are units.json's
// (etl hau, UNITS). The combined figures are sums of HCAI's own fields, so no line needs a rebuild of the data.

export type ServiceLine = {
  id: string
  label: string
  /** Bed classifications (units.json ids) combined into the line. */
  units: string[]
  /** Where the combined figures need a word of explanation. */
  note?: string
  /** Show the well-baby nursery as its own row under this line, outside the line's totals. */
  nursery?: boolean
}

export const SERVICE_LINES: ServiceLine[] = [
  { id: "medSurg", label: "Medical/Surgical", units: ["medSurg"] },
  {
    id: "criticalCare",
    label: "Critical Care (ICU, CCU, Respiratory)",
    units: ["icu", "ccu", "acuteRespiratory"],
    note: "Adult and pediatric: HCAI has no pediatric ICU classification, so a PICU reports its beds as Intensive Care. There's no cardiac ICU classification either; coronary care is its own and is combined here.",
  },
  {
    id: "maternityNewborn",
    label: "Maternity & Newborn",
    units: ["perinatal", "nicu"],
    nursery: true,
    note: "Mothers' perinatal stays and NICU stays combined. The well-baby nursery is shown on its own and left out of the totals: a baby who moves from the NICU to the nursery would otherwise be counted twice.",
  },
  { id: "pediatric", label: "Pediatrics", units: ["pediatric"] },
  {
    id: "burn",
    label: "Burn Center",
    units: ["burn"],
    note: "Kept apart from Critical Care: only 13 California hospitals had burn beds in 2024, and folding them into the larger critical care totals would hide them.",
  },
  { id: "rehab", label: "Rehabilitation", units: ["rehab"] },
  {
    id: "behavioralHealth",
    label: "Behavioral Health",
    units: ["psych", "chemDependency"],
  },
  {
    id: "longTermCare",
    label: "Long-Term Care",
    units: ["snf", "icf", "icfDd"],
  },
]

export const SERVICE_LINE_BY_ID = new Map(SERVICE_LINES.map((l) => [l.id, l]))

/** The line a bed classification belongs to. */
export const lineOfUnit = (unitId: string) => SERVICE_LINES.find((l) => l.units.includes(unitId)) ?? null

/** A line of more than one classification (a one-classification line is the same as that unit's view). */
export const isCombined = (line: ServiceLine) => line.units.length > 1

/** Throws unless every classification is in exactly one line and every line names a real classification. */
export function checkServiceLines(unitIds: string[]) {
  const seen = new Map<string, string>()
  for (const line of SERVICE_LINES) {
    if (!line.units.length) throw new Error(`Service line ${line.id} has no bed classifications`)
    for (const u of line.units) {
      if (!unitIds.includes(u)) throw new Error(`Service line ${line.id}: unknown bed classification ${u}`)
      if (seen.has(u)) throw new Error(`Bed classification ${u} is in both ${seen.get(u)} and ${line.id}`)
      seen.set(u, line.id)
    }
  }
  const missing = unitIds.filter((u) => !seen.has(u))
  if (missing.length) throw new Error(`Bed classifications in no service line: ${missing.join(", ")}`)
}
