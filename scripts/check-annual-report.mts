// Checks the annual report's own measures (src/lib/annual-report/calcs.ts) against every hospital-year, in the manner
// of check-components.mts. Two checks per measure:
//   1. Reproduction: an independent working of the formula, written here straight from the HCAI field codes, must give
//      the same value (or the same "not reported") for every hospital-year. A mismatch fails the check.
//   2. Reconciliation: where HCAI publishes a figure the measure must agree with, it's compared. The two per-adjusted-
//      day measures must reproduce Compare's published per-adjusted-discharge measures exactly (to the ETL's whole-
//      dollar rounding), and fail the check otherwise. The rest are accounting identities in HCAI's own filings (net
//      income, the payer columns, the balance sheet), which say how far the filings themselves agree: reported, not
//      failed on, since a hospital's filing can be out of balance without Padua being wrong.
// Run: npm run check:annual-report
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { CALCS, type YearContext } from "../src/lib/annual-report/calcs.ts"

type Fields = {
  fields: string[]
  meta: Record<string, Record<string, { days: number; reports: number; annualized: boolean }>>
  values: Record<string, Record<string, (number | null)[]>>
}
const root = join(import.meta.dirname, "..", "data", "processed")
const load = <T,>(dataset: string, file: string) => JSON.parse(readFileSync(join(root, dataset, file), "utf8")) as T

const PAYER: Record<string, string[]> = {
  medicare: ["MCAR_TR", "MCAR_MC"],
  medical: ["MCAL_TR", "MCAL_MC"],
  commercial: ["THRD_TR", "THRD_MC"],
  indigent: ["CNTY", "OTH_IND"],
  other: ["OTH"],
}

// -- the independent working ------------------------------------------------------------------------------------------

type F = (c: string) => number
function independent(id: string, v: F, has: (c: string) => boolean, ctx: YearContext): unknown {
  const leap = ctx.year % 4 === 0 && (ctx.year % 100 !== 0 || ctx.year % 400 === 0)
  const days = ctx.annualized ? (leap ? 366 : 365) : ctx.days
  const adjDays = v("DAY_TOT") > 0 && v("GR_PT_REV") > 0 && v("GR_IP_TOT") > 0 ? (v("DAY_TOT") * v("GR_PT_REV")) / v("GR_IP_TOT") : null
  const fte = ctx.reports === 1 && v("HOSP_FTE") > 0 ? v("HOSP_FTE") : null
  const sal = v("EXP_SAL") + v("EXP_BEN")
  switch (id) {
    case "totalMargin": {
      const rev = v("NET_PT_REV") + v("OTH_OP_REV") + v("NONOP_REV")
      return rev > 0 && has("NET_INCOME") ? v("NET_INCOME") / rev : null
    }
    case "collectionRate": {
      const out: Record<string, number | null> = {}
      for (const [p, s] of Object.entries(PAYER)) {
        const charges = s.reduce((t, x) => t + v(`GR_IP_${x}`) + v(`GR_OP_${x}`), 0)
        const anyNet = s.some((x) => has(`NETRV_${x}`))
        out[p] = charges > 0 && anyNet ? s.reduce((t, x) => t + v(`NETRV_${x}`), 0) / charges : null
      }
      return Object.values(out).some((x) => x != null) ? out : null
    }
    case "payerMixNetRevenue": {
      const parts = Object.fromEntries(
        Object.entries(PAYER).map(([p, s]) => [
          p,
          Math.max(
            0,
            s.reduce((t, x) => t + v(`NETRV_${x}`), 0)
          ),
        ])
      )
      const total = Object.values(parts).reduce((a, b) => a + b, 0)
      return total > 0 ? Object.fromEntries(Object.entries(parts).map(([p, x]) => [p, x / total])) : null
    }
    case "laborShare":
      return sal > 0 && v("TOT_OP_EXP") > 0 ? sal / v("TOT_OP_EXP") : null
    case "laborCostPerFte":
      return sal > 0 && fte ? sal / fte : null
    case "ftesPerAdjOccupiedBed":
      return fte && adjDays ? fte / (adjDays / days) : null
    case "contractHoursShare": {
      const c = v("CNT_HR_RN") + v("CNT_HR_OTH")
      const all = v("PROD_HRS") + c
      return all > 0 && (has("CNT_HR_RN") || has("CNT_HR_OTH")) ? c / all : null
    }
    case "debtToEquity":
      return v("TOT_ASST") > 0 && v("EQUITY") > 0 && has("TOT_LTDEBT") ? v("TOT_LTDEBT") / v("EQUITY") : null
    case "currentRatio":
      return v("CUR_ASST") > 0 && v("CUR_LIAB") > 0 ? v("CUR_ASST") / v("CUR_LIAB") : null
    case "cSectionShare":
      return v("NAT_BIRTHS") + v("C_SECTIONS") > 0 && has("C_SECTIONS") ? v("C_SECTIONS") / (v("NAT_BIRTHS") + v("C_SECTIONS")) : null
    case "expensePerAdjDay":
      return v("TOT_OP_EXP") > 0 && adjDays ? v("TOT_OP_EXP") / adjDays : null
    case "revenuePerAdjDay": {
      const rev = v("NET_PT_REV") + v("OTH_OP_REV")
      return rev > 0 && adjDays ? rev / adjDays : null
    }
  }
  throw new Error(`No independent working for ${id}`)
}

const same = (a: unknown, b: unknown): boolean => {
  if (a == null || b == null) return a == null && b == null
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a))
  if (typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    return [...keys].every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  }
  return false
}

// -- run ----------------------------------------------------------------------------------------------------------------

const problems: string[] = []
const data = {
  "hafd-selected": {
    fields: load<Fields>("hafd-selected", "fields.json"),
    metrics: load<Record<string, Record<string, Record<string, unknown>>>>("hafd-selected", "metrics.json"),
  },
  hau: {
    fields: load<Fields>("hau", "fields.json"),
    metrics: load<Record<string, Record<string, Record<string, unknown>>>>("hau", "metrics.json"),
  },
}

type Row = {
  facility: string
  year: string
  ctx: YearContext
  get: (c: string) => number | null
}
function* rows(dataset: "hafd-selected" | "hau"): Generator<Row> {
  const { fields } = data[dataset]
  const index = new Map(fields.fields.map((c, i) => [c, i]))
  for (const [facility, years] of Object.entries(fields.values)) {
    for (const [year, values] of Object.entries(years)) {
      const m = fields.meta[facility]?.[year]
      const ctx: YearContext = {
        days: m?.days ?? 365,
        reports: m?.reports ?? 1,
        annualized: !!m?.annualized,
        year: Number(year),
      }
      const get = (c: string) => {
        const x = values[index.get(c) ?? -1]
        return typeof x === "number" && Number.isFinite(x) ? x : null
      }
      yield { facility, year, ctx, get }
    }
  }
}

console.log("Reproduction (independent working, every hospital-year):")
for (const calc of CALCS) {
  let checked = 0
  let withValue = 0
  let off = 0
  for (const r of rows(calc.dataset)) {
    checked++
    const mine = calc.value(r.get, r.ctx)
    const theirs = independent(
      calc.id,
      (c) => r.get(c) ?? 0,
      (c) => r.get(c) != null,
      r.ctx
    )
    if (mine != null) withValue++
    if (!same(mine, theirs)) {
      off++
      if (off <= 3) problems.push(`${calc.id} ${r.facility} ${r.year}: calcs.ts gives ${JSON.stringify(mine)}, independent working ${JSON.stringify(theirs)}`)
    }
  }
  console.log(`  ${calc.id.padEnd(24)} ${checked} hospital-years, ${withValue} with a value, ${checked - off} match`)
}

console.log("\nReconciliation with published figures (fails on a mismatch):")
for (const [id, published] of [
  ["expensePerAdjDay", "expensePerAdjDischarge"],
  ["revenuePerAdjDay", "revenuePerAdjDischarge"],
] as const) {
  const calc = CALCS.find((c) => c.id === id)!
  let checked = 0
  let off = 0
  for (const r of rows("hafd-selected")) {
    const stored = data["hafd-selected"].metrics[r.facility]?.[r.year]?.[published]
    const perDay = calc.value(r.get, r.ctx) as number | null
    if (typeof stored !== "number" || perDay == null) continue
    checked++
    // Per adjusted day × days per discharge = per adjusted discharge; the ETL rounds that to whole dollars.
    const back = (perDay * r.get("DAY_TOT")!) / r.get("DIS_TOT")!
    if (Math.abs(back - stored) > 0.5 + 1e-6) {
      off++
      if (off <= 3) problems.push(`${id} ${r.facility} ${r.year}: gives ${back.toFixed(2)} per adjusted discharge, published ${stored}`)
    }
  }
  console.log(`  ${id.padEnd(24)} ${checked} hospital-years against ${published}, ${checked - off} match`)
}

console.log("\nHCAI's own identities (reported, not failed on; within $1,000 or 0.5 points):")
function identity(label: string, dataset: "hafd-selected" | "hau", test: (r: Row) => boolean | null) {
  let checked = 0
  let ok = 0
  for (const r of rows(dataset)) {
    const t = test(r)
    if (t == null) continue
    checked++
    if (t) ok++
  }
  console.log(`  ${label.padEnd(64)} ${ok} of ${checked} (${checked ? ((100 * ok) / checked).toFixed(1) : "—"}%)`)
}
const z = (r: Row, c: string) => r.get(c) ?? 0
identity("Net income = operating income + non-operating − taxes − extraordinary", "hafd-selected", (r) =>
  r.get("NET_INCOME") == null
    ? null
    : Math.abs(z(r, "NET_FRM_OP") + z(r, "NONOP_REV") - z(r, "NONOP_EXP") - z(r, "INC_TAX") - z(r, "EXT_ITEM") - z(r, "NET_INCOME")) <= 1000
)
identity("Net patient revenue = Σ payer net revenue", "hafd-selected", (r) => {
  const payers = Object.values(PAYER)
    .flat()
    .reduce((t, x) => t + z(r, `NETRV_${x}`), 0)
  return !(z(r, "NET_PT_REV") > 0) ? null : Math.abs(payers - z(r, "NET_PT_REV")) <= 1000
})
identity("Charges = Σ payer inpatient + outpatient charges", "hafd-selected", (r) => {
  const payers = Object.values(PAYER)
    .flat()
    .reduce((t, x) => t + z(r, `GR_IP_${x}`) + z(r, `GR_OP_${x}`), 0)
  return !(z(r, "GR_PT_REV") > 0) ? null : Math.abs(payers - z(r, "GR_PT_REV")) <= 1000
})
identity("Total assets = total liabilities and equity", "hafd-selected", (r) =>
  !(z(r, "TOT_ASST") > 0) ? null : Math.abs(z(r, "TOT_ASST") - z(r, "LIAB_EQ")) <= 1000
)
identity("Operating expense = Σ expense by type", "hafd-selected", (r) => {
  const types = ["EXP_SAL", "EXP_BEN", "EXP_PHYS", "EXP_OTHPRO", "EXP_SUPP", "EXP_PURCH", "EXP_DEPRE", "EXP_LEASES", "EXP_INSUR", "EXP_INTRST", "EXP_OTH"]
  return !(z(r, "TOT_OP_EXP") > 0) ? null : Math.abs(types.reduce((t, c) => t + z(r, c), 0) - z(r, "TOT_OP_EXP")) <= 1000
})
identity("C-section share within 5 points of the utilization report's (2019–2021)", "hafd-selected", (r) => {
  const util = data.hau.fields
  const i = new Map(util.fields.map((c, k) => [c, k]))
  const row = util.values[r.facility]?.[r.year]
  const cs = row?.[i.get("LIVE_BIRTHS_C_SECTION")!] ?? null
  const all = row?.[i.get("LIVE_BIRTHS_TOT")!] ?? null
  const fin = CALCS.find((c) => c.id === "cSectionShare")!.value(r.get, r.ctx) as number | null
  if (fin == null || cs == null || all == null || all <= 0) return null
  return Math.abs(cs / all - fin) <= 0.05
})

if (problems.length) {
  console.error(`\n${problems.join("\n")}`)
  process.exit(1)
}
