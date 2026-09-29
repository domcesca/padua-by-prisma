import "server-only"

import type { MetricDef } from "@/lib/data/datasets"
import { getFields, getManifest, getMetrics } from "@/lib/data/store"
import type { FieldsFile, PayerGroup, PayerMix } from "@/lib/data/types"
import { DEFS, type Get, type MetricComponents, type Parts } from "./component-defs"
import { metricValue, quantile } from "./compute"

// The two numbers behind a ratio metric (V7.4.5), for Compare's "Actual" view: operating margin is net income from
// operations ÷ operating revenue, occupancy is patient days ÷ licensed bed-days, and so on. Each part is worked out
// from the hospital's raw HCAI fields (data/processed/<dataset>/fields.json) exactly as the ETL computes the ratio
// (etl/hcai_etl/datasets/hafd_selected.py, hau.py), so numerator ÷ denominator gives back the published ratio
// (npm run check:components checks every hospital-year).
//
// The peer side is a median of each part on its own, over the same peers the ratio's median uses that year (those
// with a value for the ratio): the median numerator and the median denominator. They needn't divide to the peer
// median ratio, and the card says so. Nothing is back-solved from a ratio.

export { COMPONENT_METRICS, type ComponentPoint, type MetricComponents } from "./component-defs"

const indexCache = new WeakMap<FieldsFile, Map<string, number>>()
function getterFor(file: FieldsFile, facilityId: string, year: number): Get | null {
  const row = file.values[facilityId]?.[year]
  if (!row) return null
  let index = indexCache.get(file)
  if (!index) {
    index = new Map(file.fields.map((code, i) => [code, i]))
    indexCache.set(file, index)
  }
  return (code) => {
    const i = index!.get(code)
    const v = i == null ? null : row[i]
    return typeof v === "number" && Number.isFinite(v) ? v : null
  }
}

/** A ratio metric's parts for one hospital-year, or null (also used by the consistency check). */
export async function metricParts(metricId: string, facilityId: string, year: number): Promise<Parts> {
  const def = DEFS[metricId]
  if (!def) return null
  const get = getterFor(await getFields(def.dataset), facilityId, year)
  return get ? def.parts(get) : null
}

/** The hospital's parts and the peers' median parts, year by year, for a ratio metric; null for any other metric. */
export async function componentSeries(metric: MetricDef, facilityId: string, peerIds: string[], since: number | null): Promise<MetricComponents | null> {
  const def = DEFS[metric.id]
  if (!def || def.dataset !== metric.dataset) return null
  const [fields, metrics, manifest] = await Promise.all([getFields(def.dataset), getMetrics(def.dataset), getManifest(def.dataset)])
  const partsOf = (id: string, year: number) => {
    const get = getterFor(fields, id, year)
    return get ? def.parts(get) : null
  }
  const points = manifest.years
    .filter((y) => since == null || y >= since)
    .map((year) => {
      // The ratio's own peer set: peers with a value for it this year.
      const peerParts = peerIds
        .filter((id) => metricValue(metrics, id, year, metric.id) != null)
        .map((id) => partsOf(id, year))
        .filter((p): p is NonNullable<Parts> => p != null)
      const nums = peerParts.map((p) => p.numerator).sort((a, b) => a - b)
      const dens = peerParts.map((p) => p.denominator).sort((a, b) => a - b)
      const hospital = metricValue(metrics, facilityId, year, metric.id) != null ? partsOf(facilityId, year) : null
      return {
        year,
        hospital,
        peers: peerParts.length ? { numerator: quantile(nums, 0.5)!, denominator: quantile(dens, 0.5)!, n: peerParts.length } : null,
      }
    })
  return { numerator: def.numerator, denominator: def.denominator, points }
}

// -- payer mix: each payer group's amount, not just its share --------------------------------------------------------

const PAYER_SUFFIXES: Record<PayerGroup, string[]> = {
  medicare: ["MCAR_TR", "MCAR_MC"],
  medical: ["MCAL_TR", "MCAL_MC"],
  commercial: ["THRD_TR", "THRD_MC"],
  indigent: ["CNTY", "OTH_IND"],
  other: ["OTH"],
}
const PAYER_GROUPS = Object.keys(PAYER_SUFFIXES) as PayerGroup[]

export type PayerAmounts = {
  /** This hospital's gross charges (or days) by payer group, and in all. */
  facility: (PayerMix & { total: number }) | null
  /** Median of each group's amount (and of the total) across the peers the share comparison uses. */
  peers: (PayerMix & { total: number }) | null
  n: number
}

/** Payer mix as amounts (gross charges, inpatient days) for the year the payer-mix card shows. */
export async function payerAmounts(facilityId: string, peerIds: string[], year: number): Promise<{ revenue: PayerAmounts; days: PayerAmounts }> {
  const [fields, metrics] = await Promise.all([getFields("hafd-selected"), getMetrics("hafd-selected")])
  const amounts = (id: string, prefixes: string[]) => {
    const get = getterFor(fields, id, year)
    if (!get) return null
    // As the ETL's share: negative amounts count as zero, and the total is the sum of positive ones.
    const out = {} as PayerMix & { total: number }
    for (const g of PAYER_GROUPS) out[g] = Math.max(PAYER_SUFFIXES[g].flatMap((s) => prefixes.map((p) => get(`${p}${s}`) ?? 0)).reduce((a, b) => a + b, 0), 0)
    out.total = PAYER_GROUPS.reduce((s, g) => s + out[g]!, 0)
    return out.total > 0 ? out : null
  }
  const pick = (key: "payerMixRevenue" | "payerMixDays", prefixes: string[]): PayerAmounts => {
    const peerIdsWithMix = peerIds.filter((id) => metrics[id]?.[year]?.[key])
    const peerAmounts = peerIdsWithMix.map((id) => amounts(id, prefixes)).filter((a): a is NonNullable<typeof a> => !!a)
    const median = (k: PayerGroup | "total") => quantile(peerAmounts.map((a) => a[k]!).sort((x, y) => x - y), 0.5)!
    return {
      facility: metrics[facilityId]?.[year]?.[key] ? amounts(facilityId, prefixes) : null,
      peers: peerAmounts.length ? (Object.fromEntries([...PAYER_GROUPS, "total"].map((k) => [k, median(k as PayerGroup | "total")])) as PayerMix & { total: number }) : null,
      n: peerAmounts.length,
    }
  }
  return { revenue: pick("payerMixRevenue", ["GR_IP_", "GR_OP_"]), days: pick("payerMixDays", ["DAY_"]) }
}
