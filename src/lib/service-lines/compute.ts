import "server-only"

import { quantile } from "@/lib/benchmark/compute"
import type { PeerFilters } from "@/lib/benchmark/filters"
import { resolvePeerGroup } from "@/lib/benchmark/peers"
import type { UnitSource } from "@/lib/benchmark/units"
import { getFacilities, getFields, getManifest, getUnits } from "@/lib/data/store"
import type { FieldsFile, MetricsFile, UnitInfo } from "@/lib/data/types"
import { checkServiceLines, SERVICE_LINES, type ServiceLine } from "./lines"

// Service lines (lines.ts) from HCAI's own fields (fields.json): each line's licensed beds, bed days, patient days,
// discharges, and stays are the sums of its bed classifications', and occupancy, average daily census, and length of
// stay are recomputed from those sums, the same way the app computes them for the whole hospital. Summed over every
// line, the fields match the hospital's own totals (TOT_LIC_BEDS, TOT_CEN_DAYS, TOT_DISCHARGES) for every
// hospital-year.
//
// A classification counts toward a line in a year when it has licensed beds on December 31 or any activity during the
// year (a unit closed in the fall has patient days but no beds at year end). A hospital sometimes leaves a
// classification's patient days or discharges blank while reporting beds; HCAI's own totals count that as none, and so
// does a combined line, which says so (`blank`). A line of one classification shows that classification as reported.

export type LineValues = {
  licensedBeds: number | null
  licensedBedDays: number | null
  inpatientDays: number | null
  discharges: number | null
  /** Discharges, plus transfers out to a general acute bed where HCAI ends a stay there (critical care, skilled nursing). */
  stays: number | null
  /** Percent, one decimal, as the unit view shows it. */
  occupancy: number | null
  adc: number | null
  alos: number | null
}

export type ComponentRow = {
  id: string
  label: string
  description: string
  values: LineValues
  /** Measures the hospital left blank while reporting beds for this classification. */
  blank: ("inpatientDays" | "discharges")[]
  /** A stay ends at a transfer out too (critical care, skilled nursing): length of stay is time in the unit. */
  timeInUnit: boolean
}

export type LinePeerStats = {
  /** Peers with the line this year. */
  reporting: number
  occupancy: number | null
  inpatientDays: number | null
  discharges: number | null
  /** Share (0–1) of reporting peers the hospital's occupancy is above. */
  percentile: number | null
}

export type LineRow = {
  id: string
  label: string
  note: string | null
  units: string[]
  /** Combined figures. */
  values: LineValues
  /** Each classification the hospital had this year, as reported. */
  components: ComponentRow[]
  /** Some classification's patient days or discharges were blank and counted as none in the combined figures. */
  blank: boolean
  /** Some classification ends a stay at a transfer out, so length of stay is time in the unit. */
  timeInUnit: "critical care" | "skilled nursing" | "critical care and skilled nursing" | null
  /** The well-baby nursery (outside the line's totals): nursery days and infants discharged. */
  nursery: { inpatientDays: number | null; infants: number | null } | null
  peers: LinePeerStats
}

export type ServiceLineYear = {
  year: number
  annualized: boolean
  lines: LineRow[]
  /** Every line together: the hospital's own totals. */
  total: LineValues
}

export type ServiceLineRollup = {
  /** Years the hospital reported utilization, latest first. */
  years: ServiceLineYear[]
  peerGroup: { description: string; count: number }
  sourcePage: string
}

/** A line the hospital has had (the picker's options). */
export type FacilityLine = { id: string; label: string; units: string[]; beds: number | null; firstYear: number; lastYear: number }

type Raw = { beds: number | null; bedDays: number | null; days: number | null; discharges: number | null; transfers: number | null }

/**
 * Rounds the way the ETL's Python round() does, so a classification's figures here match the unit view's exactly:
 * on the double's exact decimal value (toFixed), with an exact half going to the even digit.
 */
function round(v: number, digits: number) {
  const exact = Math.abs(v).toFixed(digits + 30)
  const point = exact.indexOf(".")
  const kept = exact.slice(0, digits ? point + 1 + digits : point)
  const rest = exact.slice(point + 1 + digits)
  const step = 10 ** -digits
  let out = Number(kept)
  if (/^50*$/.test(rest)) {
    if (Number(kept.at(-1)) % 2 === 1) out += step
  } else if (rest[0] >= "5") out += step
  return Math.sign(v) * Number(out.toFixed(digits))
}
/** Counts: the ETL rounds annualized counts to whole numbers. */
const count = (v: number | null) => (v != null ? round(v, 0) : null)
const ratio = (n: number | null, d: number | null, digits: number) => (n != null && d ? round(n / d, digits) : null)
/** Sum ignoring blanks; null only when every value is blank. */
const sum = (values: (number | null)[]) => (values.some((v) => v != null) ? values.reduce<number>((s, v) => s + (v ?? 0), 0) : null)

function daysInYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365
}

type Model = {
  units: UnitInfo[]
  /** facility -> year -> unit id -> raw fields, for classifications with beds or activity. */
  raw: Map<string, Map<number, Map<string, Raw>>>
  /** facility -> year -> nursery. */
  nursery: Map<string, Map<number, { inpatientDays: number | null; infants: number | null }>>
  /** facility -> year -> days the flows cover (a full year when annualized). */
  periodDays: Map<string, Map<number, { days: number; annualized: boolean }>>
  years: number[]
}

let model: Promise<Model> | null = null
function getModel() {
  model ??= Promise.all([getFields("hau"), getUnits(), getManifest("hau")]).then(([fields, units, manifest]) =>
    buildModel(fields, units.units, manifest.years)
  )
  model.catch(() => (model = null))
  return model
}

function buildModel(file: FieldsFile, units: UnitInfo[], years: number[]): Model {
  checkServiceLines(units.map((u) => u.id))
  const index = new Map(file.fields.map((f, i) => [f, i]))
  const col = (name: string) => {
    const i = index.get(name)
    if (i == null) throw new Error(`fields.json has no ${name}`)
    return i
  }
  const cols = units.map((u) => ({
    id: u.id,
    beds: col(`${u.prefix}_LIC_BEDS`),
    bedDays: col(`${u.prefix}_LIC_BED_DAYS`),
    days: col(`${u.censusPrefix}_CEN_DAYS`),
    discharges: col(`${u.prefix}_DISCHARGES`),
    transfers: u.countsTransfers ? col(`${u.prefix}_INTRA_TRANSFERS`) : null,
  }))
  const nurseryDays = col("NEWBORN_NURSERY_CEN_DAYS")
  const nurseryInfants = col("NEWBORN_NURSERY_INFANTS")

  const raw: Model["raw"] = new Map()
  const nursery: Model["nursery"] = new Map()
  const periodDays: Model["periodDays"] = new Map()
  for (const [facilityId, byYear] of Object.entries(file.values)) {
    const facRaw = new Map<number, Map<string, Raw>>()
    const facNursery = new Map<number, { inpatientDays: number | null; infants: number | null }>()
    const facPeriod = new Map<number, { days: number; annualized: boolean }>()
    for (const [y, row] of Object.entries(byYear)) {
      const year = Number(y)
      const meta = file.meta[facilityId]?.[y]
      const annualized = meta?.annualized ?? false
      facPeriod.set(year, { days: annualized ? daysInYear(year) : meta?.days || daysInYear(year), annualized })
      const inYear = new Map<string, Raw>()
      for (const c of cols) {
        const r: Raw = {
          beds: row[c.beds],
          bedDays: row[c.bedDays],
          days: row[c.days],
          discharges: row[c.discharges],
          transfers: c.transfers != null ? row[c.transfers] : null,
        }
        if (r.beds || r.bedDays || r.days || r.discharges) inYear.set(c.id, r)
      }
      if (inYear.size) facRaw.set(year, inYear)
      const nd = row[nurseryDays]
      const ni = row[nurseryInfants]
      if (nd || ni) facNursery.set(year, { inpatientDays: nd, infants: ni })
    }
    raw.set(facilityId, facRaw)
    nursery.set(facilityId, facNursery)
    periodDays.set(facilityId, facPeriod)
  }
  return { units, raw, nursery, periodDays, years }
}

function values(parts: Raw[], period: number): LineValues {
  const days = sum(parts.map((p) => p.days))
  const bedDays = sum(parts.map((p) => p.bedDays))
  const discharges = sum(parts.map((p) => p.discharges))
  const stays = sum(parts.flatMap((p) => [p.discharges, p.transfers]))
  const occupancy = ratio(days, bedDays, 4)
  return {
    licensedBeds: count(sum(parts.map((p) => p.beds))),
    licensedBedDays: count(bedDays),
    inpatientDays: count(days),
    discharges: count(discharges),
    stays: count(stays),
    occupancy: occupancy != null ? round(occupancy * 100, 1) : null,
    adc: ratio(days, period, 1),
    alos: ratio(days, stays, 2),
  }
}

/** One line's combined values for a hospital-year, or null when it had none of the line's classifications. */
function lineValues(m: Model, line: ServiceLine, facilityId: string, year: number) {
  const inYear = m.raw.get(facilityId)?.get(year)
  const parts = line.units.map((u) => inYear?.get(u)).filter((r): r is Raw => !!r)
  if (!parts.length) return null
  return values(parts, m.periodDays.get(facilityId)?.get(year)?.days ?? daysInYear(year))
}

const sources = new Map<string, Promise<UnitSource>>()

/** One line's combined values shaped like a metrics file (for Benchmark's metric cards), every hospital. */
export function lineSource(lineId: string): Promise<UnitSource> {
  let entry = sources.get(lineId)
  if (!entry) {
    entry = (async () => {
      const m = await getModel()
      const line = SERVICE_LINES.find((l) => l.id === lineId)
      if (!line) throw new Error(`Unknown service line ${lineId}`)
      const file: MetricsFile = {}
      const published = new Set<number>()
      for (const [facilityId, byYear] of m.raw) {
        for (const year of byYear.keys()) {
          const v = lineValues(m, line, facilityId, year)
          if (!v) continue
          const annualized = m.periodDays.get(facilityId)?.get(year)?.annualized ?? false
          ;(file[facilityId] ??= {})[year] = { ...v, annualized, status: null }
          published.add(year)
        }
      }
      return { file, years: m.years, published }
    })()
    entry.catch(() => sources.delete(lineId))
    sources.set(lineId, entry)
  }
  return entry
}

/** The lines a hospital has had, in config order. */
export async function getFacilityLines(facilityId: string): Promise<FacilityLine[]> {
  const m = await getModel()
  const years = [...(m.raw.get(facilityId)?.keys() ?? [])].sort((a, b) => a - b)
  return SERVICE_LINES.flatMap((line) => {
    const present = years.filter((y) => lineValues(m, line, facilityId, y))
    if (!present.length) return []
    const last = present.at(-1)!
    return [{ id: line.id, label: line.label, units: line.units, beds: lineValues(m, line, facilityId, last)!.licensedBeds, firstYear: present[0], lastYear: last }]
  })
}

function rank(sorted: number[], value: number) {
  let below = 0
  let equal = 0
  for (const v of sorted) {
    if (v < value) below++
    else if (v === value) equal++
  }
  return (below + equal / 2) / sorted.length
}

const median = (values: (number | null | undefined)[]) =>
  quantile(values.filter((v): v is number => v != null).sort((a, b) => a - b), 0.5)

/** Every line for one hospital, each year it reported, with the peer group's medians. */
export async function computeServiceLines({ facilityId, filters }: { facilityId: string; filters: PeerFilters }): Promise<ServiceLineRollup | null> {
  const [m, facilities, manifest] = await Promise.all([getModel(), getFacilities(), getManifest("hau")])
  const facility = facilities.find((f) => f.id === facilityId)
  if (!facility) return null
  const group = resolvePeerGroup(facility, facilities, filters)
  const unitById = new Map(m.units.map((u) => [u.id, u]))
  const years = [...(m.raw.get(facilityId)?.keys() ?? [])].sort((a, b) => b - a)

  const out: ServiceLineYear[] = years.map((year) => {
    const inYear = m.raw.get(facilityId)!.get(year)!
    const period = m.periodDays.get(facilityId)?.get(year)
    const lines: LineRow[] = SERVICE_LINES.flatMap((line) => {
      const combined = lineValues(m, line, facilityId, year)
      if (!combined) return []
      const components: ComponentRow[] = line.units
        .filter((u) => inYear.has(u))
        .map((u) => {
          const r = inYear.get(u)!
          const info = unitById.get(u)!
          const blank: ComponentRow["blank"] = []
          if (r.beds && r.days == null) blank.push("inpatientDays")
          if (r.beds && r.discharges == null) blank.push("discharges")
          return { id: u, label: info.label, description: info.description, values: values([r], period?.days ?? daysInYear(year)), blank, timeInUnit: info.countsTransfers }
        })
      const infos = components.map((c) => unitById.get(c.id)!)
      const critical = infos.some((u) => u.countsTransfers && u.criticalCare)
      const skilled = infos.some((u) => u.countsTransfers && !u.criticalCare)
      const peerValues = group.peers.map((p) => lineValues(m, line, p.id, year)).filter((v): v is LineValues => !!v)
      const occupancies = peerValues.map((v) => v.occupancy).filter((v): v is number => v != null).sort((a, b) => a - b)
      return [
        {
          id: line.id,
          label: line.label,
          note: line.note ?? null,
          units: line.units,
          values: combined,
          components,
          // A one-classification line shows that classification as reported, blanks and all.
          blank: line.units.length > 1 && components.length > 1 && components.some((c) => c.blank.length > 0),
          timeInUnit: critical && skilled ? "critical care and skilled nursing" : critical ? "critical care" : skilled ? "skilled nursing" : null,
          nursery: line.nursery ? (m.nursery.get(facilityId)?.get(year) ?? null) : null,
          peers: {
            reporting: peerValues.length,
            occupancy: quantile(occupancies, 0.5),
            inpatientDays: median(peerValues.map((v) => v.inpatientDays)),
            discharges: median(peerValues.map((v) => v.discharges)),
            percentile: combined.occupancy != null && occupancies.length ? rank(occupancies, combined.occupancy) : null,
          },
        },
      ]
    })
    return { year, annualized: period?.annualized ?? false, lines, total: values([...inYear.values()], period?.days ?? daysInYear(year)) }
  })

  return {
    years: out,
    peerGroup: { description: group.description, count: group.peers.length },
    sourcePage: manifest.sourcePage,
  }
}
