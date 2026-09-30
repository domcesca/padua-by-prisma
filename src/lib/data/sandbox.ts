import "server-only"

import { AsyncLocalStorage } from "node:async_hooks"

import type { Facility, FieldsFile, MetricsFile, UnitsFile } from "./types"

// Test hospitals (V7.6.5c): a made-up hospital an organization can use to try Padua, visible only to that organization's
// signed-in people. It's a real hospital's public filings with every amount and volume changed by 10-20%, under a new
// name and an id no HCAI hospital has (999xxxxxx).
//
// How it stays private: the data layer (store.ts) only ever caches the real data. When a request comes from someone
// whose organization has a test hospital, the request runs inside runWithSandbox, and store.ts layers the test
// hospital's rows onto what it returns, for that request only. getFacilities(), the list every peer group, median and
// ranking is drawn from, never includes a test hospital, so no real figure changes, for anyone. Responses that mention a
// test hospital are never cached publicly (lib/server/sandbox.ts).

export type SandboxHospital = {
  /** The id it goes by in URLs and data, e.g. "999123456". */
  id: string
  name: string
  /** The real hospital whose filings it's made from. */
  sourceId: string
  /** Fixes the random changes, so the hospital looks the same every time. */
  seed: number
}
export type Sandbox = { key: string; hospitals: SandboxHospital[] }

const storage = new AsyncLocalStorage<Sandbox | null>()

export const SANDBOX_ID = /^999\d{6}$/
export const isSandboxId = (id: string | null | undefined) => !!id && SANDBOX_ID.test(id)

export const currentSandbox = () => storage.getStore() ?? null

/** Runs `fn` with these test hospitals layered onto the data (or none, for null). */
export function runWithSandbox<T>(sandbox: Sandbox | null, fn: () => T): T {
  return storage.run(sandbox && sandbox.hospitals.length ? sandbox : null, fn)
}

/** Runs `fn` on the real data alone: used for everything cached across requests. */
export function runWithoutSandbox<T>(fn: () => T): T {
  return storage.run(null, fn)
}

export const sandboxKey = () => currentSandbox()?.key ?? ""

export const makeSandbox = (hospitals: SandboxHospital[]): Sandbox | null =>
  hospitals.length ? { key: hospitals.map((h) => `${h.id}:${h.sourceId}:${h.seed}`).sort().join("|"), hospitals } : null

// ---------------------------------------------------------------------------------------------------------------------
// The changes

/** Deterministic 0..1 from a seed and a label (mulberry32 over a string hash). */
function unit(seed: number, label: string) {
  let h = seed ^ 0x9e3779b9
  for (let i = 0; i < label.length; i++) h = Math.imul(h ^ label.charCodeAt(i), 0x85ebca6b)
  let t = (h += 0x6d2b79f5)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** A factor 10-20% away from 1, up or down. */
const tenToTwenty = (seed: number, label: string) => (unit(seed, `${label}:sign`) < 0.5 ? -1 : 1) * (0.1 + 0.1 * unit(seed, label)) + 1

/**
 * Two factors, one for money and one for volume, plus a small drift by year (within 3%) applied to both. Scaling every
 * amount by one factor keeps every total, subtotal and margin consistent; a separate volume factor moves the
 * per-discharge and per-day figures.
 */
export function factors(h: SandboxHospital) {
  const money = tenToTwenty(h.seed, "money")
  const volume = tenToTwenty(h.seed, "volume")
  const drift = (year: string | number) => 1 + (unit(h.seed, `drift:${year}`) - 0.5) * 0.06
  return { money, volume, drift }
}

/** Metrics that are amounts, per-volume amounts, or volumes. Everything else (rates, ratios, quality) is kept. */
const MONEY_METRICS = new Set(["netPatientRevenue", "totalOperatingExpense", "medicareNetRevenue"])
const PER_VOLUME_METRICS = new Set(["expensePerAdjDischarge", "revenuePerAdjDischarge", "medicareRevenuePerAdjDischarge", "medicareCostPerAdjDischarge"])
const VOLUME_METRICS = new Set([
  "edVisits",
  "outpatientVisits",
  "discharges",
  "licensedBeds",
  "medicareDischarges",
  "medicareInpatientDays",
  "medicareOutpatientVisits",
  "inpatientDays",
  "adc",
  "ipSurgeries",
  "opSurgeries",
  "cathProcedures",
])
/** Volume fields that are lengths of time or ratios, not amounts of work: kept as they are. */
const KEEP_FIELD = /^DAY_PER$|ALOS|AVG_PER|DIVERSION/

const round = (v: number, digits = 0) => Math.round(v * 10 ** digits) / 10 ** digits

function scaleMetricRow(row: Record<string, unknown>, year: string, h: SandboxHospital) {
  const { money, volume, drift } = factors(h)
  const d = drift(year)
  const out: Record<string, unknown> = { ...row }
  for (const [k, v] of Object.entries(row)) {
    if (typeof v !== "number" || !Number.isFinite(v)) continue
    if (MONEY_METRICS.has(k)) out[k] = round(v * money * d)
    else if (PER_VOLUME_METRICS.has(k)) out[k] = round((v * money) / volume, 2)
    else if (VOLUME_METRICS.has(k)) out[k] = round(v * volume * d, k === "adc" ? 1 : 0)
  }
  return out
}

export function sandboxMetrics(base: MetricsFile, hospitals: SandboxHospital[]): MetricsFile {
  const out: MetricsFile = { ...base }
  for (const h of hospitals) {
    const src = base[h.sourceId]
    if (!src) continue
    out[h.id] = Object.fromEntries(Object.entries(src).map(([year, row]) => [year, scaleMetricRow(row as Record<string, unknown>, year, h)])) as MetricsFile[string]
  }
  return out
}

/** `units`: field code -> unit, from the dataset's dictionary. */
export function sandboxFields(base: FieldsFile, hospitals: SandboxHospital[], units: Map<string, string>): FieldsFile {
  const kind = base.fields.map((code) => {
    const u = units.get(code)
    if (u === "usd") return "money"
    if (u && ["count", "beds", "fte", "days", "hours", "minutes"].includes(u) && !KEEP_FIELD.test(code)) return u === "fte" ? "fte" : "volume"
    return null
  })
  const values = { ...base.values }
  const meta = { ...base.meta }
  for (const h of hospitals) {
    const src = base.values[h.sourceId]
    if (!src) continue
    const { money, volume, drift } = factors(h)
    values[h.id] = Object.fromEntries(
      Object.entries(src).map(([year, row]) => {
        const d = drift(year)
        return [
          year,
          row.map((v, i) =>
            v == null || !kind[i] ? v : kind[i] === "money" ? round(v * money * d) : kind[i] === "fte" ? round(v * volume * d, 1) : round(v * volume * d)
          ),
        ]
      })
    )
    meta[h.id] = base.meta[h.sourceId] ?? {}
  }
  return { ...base, values, meta }
}

export function sandboxUnits(base: UnitsFile, hospitals: SandboxHospital[]): UnitsFile {
  const values = { ...base.values }
  for (const h of hospitals) {
    const src = base.values[h.sourceId]
    if (!src) continue
    const { volume, drift } = factors(h)
    values[h.id] = Object.fromEntries(
      Object.entries(src).map(([year, row]) => {
        const d = drift(year)
        const next: Record<string, unknown> = {}
        for (const [unitId, u] of Object.entries(row)) {
          if (!u || typeof u !== "object") {
            next[unitId] = u
            continue
          }
          const s = { ...(u as Record<string, number | null>) }
          for (const k of ["licensedBeds", "discharges", "inpatientDays"]) if (typeof s[k] === "number") s[k] = round(s[k]! * volume * d)
          if (typeof s.adc === "number") s.adc = round(s.adc * volume * d, 1)
          next[unitId] = s
        }
        return [year, next]
      })
    ) as UnitsFile["values"][string]
  }
  return { ...base, values }
}

/** Counts per hospital, year and code (Medicare cases, outpatient services): scaled by volume. */
export function sandboxCounts(base: Record<string, Record<string, Record<string, number>>>, hospitals: SandboxHospital[]) {
  const out = { ...base }
  for (const h of hospitals) {
    const src = base[h.sourceId]
    if (!src) continue
    const { volume, drift } = factors(h)
    out[h.id] = Object.fromEntries(
      Object.entries(src).map(([year, byCode]) => [year, Object.fromEntries(Object.entries(byCode).map(([code, n]) => [code, Math.max(11, Math.round(n * volume * drift(year)))]))])
    )
  }
  return out
}

/** Per-hospital reference records kept as they are (penalty standing, wage index): the test hospital shares its source's. */
export function sandboxCopy<T>(base: Record<string, T>, hospitals: SandboxHospital[]) {
  const out = { ...base }
  for (const h of hospitals) if (base[h.sourceId]) out[h.id] = base[h.sourceId]
  return out
}

/** The test hospital's directory entry: its source's profile, renamed, resized, and moved a little. */
export function sandboxFacility(source: Facility, h: SandboxHospital): Facility {
  const { volume } = factors(h)
  const jitter = (label: string) => (unit(h.seed, label) - 0.5) * 0.04
  return {
    ...source,
    id: h.id,
    name: h.name,
    hcaiName: h.name.toUpperCase(),
    formerNames: [],
    owner: null,
    licensedBeds: source.licensedBeds != null ? Math.round(source.licensedBeds * volume) : null,
    latitude: source.latitude != null ? round(source.latitude + jitter("lat"), 4) : null,
    longitude: source.longitude != null ? round(source.longitude + jitter("lon"), 4) : null,
    campuses: [],
    closure: null,
    sandbox: true,
  }
}
