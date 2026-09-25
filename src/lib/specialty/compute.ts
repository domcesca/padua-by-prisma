import "server-only"

import type { PeerFilters } from "@/lib/benchmark/filters"
import { resolvePeerGroup } from "@/lib/benchmark/peers"
import { getFacilities, getInpatientCases, getInpatientCasesManifest, getInpatientDrgs, getIppsDrgs, getIppsManifest } from "@/lib/data/store"
import type { Facility } from "@/lib/data/types"
import { quantile } from "@/lib/benchmark/compute"
import { MAX_COMPARE, MDCS, mdcKey } from "./mdc"

// Benchmark's specialty view: CMS's Medicare fee-for-service cases per hospital and MS-DRG (the Inpatient
// Reimbursement module's baseline) rolled up to MDC. No new data: each DRG's MDC is CMS's (Table 5), and the payment
// estimate is the module's (relative weight × national operating standardized amount).
//
// CMS leaves out every hospital-DRG row with fewer than 11 cases, so an MDC's count is the sum of its DRGs with 11 or
// more: a floor, not the full count. An MDC with none of those is "fewer than 11 in each DRG", not zero.

export type SpecialtyCell = {
  /** Cases in the MDC's DRGs with 11+ cases. */
  cases: number
  /** Those DRGs' cases × weight × national standardized amount. */
  payment: number
  /** Share of the hospital's counted Medicare cases. */
  share: number
  /** DRGs with 11+ cases. */
  drgs: number
}

export type SpecialtyHospital = {
  id: string
  name: string
  county: string | null
  beds: number | null
  /** Counted cases and estimated payment across every MDC. */
  total: { cases: number; payment: number }
  /** MDC key -> cell; an MDC missing here had no DRG with 11+ cases. */
  cells: Record<string, SpecialtyCell>
  /** CMS reports this hospital under another hospital's Medicare number (combined). */
  reportedWithName: string | null
}

export type PeerStats = {
  /** Peers with 11+ cases in any DRG of the MDC. */
  reporting: number
  median: number | null
  p25: number | null
  p75: number | null
  medianShare: number | null
  medianPayment: number | null
  /** Share (0–1) of reporting peers the hospital is above, by cases. */
  percentile: number | null
}

export type TopDrg = { code: string; title: string; mdc: string; cases: number; payment: number; retired: boolean }

export type SpecialtyResult = {
  year: number
  fiscalYear: number
  /** National operating standardized amount the estimate uses. */
  rate: number
  sourcePage: string
  ippsSourcePage: string
  facility: { id: string; name: string }
  /** The MDC asked for (drill-down), or null for all. */
  mdc: string | null
  /** Null when CMS has no Medicare inpatient claims for the hospital (not paid under IPPS, or no match). */
  hospital: SpecialtyHospital | null
  /** Every MDC key with cases at the hospital, a peer, or a compared hospital; the hospital's largest first. */
  mdcs: string[]
  peerGroup: { description: string; count: number; withData: number }
  peerStats: Record<string, PeerStats>
  /** Peers with data, for one MDC's comparison. */
  peers: SpecialtyHospital[]
  compare: SpecialtyHospital[]
  /** With one MDC chosen: the hospital's DRGs in it with 11+ cases, largest first. */
  topDrgs: TopDrg[]
  /** The hospital's cases in DRGs CMS has retired since, priced at their last published weight. */
  retired: { cases: number; payment: number; lastFiscalYear: number } | null
}

type Pricing = Map<string, { mdc: string; weight: number; title: string; retired: boolean }>

let pricing: Promise<{ drgs: Pricing; rate: number; fiscalYear: number; sourcePage: string }> | null = null
function getPricing() {
  pricing ??= Promise.all([getInpatientDrgs(), getIppsDrgs(), getIppsManifest()]).then(([history, current, manifest]) => {
    const now = new Map(current.map((d) => [d.code, d]))
    const drgs: Pricing = new Map()
    for (const [code, h] of Object.entries(history)) {
      const c = now.get(code)
      // Current codes price at the current weight; retired codes at the weight in the last Table 5 that listed them.
      const weight = c?.weight ?? h.lastWeight
      if (weight == null) continue
      drgs.set(code, { mdc: mdcKey(h.mdc), weight, title: h.title, retired: !c })
    }
    return { drgs, rate: manifest.standardizedAmount.total, fiscalYear: manifest.fiscalYear, sourcePage: manifest.sourcePage }
  })
  pricing.catch(() => (pricing = null))
  return pricing
}

function rollUp(f: Facility, counts: Record<string, number>, drgs: Pricing, rate: number, reportedWithName: string | null): SpecialtyHospital {
  const cells: Record<string, SpecialtyCell> = {}
  let cases = 0
  let payment = 0
  for (const [code, n] of Object.entries(counts)) {
    const d = drgs.get(code)
    if (!d) continue
    const cell = (cells[d.mdc] ??= { cases: 0, payment: 0, share: 0, drgs: 0 })
    cell.cases += n
    cell.payment += n * d.weight * rate
    cell.drgs++
    cases += n
    payment += n * d.weight * rate
  }
  for (const cell of Object.values(cells)) {
    cell.share = cases ? cell.cases / cases : 0
    cell.payment = Math.round(cell.payment)
  }
  return { id: f.id, name: f.name, county: f.county, beds: f.licensedBeds, total: { cases, payment: Math.round(payment) }, cells, reportedWithName }
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

export async function computeSpecialties({
  facilityId,
  filters,
  compareIds,
  mdc,
}: {
  facilityId: string
  filters: PeerFilters
  compareIds: string[]
  /** An MDC key to list the hospital's DRGs for. */
  mdc: string | null
}): Promise<SpecialtyResult | null> {
  const [facilities, cases, manifest, { drgs, rate, fiscalYear, sourcePage }] = await Promise.all([
    getFacilities(),
    getInpatientCases(),
    getInpatientCasesManifest(),
    getPricing(),
  ])
  const facility = facilities.find((f) => f.id === facilityId)
  if (!facility) return null
  const year = manifest.years.at(-1)!
  const byId = new Map(facilities.map((f) => [f.id, f]))

  /** A hospital's own counts; one CMS reports under another hospital's number gets that hospital's (combined). */
  const hospitalFor = (f: Facility, allowShared: boolean) => {
    const shared = manifest.sharedReporting[f.id]
    if (shared && !allowShared) return null
    const own = cases[shared?.reportedWith ?? f.id]?.[year]
    return own ? rollUp(f, own, drgs, rate, shared?.reportedWithName ?? null) : null
  }

  const hospital = hospitalFor(facility, true)
  const group = resolvePeerGroup(facility, facilities, filters)
  // Peers reported under another hospital's number would repeat that hospital's cases; they're left out, as in Propose.
  const peers = group.peers.map((p) => hospitalFor(p, false)).filter((p): p is SpecialtyHospital => !!p)
  const compare = [...new Set(compareIds)]
    .filter((id) => id !== facility.id)
    .slice(0, MAX_COMPARE)
    .map((id) => byId.get(id))
    .filter((f): f is Facility => !!f)
    .map((f) => hospitalFor(f, true) ?? { id: f.id, name: f.name, county: f.county, beds: f.licensedBeds, total: { cases: 0, payment: 0 }, cells: {}, reportedWithName: null })

  const keys = new Set<string>()
  for (const h of [hospital, ...peers, ...compare]) for (const k of Object.keys(h?.cells ?? {})) keys.add(k)
  const order = MDCS.map((m) => m.code)
  const mdcs = [...keys].sort(
    (a, b) => (hospital?.cells[b]?.cases ?? -1) - (hospital?.cells[a]?.cases ?? -1) || order.indexOf(a) - order.indexOf(b)
  )

  const peerStats: Record<string, PeerStats> = {}
  for (const key of mdcs) {
    const reporting = peers.map((p) => p.cells[key]).filter((c): c is SpecialtyCell => !!c)
    const counts = reporting.map((c) => c.cases).sort((a, b) => a - b)
    const own = hospital?.cells[key]
    peerStats[key] = {
      reporting: reporting.length,
      median: quantile(counts, 0.5),
      p25: quantile(counts, 0.25),
      p75: quantile(counts, 0.75),
      medianShare: quantile(reporting.map((c) => c.share).sort((a, b) => a - b), 0.5),
      medianPayment: quantile(reporting.map((c) => c.payment).sort((a, b) => a - b), 0.5),
      percentile: own && counts.length ? rank(counts, own.cases) : null,
    }
  }

  const ownCounts = cases[manifest.sharedReporting[facility.id]?.reportedWith ?? facility.id]?.[year] ?? {}
  const priced = Object.entries(ownCounts)
    .map(([code, n]) => ({ code, n, d: drgs.get(code) }))
    .filter((x): x is { code: string; n: number; d: NonNullable<ReturnType<Pricing["get"]>> } => !!x.d)
  const topDrgs: TopDrg[] = priced
    .filter((x) => mdc != null && x.d.mdc === mdc)
    .sort((a, b) => b.n - a.n)
    .map((x) => ({ code: x.code, title: x.d.title, mdc: x.d.mdc, cases: x.n, payment: Math.round(x.n * x.d.weight * rate), retired: x.d.retired }))
  const retiredDrgs = priced.filter((x) => x.d.retired)
  const history = await getInpatientDrgs()
  const retired = retiredDrgs.length
    ? {
        cases: retiredDrgs.reduce((s, x) => s + x.n, 0),
        payment: Math.round(retiredDrgs.reduce((s, x) => s + x.n * x.d.weight * rate, 0)),
        lastFiscalYear: Math.max(...retiredDrgs.map((x) => history[x.code].retiredAfter ?? 0)),
      }
    : null

  return {
    year,
    fiscalYear,
    rate,
    sourcePage: manifest.sourcePage,
    ippsSourcePage: sourcePage,
    facility: { id: facility.id, name: facility.name },
    mdc,
    hospital,
    mdcs,
    peerGroup: { description: group.description, count: group.peers.length, withData: peers.length },
    peerStats,
    peers: peers.sort((a, b) => a.name.localeCompare(b.name)),
    compare,
    topDrgs,
    retired,
  }
}
