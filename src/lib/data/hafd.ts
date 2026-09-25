import "server-only"

import { readFile } from "node:fs/promises"
import path from "node:path"

import type { Dictionary, Facility, FieldsFile, Manifest, MetricsFile } from "./types"

/*
 * Data access for the HCAI Annual Financial Data "Selected File".
 *
 * v1 reads the static JSON produced by the Python ETL (data/processed/...),
 * cached in memory per server instance. This module is the only place the app
 * touches storage, so moving to a real database later (Postgres via Prisma, or
 * SQLite locally — e.g. once users can upload their own data or save peer
 * groups) means reimplementing these functions against tables:
 *   facilities(id, name, county, ownership, ...)
 *   facility_year_metrics(facility_id, year, operating_margin, ...)
 *   facility_year_fields(facility_id, year, field_code, value)
 * and leaving the callers unchanged.
 */

const DATASET_DIR = path.join(process.cwd(), "data", "processed", "hafd-selected")

const cache = new Map<string, Promise<unknown>>()

function load<T>(file: string): Promise<T> {
  let entry = cache.get(file)
  if (!entry) {
    entry = readFile(path.join(DATASET_DIR, file), "utf8").then((text) => JSON.parse(text) as T)
    // Don't cache failures; let the next request retry.
    entry.catch(() => cache.delete(file))
    cache.set(file, entry)
  }
  return entry as Promise<T>
}

export const getFacilities = () => load<Facility[]>("facilities.json")
export const getMetrics = () => load<MetricsFile>("metrics.json")
export const getFields = () => load<FieldsFile>("fields.json")
export const getDictionary = () => load<Dictionary>("dictionary.json")
export const getManifest = () => load<Manifest>("manifest.json")

export async function getFacility(id: string) {
  const facilities = await getFacilities()
  return facilities.find((f) => f.id === id) ?? null
}

/** Raw field values for one facility, keyed by year then field code. */
export async function getFacilityFieldValues(id: string) {
  const file = await getFields()
  const byYear = file.values[id]
  if (!byYear) return null
  const values: Record<string, Record<string, number | null>> = {}
  for (const [year, row] of Object.entries(byYear)) {
    values[year] = Object.fromEntries(file.fields.map((code, i) => [code, row[i]]))
  }
  return { values, meta: file.meta[id] ?? {} }
}
