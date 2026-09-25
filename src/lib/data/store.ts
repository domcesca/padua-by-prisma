import "server-only"

import { readFile } from "node:fs/promises"
import path from "node:path"

import type { FacilityOption } from "@/components/benchmark/facility-picker"

import { HCAI_DATASETS, isTrendMetric, type MetricDef } from "./datasets"
import type {
  AcsCounty,
  CommunityContext,
  DatasetId,
  Dictionary,
  Facility,
  FacilityUnit,
  FieldsFile,
  FinancialFacility,
  HcaiDatasetId,
  Manifest,
  MediCalCounty,
  MetricsFile,
  UnitsFile,
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

export const DATASET_IDS: DatasetId[] = ["hafd-selected", "hau", "case-mix-index", "cms-care-compare", "cdph-hai"]

const CATEGORY_ORDER = { financial: 0, utilization: 1, quality: 2 } as const

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
export const getFields = (dataset: HcaiDatasetId) => load<FieldsFile>(dataset, "fields.json")
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
    ).sort((a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category])
  })
}

export async function getTrendMetrics() {
  return (await getMetricCatalog()).filter(isTrendMetric)
}

/** Latest year HCAI has reported (financial or utilization); a hospital that stopped before it is flagged. */
export async function getLatestYear() {
  const manifests = await Promise.all(HCAI_DATASETS.map(getManifest))
  return Math.max(...manifests.map((m) => m.years.at(-1) ?? 0))
}

/** Every year any dataset covers, ascending. */
export async function getAllYears() {
  const manifests = await Promise.all(DATASET_IDS.map(getManifest))
  return [...new Set(manifests.flatMap((m) => m.years))].sort((a, b) => a - b)
}

/** Years in which a metric has a value for at least one hospital (i.e. its source published it). */
export function getPublishedYears(metric: MetricDef): Promise<Set<number>> {
  return memo(`published/${metric.dataset}/${metric.id}`, async () => {
    const file = await getMetrics(metric.dataset)
    const years = new Set<number>()
    for (const byYear of Object.values(file)) {
      for (const [year, row] of Object.entries(byYear)) {
        if (typeof row[metric.id] === "number") years.add(Number(year))
      }
    }
    return years
  })
}

// -- bed classifications --------------------------------------------------------

export const getUnits = () => load<UnitsFile>("hau", "units.json")

/** The units a hospital has had licensed beds in, in HCAI's line order, with the latest bed count. */
export async function getFacilityUnits(facilityId: string): Promise<FacilityUnit[]> {
  const file = await getUnits()
  const byYear = file.values[facilityId] ?? {}
  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b)
  return file.units.flatMap((u) => {
    const present = years.filter((y) => byYear[y]?.[u.id])
    if (!present.length) return []
    const last = present.at(-1)!
    return [{ id: u.id, label: u.label, description: u.description, beds: byYear[last][u.id].licensedBeds ?? null, firstYear: present[0], lastYear: last }]
  })
}

// -- raw fields (Translate) -----------------------------------------------------

/** Raw field values for one facility, keyed by year then field code. */
export async function getFacilityFieldValues(dataset: HcaiDatasetId, id: string) {
  const file = await getFields(dataset)
  const byYear = file.values[id]
  if (!byYear) return null
  const values: Record<string, Record<string, number | null>> = {}
  for (const [year, row] of Object.entries(byYear)) {
    values[year] = Object.fromEntries(file.fields.map((code, i) => [code, row[i]]))
  }
  return { values, meta: file.meta[id] ?? {} }
}

// -- county context -------------------------------------------------------------

/** A county-level context file, or null when that source hasn't been processed (e.g. no Census key yet). */
function loadOptional<T>(dir: string, file: string): Promise<T | null> {
  return memo(`${dir}/${file}`, () =>
    readFile(path.join(PROCESSED_DIR, dir, file), "utf8")
      .then((text) => JSON.parse(text) as T)
      .catch((e: NodeJS.ErrnoException) => {
        if (e.code === "ENOENT") return null
        throw e
      })
  )
}

/** Census and Medi-Cal context for a county (HCAI county names, e.g. "Los Angeles"). */
export async function getCommunityContext(county: string | null): Promise<CommunityContext | null> {
  if (!county) return null
  const [acs, acsManifest, mediCal] = await Promise.all([
    loadOptional<Record<string, AcsCounty>>("acs-county", "counties.json"),
    loadOptional<{ vintage: string }>("acs-county", "manifest.json"),
    loadOptional<Record<string, MediCalCounty>>("dhcs-medi-cal", "counties.json"),
  ])
  const a = acs?.[county]
  const m = mediCal?.[county]
  if (!a && !m) return null
  // The latest full year of Medi-Cal enrollment, falling back to the newest partial one.
  const years = m ? Object.keys(m.years).map(Number).sort((x, y) => x - y) : []
  const fullYear = [...years].reverse().find((y) => m!.years[y].months === 12) ?? years.at(-1)
  return {
    county,
    acs: a ? { ...a, vintage: acsManifest?.vintage ?? "" } : null,
    mediCal: m && fullYear != null ? { ...m.latest, year: fullYear, annual: m.years[fullYear] ?? null } : null,
  }
}

// -- Propose: CMS reference data (not hospital metrics) ------------------------

export type IppsDrg = {
  code: string
  title: string
  weight: number
  type: "MED" | "SURG" | null
  mdc: string | null
  gmlos: number | null
  amlos: number | null
  postAcute: boolean
  specialPay: boolean
}

export type IppsManifest = {
  fiscalYear: number
  effective: string
  sourcePage: string
  standardizedAmount: { total: number; laborRelated: number; nonlaborRelated: number; update: number | null; basis: string }
  capitalRate: number
}

export type InpatientCasesManifest = { years: number[]; sourcePage: string; sharedReporting: Record<string, { reportedWith: string; reportedWithName: string }> }

const loadReference = <T>(dir: string, file: string) =>
  memo(`${dir}/${file}`, () => readFile(path.join(PROCESSED_DIR, dir, file), "utf8").then((text) => JSON.parse(text) as T))

/** MS-DRGs with relative weights, from the latest IPPS Final Rule (Table 5). */
export const getIppsDrgs = () => loadReference<IppsDrg[]>("cms-ipps", "drgs.json")
export const getIppsManifest = () => loadReference<IppsManifest>("cms-ipps", "manifest.json")
/** Medicare fee-for-service cases per hospital, year, and MS-DRG (11+ cases only). */
export const getInpatientCases = () => loadReference<Record<string, Record<string, Record<string, number>>>>("cms-inpatient", "cases.json")
export const getInpatientCasesManifest = () => loadReference<InpatientCasesManifest>("cms-inpatient", "manifest.json")

/** HRRP and HAC Reduction Program standing plus estimated Medicare payments, per HCAI hospital (cms-penalties). */
export type PenaltyHospital = {
  ccn: string
  cmsName: string | null
  hrrp: {
    fiscalYear: number
    adjustmentFactor: number
    reduction: number
    peerGroup: number | null
    neutralityModifier: number
    conditions: Record<string, { discharges: number | null; err: number; peerMedian: number | null; paymentRatio: number | null; predicted: number | null; expected: number | null; readmissions: number | null }>
  } | null
  hac: {
    fiscalYear: number
    measures: Record<string, { value: number | null; z: number }>
    totalScore: number | null
    penalized: boolean | null
    footnote: string | null
  } | null
  payments: { fiscalYear: number; cases: number; caseMixIndex: number; wageIndex: number; ime: number; dsh: number; outlier: number; baseOperating: number; operating: number } | null
}

type Period = { start: string; end: string }
export type PenaltyManifest = {
  hrrp: { fiscalYear: number; period: Period; minDischarges: number; cap: number; sourcePage: string }
  hac: {
    fiscalYear: number
    periods: { psi90: Period; hai: Period }
    reduction: number
    measures: Record<string, { mean: number; sd: number; low: number; high: number }>
    cutoff: number
    lowestPenalized: number
    sourcePage: string
  }
  payments: { fiscalYear: number; sourcePage: string }
  sharedReporting: Record<string, { ccn: string; reportedWith: string; reportedWithName: string }>
}

export const getPenaltyHospitals = () => loadReference<Record<string, PenaltyHospital>>("cms-penalties", "hospitals.json")
export const getPenaltyManifest = () => loadReference<PenaltyManifest>("cms-penalties", "manifest.json")

/** OPPS service APCs with national payment rates (cms-opps; Addendum A only, no CPT content). */
export type OppsApc = { code: string; title: string; si: string; weight: number | null; rate: number }
export type OppsManifest = {
  calendarYear: number
  quarter: string
  sourcePage: string
  conversionFactor: number | null
  services: { year: number; sourcePage: string; apcs: string[]; sharedReporting: Record<string, { reportedWith: string; reportedWithName: string }> }
}
export const getOppsApcs = () => loadReference<OppsApc[]>("cms-opps", "apcs.json")
export const getOppsManifest = () => loadReference<OppsManifest>("cms-opps", "manifest.json")
/** Medicare fee-for-service outpatient services per hospital, year, and comprehensive APC (11+ only). */
export const getOutpatientServices = () => loadReference<Record<string, Record<string, Record<string, number>>>>("cms-opps", "services.json")
