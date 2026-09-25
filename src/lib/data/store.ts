import "server-only"

import { readFile } from "node:fs/promises"
import path from "node:path"

import type { FacilityOption } from "@/components/benchmark/facility-picker"

import { isTrendMetric, type MetricDef } from "./datasets"
import type {
  DatasetId,
  Dictionary,
  Facility,
  FieldsFile,
  FinancialFacility,
  Manifest,
  MetricsFile,
  UtilizationFacility,
} from "./types"

/*
 * Data access for every HCAI dataset the ETL produces (data/processed/<id>/).
 *
 * v2 reads static JSON, cached in memory per server instance. This module is the
 * only place the app touches storage, so moving to a real database (Postgres via
 * Prisma, or SQLite locally — e.g. once users upload their own data or save peer
 * groups) means reimplementing these functions against tables:
 *   facilities(id, name, county, ownership, latitude, longitude, ...)
 *   facility_year_metrics(dataset, facility_id, year, metric, value)
 *   facility_year_fields(dataset, facility_id, year, field_code, value)
 * and leaving the callers unchanged.
 */

const PROCESSED_DIR = path.join(process.cwd(), "data", "processed")

export const DATASET_IDS: DatasetId[] = ["hafd-selected", "hau"]

const cache = new Map<string, Promise<unknown>>()

function memo<T>(key: string, make: () => Promise<T>): Promise<T> {
  let entry = cache.get(key) as Promise<T> | undefined
  if (!entry) {
    entry = make()
    // Don't cache failures; let the next request retry.
    entry.catch(() => cache.delete(key))
    cache.set(key, entry)
  }
  return entry
}

function load<T>(dataset: DatasetId, file: string): Promise<T> {
  return memo(`${dataset}/${file}`, () =>
    readFile(path.join(PROCESSED_DIR, dataset, file), "utf8").then((text) => JSON.parse(text) as T)
  )
}

export const getMetrics = (dataset: DatasetId) => load<MetricsFile>(dataset, "metrics.json")
export const getFields = (dataset: DatasetId) => load<FieldsFile>(dataset, "fields.json")
export const getDictionary = (dataset: DatasetId) => load<Dictionary>(dataset, "dictionary.json")
export const getManifest = (dataset: DatasetId) => load<Manifest>(dataset, "manifest.json")

// -- facilities: one directory across datasets --------------------------------

const TYPE_OF_CARE: Record<string, string> = {
  "General Medical / Surgical": "General",
  Psychiatric: "Psychiatric",
  Pediatric: "Children",
}

/** HCAI's financial "type of hospital" for a facility that only files utilization. */
function inferHospitalType(u: UtilizationFacility) {
  if (/kaiser/i.test(u.hcaiName)) return "Kaiser"
  if (u.licenseCategory === "Psychiatric Health Facility") return "PHF"
  if (u.ownership === "state") return "State"
  if (u.principalService?.startsWith("Long-Term Care")) return "LTC Emphasis"
  return "Comparable"
}

function merge(fin: FinancialFacility | undefined, util: UtilizationFacility | undefined): Facility {
  const base = (fin ?? util)!
  const financialYears = fin?.years ?? []
  const utilizationYears = util?.years ?? []
  // Licensed beds from whichever dataset reported more recently (utilization
  // counts every campus on the license as of Dec 31).
  const beds =
    util && (utilizationYears.at(-1) ?? 0) >= (financialYears.at(-1) ?? 0)
      ? (util.licensedBeds ?? fin?.licensedBeds ?? null)
      : (fin?.licensedBeds ?? util?.licensedBeds ?? null)
  return {
    id: base.id,
    name: base.name,
    hcaiName: base.hcaiName,
    formerNames: [...new Set([...(fin?.formerNames ?? []), ...(util?.formerNames ?? [])])].filter((n) => n !== base.name),
    county: fin?.county ?? util?.county ?? null,
    city: fin?.city ?? util?.city ?? null,
    owner: fin?.owner ?? util?.parentOrganization ?? null,
    ownership: fin?.ownership ?? util!.ownership,
    typeOfCare: fin?.typeOfCare ?? (util?.principalService ? (TYPE_OF_CARE[util.principalService] ?? "Specialty") : null),
    hospitalType: fin?.hospitalType ?? (util ? inferHospitalType(util) : null),
    teaching: fin?.teaching ?? util!.teaching,
    rural: fin?.rural ?? util!.rural,
    traumaLevel: util?.traumaLevel ?? fin?.traumaLevel ?? null,
    licensedBeds: beds,
    fiscalYearEnd: fin?.fiscalYearEnd ?? null,
    years: financialYears,
    financialYears,
    utilizationYears,
    zip: util?.zip ?? null,
    latitude: util?.latitude ?? null,
    longitude: util?.longitude ?? null,
    licenseCategory: util?.licenseCategory ?? null,
    edLevel: util?.edLevel ?? null,
    campuses: util?.campuses ?? [],
  }
}

export function getFacilities(): Promise<Facility[]> {
  return memo("facilities", async () => {
    const [fin, util] = await Promise.all([
      load<FinancialFacility[]>("hafd-selected", "facilities.json"),
      load<UtilizationFacility[]>("hau", "facilities.json"),
    ])
    const finById = new Map(fin.map((f) => [f.id, f]))
    const utilById = new Map(util.map((f) => [f.id, f]))
    const ids = new Set([...finById.keys(), ...utilById.keys()])
    return [...ids].map((id) => merge(finById.get(id), utilById.get(id))).sort((a, b) => a.name.localeCompare(b.name))
  })
}

export async function getFacility(id: string) {
  const facilities = await getFacilities()
  return facilities.find((f) => f.id === id) ?? null
}

/** Latest year with data in any dataset. */
export const lastReportedYear = (f: Facility) => Math.max(f.financialYears.at(-1) ?? 0, f.utilizationYears.at(-1) ?? 0)

/** The slice of a facility the client-side picker needs. */
export function toFacilityOption(f: Facility): FacilityOption {
  return {
    id: f.id,
    name: f.name,
    formerNames: f.formerNames,
    county: f.county,
    city: f.city,
    licensedBeds: f.licensedBeds,
    typeOfCare: f.typeOfCare,
    hospitalType: f.hospitalType,
    lastYear: lastReportedYear(f),
  }
}

export async function getFacilityOptions() {
  return (await getFacilities()).map(toFacilityOption)
}

// -- metrics catalog ------------------------------------------------------------

/** Every benchmarkable metric across datasets, financial first, in dictionary order. */
export function getMetricCatalog(): Promise<MetricDef[]> {
  return memo("catalog", async () => {
    const dictionaries = await Promise.all(DATASET_IDS.map(getDictionary))
    return dictionaries.flatMap((d) =>
      d.metrics
        .filter((m) => m.category != null)
        .map((m) => ({ ...m, category: m.category!, dataset: d.dataset }) as MetricDef)
    ).sort((a, b) => (a.category === b.category ? 0 : a.category === "financial" ? -1 : 1))
  })
}

export async function getTrendMetrics() {
  return (await getMetricCatalog()).filter(isTrendMetric)
}

/** Latest year across all datasets. */
export async function getLatestYear() {
  const manifests = await Promise.all(DATASET_IDS.map(getManifest))
  return Math.max(...manifests.map((m) => m.years.at(-1) ?? 0))
}

// -- raw fields (Translate) -----------------------------------------------------

/** Raw field values for one facility, keyed by year then field code. */
export async function getFacilityFieldValues(dataset: DatasetId, id: string) {
  const file = await getFields(dataset)
  const byYear = file.values[id]
  if (!byYear) return null
  const values: Record<string, Record<string, number | null>> = {}
  for (const [year, row] of Object.entries(byYear)) {
    values[year] = Object.fromEntries(file.fields.map((code, i) => [code, row[i]]))
  }
  return { values, meta: file.meta[id] ?? {} }
}
