import "server-only"

import { DATASETS } from "@/lib/data/datasets"
import { getSourceStatus } from "@/lib/data/freshness"
import {
  getDictionary,
  getFacility,
  getFacilityFieldValues,
  getFacilityMetricValues,
  getManifest,
  getMetrics,
  getUnits,
  getUtilizationProfile,
} from "@/lib/data/store"
import type { DatasetId, HcaiDatasetId, PointDetail } from "@/lib/data/types"

import { computeCalcs } from "./calcs"
import type { AnnualReportData, BedTypeYear, QualityMeasure, ReportYear, SourceNote } from "./types"

// Everything Overview's annual report reads for one hospital, for /api/report/[id] (V7.5.5). It reads the same files
// Data definitions and Compare read (fields, metrics, units, manifests) and adds only the annual report's own measures
// (calcs.ts). Nothing about any other hospital is read or returned.

/** The CMS and CDPH measures in the quality addendum. VRE is left out: CDPH compares it with similar hospitals. */
const ADDENDUM: { dataset: DatasetId; id: string }[] = [
  { dataset: "cms-care-compare", id: "overallStar" },
  { dataset: "cms-care-compare", id: "readmHospitalWide" },
  { dataset: "cms-care-compare", id: "readmHybrid" },
  { dataset: "cdph-hai", id: "clabsiSir" },
  { dataset: "cdph-hai", id: "cdiSir" },
  { dataset: "cdph-hai", id: "mrsaSir" },
]

async function reportYears(dataset: HcaiDatasetId, id: string): Promise<ReportYear[]> {
  const [raw, measures] = await Promise.all([getFacilityFieldValues(dataset, id), getFacilityMetricValues(dataset, id)])
  if (!raw) return []
  return Object.keys(raw.values)
    .map(Number)
    .sort((a, b) => a - b)
    .map((year) => {
      const fields = raw.values[year]
      const meta = raw.meta[year] ?? {
        days: 365,
        reports: 1,
        annualized: false,
        status: null,
        begin: null,
        end: null,
      }
      const get = (code: string) => {
        const v = fields[code]
        return typeof v === "number" && Number.isFinite(v) ? v : null
      }
      return {
        year,
        meta,
        fields,
        measures: measures[year] ?? {},
        calcs: computeCalcs(dataset, get, {
          days: meta.days,
          reports: meta.reports,
          annualized: meta.annualized,
          year,
        }),
      }
    })
}

async function bedTypes(id: string) {
  const file = await getUnits()
  const byYear = file.values[id] ?? {}
  const out: Record<string, BedTypeYear[]> = {}
  for (const [year, units] of Object.entries(byYear)) {
    out[year] = file.units.flatMap((u) => {
      const v = units[u.id]
      if (!v || !(typeof v.licensedBeds === "number" && v.licensedBeds > 0)) return []
      return [
        {
          id: u.id,
          label: u.description,
          licensedBeds: v.licensedBeds,
          occupancy: v.occupancy ?? null,
          alos: v.alos ?? null,
          discharges: v.discharges ?? null,
          inpatientDays: v.inpatientDays ?? null,
        },
      ]
    })
  }
  return out
}

async function addendum(id: string): Promise<AnnualReportData["addendum"]> {
  const datasets = [...new Set(ADDENDUM.map((a) => a.dataset))]
  const [files, dictionaries, manifests] = await Promise.all([
    Promise.all(datasets.map(getMetrics)),
    Promise.all(datasets.map(getDictionary)),
    Promise.all(datasets.map(getManifest)),
  ])
  const measures: QualityMeasure[] = []
  for (const { dataset, id: metricId } of ADDENDUM) {
    const i = datasets.indexOf(dataset)
    const def = dictionaries[i].metrics.find((m) => m.id === metricId)
    if (!def) continue
    const periods = manifests[i].periods?.[metricId] ?? {}
    const points = Object.entries(files[i][id] ?? {})
      .flatMap(([year, row]) => {
        const value = row[metricId]
        if (typeof value !== "number" || !Number.isFinite(value)) return []
        const detail: PointDetail | null = row.detail?.[metricId] ?? null
        const period = detail?.period ?? periods[year]
        return [
          {
            year: Number(year),
            value,
            detail: period ? { ...detail, period } : detail,
          },
        ]
      })
      .sort((a, b) => a.year - b.year)
    if (points.length) {
      measures.push({
        id: metricId,
        label: def.label,
        unit: def.unit === "pct" ? "pct" : "number",
        decimals: def.decimals,
        comparedTo: def.comparedTo ?? null,
        points,
      })
    }
  }
  const shared = manifests[datasets.indexOf("cms-care-compare")].sharedReporting?.[id]
  return { measures, sharedWith: shared ? shared.reportedWithName : null }
}

async function sources(id: string): Promise<SourceNote[]> {
  const ids: DatasetId[] = ["hafd-selected", "hau", "case-mix-index", "cms-care-compare", "cdph-hai"]
  const [manifests, statuses] = await Promise.all([Promise.all(ids.map(getManifest)), Promise.all(ids.map((d) => getSourceStatus(d, id)))])
  return ids.map((d, i) => ({
    id: d,
    label: DATASETS[d].label,
    sourcePage: DATASETS[d].sourcePage,
    periodType: DATASETS[d].periodType,
    years: manifests[i].years,
    processed: statuses[i].processed,
  }))
}

export async function getAnnualReport(id: string): Promise<AnnualReportData | null> {
  const facility = await getFacility(id)
  if (!facility) return null
  const [financial, utilization, beds, caseMixFile, add, notes, util] = await Promise.all([
    reportYears("hafd-selected", id),
    reportYears("hau", id),
    bedTypes(id),
    getMetrics("case-mix-index"),
    addendum(id),
    sources(id),
    getUtilizationProfile(id),
  ])
  const caseMix = Object.entries(caseMixFile[id] ?? {})
    .flatMap(([year, row]) => (typeof row.caseMixIndex === "number" ? [{ year: Number(year), value: row.caseMixIndex }] : []))
    .sort((a, b) => a.year - b.year)
  return {
    facility,
    profile: {
      parentOrganization: util?.parentOrganization ?? null,
      principalService: util?.principalService ?? null,
    },
    financial,
    utilization,
    bedTypes: beds,
    caseMix,
    addendum: add,
    sources: notes,
  }
}
