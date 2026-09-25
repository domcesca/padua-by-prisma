import "server-only"

import { DEFAULT_FILTERS } from "@/lib/benchmark/filters"
import { resolvePeerGroup } from "@/lib/benchmark/peers"
import {
  getFacilities,
  getInpatientCases,
  getInpatientCasesManifest,
  getIppsDrgs,
  getIppsManifest,
} from "@/lib/data/store"
import type { DrgOption, ReimbursementData } from "./reimbursement"

// Server data for Propose's modules, served by /api/propose/<module>. A module that needs data
// registers a loader here; one that doesn't (Custom) has nothing to add.

type Loader = (facilityId: string | null) => Promise<unknown>

export const MODULE_DATA: Record<string, Loader> = {
  reimbursement: loadReimbursement,
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

let drgOptions: Promise<DrgOption[]> | null = null
function getDrgOptions() {
  drgOptions ??= getIppsDrgs().then((drgs) =>
    drgs.map((d) => ({
      code: d.code,
      label: sentenceCase(d.title),
      weight: d.weight,
      type: d.type,
      mdc: d.mdc,
      mdcName: d.mdc ? (MDC_NAMES[d.mdc] ?? `MDC ${d.mdc}`) : NO_MDC,
      gmlos: d.gmlos,
    }))
  )
  drgOptions.catch(() => (drgOptions = null))
  return drgOptions
}

async function loadReimbursement(facilityId: string | null): Promise<ReimbursementData> {
  const [manifest, drgs, cases, casesManifest, facilities] = await Promise.all([
    getIppsManifest(),
    getDrgOptions(),
    getInpatientCases(),
    getInpatientCasesManifest(),
    getFacilities(),
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
    drgs,
    baseline,
    peers,
  }
}
