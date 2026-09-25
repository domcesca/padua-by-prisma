import "server-only"

import { UNIT_METRIC_LABELS, type MetricDef } from "@/lib/data/datasets"
import { getManifest, getUnits } from "@/lib/data/store"
import type { MetricsFile, UnitInfo } from "@/lib/data/types"

// Benchmark's unit view: utilization narrowed to one of HCAI's bed classifications. Each unit
// metric keeps its hospital-wide id (so the URL's ?metrics= carries over) with a unit-specific
// definition, and reads its values from units.json instead of metrics.json.

export type UnitSource = { file: MetricsFile; years: number[]; published: Set<number> }

const sources = new Map<string, Promise<UnitSource>>()

/** One unit's values shaped like a metrics file: facility -> year -> metric -> value. */
export function unitSource(unitId: string): Promise<UnitSource> {
  let entry = sources.get(unitId)
  if (!entry) {
    entry = (async () => {
      const [units, manifest] = await Promise.all([getUnits(), getManifest("hau")])
      const file: MetricsFile = {}
      const published = new Set<number>()
      for (const [facilityId, byYear] of Object.entries(units.values)) {
        for (const [year, row] of Object.entries(byYear)) {
          const unit = row[unitId]
          if (!unit || typeof unit !== "object") continue
          ;(file[facilityId] ??= {})[year] = { ...unit, annualized: row.annualized, status: null }
          published.add(Number(year))
        }
      }
      return { file, years: manifest.years, published }
    })()
    entry.catch(() => sources.delete(unitId))
    sources.set(unitId, entry)
  }
  return entry
}

export async function getUnitInfo(unitId: string | null | undefined): Promise<UnitInfo | null> {
  if (!unitId) return null
  return (await getUnits()).units.find((u) => u.id === unitId) ?? null
}

/** The hospital-wide metric redefined for one unit: same id, unit, and drivers; unit fields and wording. */
export function unitMetricDef(base: MetricDef, unit: UnitInfo): MetricDef {
  const p = unit.prefix
  const c = unit.censusPrefix
  const stays = unit.countsTransfers ? `(${p}_DISCHARGES + ${p}_INTRA_TRANSFERS)` : `${p}_DISCHARGES`
  const name = unit.description.charAt(0).toLowerCase() + unit.description.slice(1)
  const specific: Record<string, Pick<MetricDef, "summary" | "formula" | "inputs"> & { caution?: string }> = {
    occupancy: {
      summary: `Share of the unit's licensed beds filled on an average day (${name}).`,
      formula: `${c}_CEN_DAYS ÷ ${p}_LIC_BED_DAYS`,
      inputs: [`${c}_CEN_DAYS`, `${p}_LIC_BED_DAYS`],
      caution: base.caution,
    },
    adc: {
      summary: `Patients in the unit on an average day: its patient days ÷ days in the year (${name}).`,
      formula: `${c}_CEN_DAYS ÷ days in the reporting period`,
      inputs: [`${c}_CEN_DAYS`],
    },
    alos: {
      summary: `Average days per stay in the unit (${name}).`,
      formula: `${c}_CEN_DAYS ÷ ${stays}`,
      inputs: [`${c}_CEN_DAYS`, `${p}_DISCHARGES`, ...(unit.countsTransfers ? [`${p}_INTRA_TRANSFERS`] : [])],
      caution: unit.countsTransfers
        ? `Per HCAI's instructions a ${unit.criticalCare ? "critical care" : "skilled nursing"} stay ends at a discharge or a transfer out to a general acute bed, so this is time in the unit, not the whole hospital stay.`
        : "Not adjusted for case mix.",
    },
    discharges: {
      summary: `Patients discharged from the unit, including deaths and moves to another type of care (${name}).`,
      formula: `${p}_DISCHARGES`,
      inputs: [`${p}_DISCHARGES`],
    },
    inpatientDays: {
      summary: `Inpatient days in the unit during the year (${name}).`,
      formula: `${c}_CEN_DAYS`,
      inputs: [`${c}_CEN_DAYS`],
    },
    licensedBeds: {
      summary: `Beds licensed in this classification on December 31 (${name}).`,
      formula: `${p}_LIC_BEDS`,
      inputs: [`${p}_LIC_BEDS`],
    },
  }
  const { caution, ...rest } = specific[base.id]
  const def: MetricDef = { ...base, ...rest, label: UNIT_METRIC_LABELS[base.id] ?? base.label }
  if (caution) def.caution = caution
  else delete def.caution
  return def
}
