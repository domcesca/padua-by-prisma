import "server-only"

import { DEFAULT_FILTERS } from "@/lib/benchmark/filters"
import { resolvePeerGroup } from "@/lib/benchmark/peers"
import {
  getFacilities,
  getFields,
  getInpatientCases,
  getInpatientCasesManifest,
  getIppsDrgs,
  getIppsManifest,
  getManifest,
  getMetrics,
  getOppsApcs,
  getOppsManifest,
  getOutpatientServices,
  getPenaltyHospitals,
  getPenaltyManifest,
  getWageIndexHospitals,
  getWageIndexManifest,
} from "@/lib/data/store"
import { SEARCH_TERMS } from "./search-terms"
import type { ApcOption, OutpatientData } from "./outpatient"
import type { PenaltyData } from "./penalty"
import type { DrgOption, ReimbursementData } from "./reimbursement"
import { MAX_LONG_TERM_CARE_SHARE, type SavingsData } from "./savings"
import type { HospitalWageIndex } from "./wage-index"

// Server data for Propose's modules, served by /api/propose/<module>. A module that needs data
// registers a loader here; one that doesn't (Custom) has nothing to add.

type Loader = (facilityId: string | null) => Promise<unknown>

export const MODULE_DATA: Record<string, Loader> = {
  reimbursement: loadReimbursement,
  outpatient: loadOutpatient,
  savings: loadSavings,
  penalty: loadPenalty,
  // Not a module: the hospital's payer mix, for Advanced mode's "use this hospital's mix".
  payermix: loadPayerMix,
}

const MDC_NAMES: Record<string, string> = {
  PRE: "Pre-MDC: transplants, ECMO, tracheostomy",
  "01": "Nervous system",
  "02": "Eye",
  "03": "Ear, nose, mouth, and throat",
  "04": "Respiratory system",
  "05": "Circulatory system",
  "06": "Digestive system",
  "07": "Hepatobiliary system and pancreas",
  "08": "Musculoskeletal system and connective tissue",
  "09": "Skin, subcutaneous tissue, and breast",
  "10": "Endocrine, nutritional, and metabolic",
  "11": "Kidney and urinary tract",
  "12": "Male reproductive system",
  "13": "Female reproductive system",
  "14": "Pregnancy and childbirth",
  "15": "Newborns and neonates",
  "16": "Blood and immunological disorders",
  "17": "Myeloproliferative diseases and neoplasms",
  "18": "Infectious and parasitic diseases",
  "19": "Mental diseases and disorders",
  "20": "Alcohol and drug use",
  "21": "Injuries, poisonings, and toxic effects",
  "22": "Burns",
  "23": "Factors influencing health status",
  "24": "Multiple significant trauma",
  "25": "HIV infections",
}
const NO_MDC = "Procedures unrelated to the principal diagnosis"

// CMS publishes titles in capitals; these stay capitalized when the rest goes to sentence case.
const ACRONYMS = new Set(["MCC", "CC", "CC/MCC", "O.R.", "MV", "HIV", "D&C", "CNS", "URI", "PTCA", "AICD", "AMI", "ECMO", "TPA", "AMA"])

function sentenceCase(title: string) {
  const words = title.split(/\s+/).map((w) => {
    const bare = w.replace(/^[("]+|[),"]+$/g, "")
    return ACRONYMS.has(bare) ? w : w.toLowerCase()
  })
  const text = words.join(" ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * Plain-language terms per code, from search-terms.ts: DRGs (`drgs`/`related`) or APCs (`apcs`/`relatedApcs`).
 * `leadTerms` are the ones whose entry lists the code as a direct match; the picker ranks those higher. Refs that match
 * no code, and ranges that cross groups (usually a range sweeping in a neighbor), are logged, not fatal.
 */
function codeTerms(items: { code: string; group: string | null }[], kind: "drg" | "apc") {
  const codes = items.map((d) => d.code)
  const groupOf = new Map(items.map((d) => [d.code, d.group]))
  const all = new Map<string, Set<string>>(codes.map((c) => [c, new Set()]))
  const lead = new Map<string, Set<string>>(codes.map((c) => [c, new Set()]))
  const unmatched: string[] = []
  const mixed: string[] = []
  for (const entry of SEARCH_TERMS) {
    const [direct, related] = kind === "drg" ? [entry.drgs, entry.related] : [entry.apcs, entry.relatedApcs]
    const refs = [...(direct ?? []).map((ref) => ({ ref, isLead: true })), ...(related ?? []).map((ref) => ({ ref, isLead: false }))]
    for (const { ref, isLead } of refs) {
      const [from, to = from] = ref.split("-")
      const hits = codes.filter((c) => c.length === from.length && c >= from && c <= to)
      if (!hits.length) unmatched.push(`${ref} (${entry.terms[0]})`)
      if (new Set(hits.map((c) => groupOf.get(c))).size > 1) mixed.push(`${ref} (${entry.terms[0]})`)
      for (const code of hits) {
        entry.terms.forEach((t) => all.get(code)!.add(t))
        if (isLead) entry.terms.forEach((t) => lead.get(code)!.add(t))
      }
    }
  }
  const noun = kind === "drg" ? "DRG" : "APC"
  if (unmatched.length) console.warn(`${noun} search terms match no code in the current table: ${unmatched.join(", ")}`)
  if (mixed.length) console.warn(`${noun} search term ranges span more than one group: ${mixed.join(", ")}`)
  return (code: string) => ({ terms: [...(all.get(code) ?? [])], leadTerms: [...(lead.get(code) ?? [])] })
}

/** Plain-language terms per DRG code; ranges are checked against body systems (MDC). */
export const drgTerms = (drgs: { code: string; mdc: string | null }[]) => codeTerms(drgs.map((d) => ({ code: d.code, group: d.mdc })), "drg")

// -- Wage index (Advanced mode) -----------------------------------------------------------------------------------------

/** The hospital's CMS wage index for IPPS or OPPS payments; a hospital CMS pays under another's number shares its index. */
async function hospitalWageIndex(facilityId: string | null, system: "ipps" | "opps"): Promise<HospitalWageIndex | null> {
  if (!facilityId) return null
  const [hospitals, manifest, facilities] = await Promise.all([getWageIndexHospitals(), getWageIndexManifest(), getFacilities()])
  const shared = manifest.sharedReporting[facilityId]
  const h = hospitals[shared?.reportedWith ?? facilityId]
  const own = h?.[system]
  if (!h || !own) return null
  const m = manifest[system]
  return {
    hospital: facilities.find((f) => f.id === facilityId)?.name ?? h.cmsName ?? `CCN ${h.ccn}`,
    value: own.wageIndex,
    year: system === "ipps" ? `FY ${manifest.ipps.fiscalYear}` : `CY ${manifest.opps.calendarYear}`,
    ccn: h.ccn,
    table: m.table,
    sourcePage: m.sourcePage,
    reportedWithName: shared?.reportedWithName ?? null,
  }
}

let drgOptions: Promise<DrgOption[]> | null = null
function getDrgOptions() {
  drgOptions ??= getIppsDrgs().then((drgs) => {
    const terms = drgTerms(drgs)
    return drgs.map((d) => ({
      code: d.code,
      label: sentenceCase(d.title),
      weight: d.weight,
      type: d.type,
      mdc: d.mdc,
      mdcName: d.mdc ? (MDC_NAMES[d.mdc] ?? `MDC ${d.mdc}`) : NO_MDC,
      gmlos: d.gmlos,
      ...terms(d.code),
    }))
  })
  drgOptions.catch(() => (drgOptions = null))
  return drgOptions
}

async function loadReimbursement(facilityId: string | null): Promise<ReimbursementData> {
  const [manifest, drgs, cases, casesManifest, facilities, wageIndex, wageManifest] = await Promise.all([
    getIppsManifest(),
    getDrgOptions(),
    getInpatientCases(),
    getInpatientCasesManifest(),
    getFacilities(),
    hospitalWageIndex(facilityId, "ipps"),
    getWageIndexManifest(),
  ])
  const year = casesManifest.years.at(-1)!
  const facility = facilityId ? facilities.find((f) => f.id === facilityId) : undefined

  let baseline: ReimbursementData["baseline"] = null
  let peers: ReimbursementData["peers"] = null
  if (facility) {
    const shared = casesManifest.sharedReporting[facility.id]
    const own = cases[shared?.reportedWith ?? facility.id]?.[year]
    if (own) baseline = { year, cases: own, sourcePage: casesManifest.sourcePage, reportedWithName: shared?.reportedWithName ?? null }

    const group = resolvePeerGroup(facility, facilities, DEFAULT_FILTERS)
    const peerCases = group.peers.map((p) => cases[p.id]?.[year]).filter((c): c is Record<string, number> => !!c)
    if (peerCases.length) {
      const byDrg: ReimbursementData["peers"] = { description: group.description, count: peerCases.length, cases: {} }
      const codes = new Set(peerCases.flatMap((c) => Object.keys(c)))
      for (const code of codes) {
        const values = peerCases.map((c) => c[code]).filter((n): n is number => n != null)
        byDrg.cases[code] = { reporting: values.length, median: median(values) }
      }
      peers = byDrg
    }
  }

  return {
    fiscalYear: manifest.fiscalYear,
    effective: manifest.effective,
    sourcePage: manifest.sourcePage,
    rate: manifest.standardizedAmount.total,
    rateBasis: manifest.standardizedAmount.basis,
    capitalRate: manifest.capitalRate,
    laborSplit: { above: wageManifest.ipps.standardizedAmount.wageIndexAboveOne, atMost: wageManifest.ipps.standardizedAmount.wageIndexAtMostOne },
    wageIndex: wageManifest.ipps.fiscalYear === manifest.fiscalYear ? wageIndex : null,
    drgs,
    baseline,
    peers,
  }
}

// -- Cost savings: cost per adjusted patient day (HCAI annual financial data) ---------------

const COST_FIELDS = ["TOT_OP_EXP", "DAY_TOT", "GR_PT_REV", "GR_IP_TOT", "DAY_LTC"] as const

/**
 * Operating expense ÷ adjusted patient days, where adjusted days = patient days × gross patient
 * revenue ÷ gross inpatient revenue: the per-day version of Benchmark's expense per adjusted
 * discharge. By year, for years with all four fields.
 */
async function costPerDayByYear() {
  const file = await getFields("hafd-selected")
  const at = COST_FIELDS.map((f) => file.fields.indexOf(f))
  if (at.some((i) => i < 0)) throw new Error(`hafd-selected fields.json is missing one of ${COST_FIELDS.join(", ")}`)
  return (id: string) => {
    const out = new Map<number, NonNullable<SavingsData["costPerDay"]>>()
    for (const [year, row] of Object.entries(file.values[id] ?? {})) {
      const [expense, days, gross, grossIp, ltc] = at.map((i) => row[i])
      if (!expense || !days || !gross || !grossIp || expense <= 0 || days <= 0 || grossIp <= 0) continue
      const adjusted = (days * gross) / grossIp
      out.set(Number(year), {
        year: Number(year),
        value: Math.round(expense / adjusted),
        operatingExpense: expense,
        patientDays: days,
        adjustedPatientDays: Math.round(adjusted),
        longTermCareShare: (ltc ?? 0) / days,
      })
    }
    return out
  }
}

async function loadSavings(facilityId: string | null): Promise<SavingsData> {
  const [facilities, byYear, manifest] = await Promise.all([getFacilities(), costPerDayByYear(), getManifest("hafd-selected")])
  const facility = facilityId ? facilities.find((f) => f.id === facilityId) : undefined
  const own = facility ? byYear(facility.id) : null
  const year = own?.size ? Math.max(...own.keys()) : null
  let peers: SavingsData["peers"] = null
  if (facility && year != null) {
    const group = resolvePeerGroup(facility, facilities, DEFAULT_FILTERS)
    const values = group.peers
      .map((p) => byYear(p.id).get(year))
      .filter((c) => c != null && c.longTermCareShare <= MAX_LONG_TERM_CARE_SHARE)
      .map((c) => c!.value)
    if (values.length) peers = { description: group.description, count: values.length, median: Math.round(median(values)) }
  }
  return { costPerDay: year != null ? own!.get(year)! : null, peers, sourcePage: manifest.sourcePage }
}

// -- Avoided penalties: HRRP and HAC Reduction Program (cms-penalties) ------------------------

async function loadPenalty(facilityId: string | null): Promise<PenaltyData> {
  const [hospitals, manifest] = await Promise.all([getPenaltyHospitals(), getPenaltyManifest()])
  const shared = facilityId ? manifest.sharedReporting[facilityId] : undefined
  const h = facilityId ? hospitals[shared?.reportedWith ?? facilityId] : undefined
  return {
    reportedWithName: shared?.reportedWithName ?? null,
    hrrp: {
      ...manifest.hrrp,
      hospital: h?.hrrp
        ? { reduction: h.hrrp.reduction, peerGroup: h.hrrp.peerGroup, neutralityModifier: h.hrrp.neutralityModifier, conditions: h.hrrp.conditions }
        : null,
    },
    hac: {
      fiscalYear: manifest.hac.fiscalYear,
      periods: manifest.hac.periods,
      reduction: manifest.hac.reduction,
      cutoff: manifest.hac.cutoff,
      measures: manifest.hac.measures as PenaltyData["hac"]["measures"],
      sourcePage: manifest.hac.sourcePage,
      hospital: h?.hac && h.hac.totalScore != null ? { measures: h.hac.measures, totalScore: h.hac.totalScore, penalized: h.hac.penalized } : null,
    },
    payments: {
      ...manifest.payments,
      hospital: h?.payments
        ? { cases: h.payments.cases, caseMixIndex: h.payments.caseMixIndex, wageIndex: h.payments.wageIndex, baseOperating: h.payments.baseOperating, operating: h.payments.operating }
        : null,
    },
  }
}

// -- Outpatient reimbursement: OPPS APCs (cms-opps) ---------------------------------------------------------------------

/** Picker groups for APCs, by code. */
function apcGroup(code: string) {
  const n = Number(code)
  const within = (...ranges: [number, number][]) => ranges.some(([a, b]) => n >= a && n <= b)
  if (n < 2000) return "New technology (by cost level)"
  if (within([5012, 5012], [5021, 5045], [8011, 8011])) return "Visits, emergency, and observation"
  if (within([5521, 5524], [5571, 5573], [5591, 5594], [8004, 8008])) return "Imaging"
  if (within([5611, 5627], [5661, 5661])) return "Radiation oncology"
  if (within([5671, 5674], [5721, 5724], [5741, 5743])) return "Diagnostic tests and pathology"
  if (within([5691, 5694])) return "Drug administration and infusion"
  if (within([5771, 5771], [5781, 5811])) return "Therapy, rehab, and respiratory"
  if (within([5821, 5823], [5851, 5864], [8010, 8010])) return "Behavioral health"
  if (within([5051, 5061], [6000, 6002])) return "Wound care and skin"
  if (within([5241, 5244], [5401, 5401], [5871, 5881])) return "Other services"
  return "Surgery and procedures"
}

let apcOptions: Promise<ApcOption[]> | null = null
function getApcOptions() {
  apcOptions ??= getOppsApcs().then((apcs) => {
    const withGroups = apcs.map((a) => ({ ...a, group: apcGroup(a.code) }))
    const terms = codeTerms(withGroups, "apc")
    return withGroups.map((a) => ({ code: a.code, title: a.title, si: a.si, rate: a.rate, group: a.group, ...terms(a.code) }))
  })
  apcOptions.catch(() => (apcOptions = null))
  return apcOptions
}

async function loadOutpatient(facilityId: string | null): Promise<OutpatientData> {
  const [manifest, apcs, services, facilities, wageIndex, wageManifest] = await Promise.all([
    getOppsManifest(),
    getApcOptions(),
    getOutpatientServices(),
    getFacilities(),
    hospitalWageIndex(facilityId, "opps"),
    getWageIndexManifest(),
  ])
  const year = manifest.services.year
  const facility = facilityId ? facilities.find((f) => f.id === facilityId) : undefined
  let baseline: OutpatientData["baseline"] = null
  let peers: OutpatientData["peers"] = null
  if (facility) {
    const shared = manifest.services.sharedReporting[facility.id]
    const own = services[shared?.reportedWith ?? facility.id]?.[year]
    if (own) baseline = { year, services: own, sourcePage: manifest.services.sourcePage, reportedWithName: shared?.reportedWithName ?? null }
    const group = resolvePeerGroup(facility, facilities, DEFAULT_FILTERS)
    const peerServices = group.peers.map((p) => services[p.id]?.[year]).filter((c): c is Record<string, number> => !!c)
    if (peerServices.length) {
      const byApc: NonNullable<OutpatientData["peers"]> = { description: group.description, count: peerServices.length, services: {} }
      for (const code of new Set(peerServices.flatMap((c) => Object.keys(c)))) {
        const values = peerServices.map((c) => c[code]).filter((n): n is number => n != null)
        byApc.services[code] = { reporting: values.length, median: median(values) }
      }
      peers = byApc
    }
  }
  return {
    calendarYear: manifest.calendarYear,
    quarter: manifest.quarter,
    sourcePage: manifest.sourcePage,
    conversionFactor: manifest.conversionFactor,
    laborShare: wageManifest.opps.laborShare,
    wageIndex: wageManifest.opps.calendarYear === manifest.calendarYear ? wageIndex : null,
    apcs,
    baselineApcs: manifest.services.apcs,
    baseline,
    peers,
  }
}

// -- Advanced mode: the hospital's payer mix (HCAI, by gross charges) --------------------------------------------------

export type PayerMixData = { year: number; shares: { medicare: number; medical: number; commercial: number; other: number } } | null

async function loadPayerMix(facilityId: string | null): Promise<PayerMixData> {
  if (!facilityId) return null
  const metrics = await getMetrics("hafd-selected")
  const years = Object.entries(metrics[facilityId] ?? {})
    .filter(([, m]) => (m as unknown as { payerMixRevenue?: unknown }).payerMixRevenue)
    .sort(([a], [b]) => Number(b) - Number(a))
  if (!years.length) return null
  const [year, m] = years[0]
  const mix = (m as unknown as { payerMixRevenue: Record<string, number> }).payerMixRevenue
  const pct = (v: number | undefined) => Math.round((v ?? 0) * 1000) / 10
  return {
    year: Number(year),
    // HCAI's "indigent" (county programs and charity) goes with other and self-pay.
    shares: { medicare: pct(mix.medicare), medical: pct(mix.medical), commercial: pct(mix.commercial), other: pct((mix.indigent ?? 0) + (mix.other ?? 0)) },
  }
}
