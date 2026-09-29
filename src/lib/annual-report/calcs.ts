// The annual report's own measures (V7.5.5): twelve ratios of HCAI fields Padua already ingests, for Overview's
// annual report. Each is worked out from one hospital-year's raw fields (fields.json), the way the ETL works out
// Compare's measures, and nothing else reads them: Compare, Reports and the findings keep their own. No imports but
// types, so scripts/check-annual-report.mts can run every one against every hospital-year and reconcile it with the
// figures HCAI publishes.
//
// A value is null when its inputs aren't reported (zero or missing), never zero in their place: reduced filers
// (Kaiser, county psychiatric health facilities, state hospitals) report zeros for pages they don't file.

import type { HcaiDatasetId, MetricUnit, PayerGroup } from "../data/types.ts"

export type Get = (code: string) => number | null

/** A hospital-year's report period, from fields.json meta. */
export type YearContext = {
  /** Days the reports covered. */
  days: number
  /** Reports combined into the year (a fiscal-year change or change of ownership files more than one). */
  reports: number
  /** Flows were scaled to a full year because the reports didn't cover one (ETL: more than 3% off). */
  annualized: boolean
  /** The calendar year the report period ended in. */
  year: number
}

export type CalcDef = {
  id: string
  label: string
  unit: MetricUnit
  decimals?: number
  dataset: HcaiDatasetId
  /** The formula in HCAI field codes, as the Data definitions show one. */
  formula: string
  summary: string
  caution?: string
}

export type ScalarCalc = CalcDef & {
  kind: "scalar"
  value: (get: Get, ctx: YearContext) => number | null
}
export type PayerCalc = CalcDef & {
  kind: "payer"
  value: (get: Get, ctx: YearContext) => Record<PayerGroup, number | null> | null
}
export type Calc = ScalarCalc | PayerCalc

/** Payer groups as the ETL and Compare's payer mix group HCAI's nine payer columns. */
export const PAYER_GROUPS: Record<PayerGroup, string[]> = {
  medicare: ["MCAR_TR", "MCAR_MC"],
  medical: ["MCAL_TR", "MCAL_MC"],
  commercial: ["THRD_TR", "THRD_MC"],
  indigent: ["CNTY", "OTH_IND"],
  other: ["OTH"],
}
export const PAYERS = Object.keys(PAYER_GROUPS) as PayerGroup[]

/** A sum of fields; null when none of them is reported. */
export function sum(get: Get, codes: string[]) {
  const vals = codes.map(get)
  return vals.every((v) => v == null) ? null : vals.reduce<number>((s, v) => s + (v ?? 0), 0)
}

/** A ratio, null unless the denominator is positive and the numerator reported. */
const ratio = (n: number | null, d: number | null) => (n != null && d != null && d > 0 ? n / d : null)

/** Days the year's flows cover: a full year when the ETL annualized them, otherwise the report period. */
export const flowDays = (ctx: YearContext) => (ctx.annualized ? (new Date(Date.UTC(ctx.year, 1, 29)).getUTCMonth() === 1 ? 366 : 365) : ctx.days)

/** Inpatient days scaled up by the outpatient share of charges (HCAI's adjusted patient days). */
export function adjustedDays(get: Get) {
  const days = get("DAY_TOT")
  const gross = get("GR_PT_REV")
  const grossIp = get("GR_IP_TOT")
  return days && days > 0 && gross && gross > 0 && grossIp && grossIp > 0 ? (days * gross) / grossIp : null
}

const positive = (v: number | null) => (v != null && v > 0 ? v : null)
const labor = (get: Get) => positive(sum(get, ["EXP_SAL", "EXP_BEN"]))
/** FTEs are summed across reports in a multi-report year (ETL), which overstates a headcount: left out there. */
const ftes = (get: Get, ctx: YearContext) => (ctx.reports > 1 ? null : positive(get("HOSP_FTE")))

export const CALCS: Calc[] = [
  {
    id: "totalMargin",
    kind: "scalar",
    label: "Total margin",
    unit: "ratio",
    dataset: "hafd-selected",
    formula: "NET_INCOME ÷ (NET_PT_REV + OTH_OP_REV + NONOP_REV)",
    summary: "The bottom line as a share of all revenue: operations plus donations, investment income, and tax and county funds.",
    value: (get) => ratio(get("NET_INCOME"), positive(sum(get, ["NET_PT_REV", "OTH_OP_REV", "NONOP_REV"]))),
  },
  {
    id: "collectionRate",
    kind: "payer",
    label: "Collection rate by payer",
    unit: "ratio",
    dataset: "hafd-selected",
    formula: "NETRV_<payer> ÷ (GR_IP_<payer> + GR_OP_<payer>)",
    summary: "What the hospital was paid for each payer's patients, as a share of what it charged them.",
    caution: "Managed-care net revenue includes capitation payments, which have no charges behind them, so a rate can pass 100%.",
    value: (get) => {
      const out = {} as Record<PayerGroup, number | null>
      for (const p of PAYERS) {
        const s = PAYER_GROUPS[p]
        out[p] = ratio(
          sum(
            get,
            s.map((x) => `NETRV_${x}`)
          ),
          positive(
            sum(
              get,
              s.flatMap((x) => [`GR_IP_${x}`, `GR_OP_${x}`])
            )
          )
        )
      }
      return PAYERS.some((p) => out[p] != null) ? out : null
    },
  },
  {
    id: "payerMixNetRevenue",
    kind: "payer",
    label: "Payer mix by net revenue",
    unit: "share",
    dataset: "hafd-selected",
    formula: "NETRV_<payer> ÷ Σ NETRV over all payers (a payer below zero counts as zero, as in Compare's payer mix)",
    summary: "Each payer's share of the money the hospital actually received for patient care.",
    value: (get) => {
      const parts = Object.fromEntries(
        PAYERS.map((p) => [
          p,
          sum(
            get,
            PAYER_GROUPS[p].map((x) => `NETRV_${x}`)
          ) ?? 0,
        ])
      ) as Record<PayerGroup, number>
      const total = PAYERS.reduce((s, p) => s + Math.max(parts[p], 0), 0)
      return total > 0 ? (Object.fromEntries(PAYERS.map((p) => [p, Math.max(parts[p], 0) / total])) as Record<PayerGroup, number>) : null
    },
  },
  {
    id: "laborShare",
    kind: "scalar",
    label: "Labor share of expenses",
    unit: "ratio",
    dataset: "hafd-selected",
    formula: "(EXP_SAL + EXP_BEN) ÷ TOT_OP_EXP",
    summary: "Employee salaries and benefits as a share of operating expenses.",
    caution: "Contract and registry staff are paid through purchased services, so a hospital that relies on them shows a lower labor share.",
    value: (get) => ratio(labor(get), positive(get("TOT_OP_EXP"))),
  },
  {
    id: "laborCostPerFte",
    kind: "scalar",
    label: "Labor cost per FTE",
    unit: "usd",
    dataset: "hafd-selected",
    formula: "(EXP_SAL + EXP_BEN) ÷ HOSP_FTE",
    summary: "Salaries and benefits per paid full-time-equivalent employee.",
    caution: "Not worked out for a year combining more than one report, where FTEs are added across reports.",
    value: (get, ctx) => ratio(labor(get), ftes(get, ctx)),
  },
  {
    id: "ftesPerAdjOccupiedBed",
    kind: "scalar",
    label: "FTEs per adjusted occupied bed",
    unit: "number",
    decimals: 2,
    dataset: "hafd-selected",
    formula: "HOSP_FTE ÷ (DAY_TOT × GR_PT_REV ÷ GR_IP_TOT ÷ days in period)",
    summary: "Paid staff for each bed filled on an average day, with outpatient work counted in as extra beds by its share of charges.",
    caution: "Not worked out for a year combining more than one report, where FTEs are added across reports.",
    value: (get, ctx) => {
      const adj = adjustedDays(get)
      return ratio(ftes(get, ctx), adj != null ? adj / flowDays(ctx) : null)
    },
  },
  {
    id: "contractHoursShare",
    kind: "scalar",
    label: "Contract labor share of hours",
    unit: "ratio",
    dataset: "hafd-selected",
    formula: "(CNT_HR_RN + CNT_HR_OTH) ÷ (PROD_HRS + CNT_HR_RN + CNT_HR_OTH)",
    summary: "Registry, travel and other contract hours as a share of all hours worked.",
    value: (get) => {
      const contract = sum(get, ["CNT_HR_RN", "CNT_HR_OTH"])
      return ratio(contract, positive(sum(get, ["PROD_HRS", "CNT_HR_RN", "CNT_HR_OTH"])))
    },
  },
  {
    id: "debtToEquity",
    kind: "scalar",
    label: "Debt to equity",
    unit: "number",
    decimals: 2,
    dataset: "hafd-selected",
    formula: "TOT_LTDEBT ÷ EQUITY (none when equity is zero or below)",
    summary: "Long-term debt for each dollar of net assets.",
    caution: "Not meaningful when equity is negative; the report says so instead.",
    value: (get) => (positive(get("TOT_ASST")) ? ratio(get("TOT_LTDEBT"), positive(get("EQUITY"))) : null),
  },
  {
    id: "currentRatio",
    kind: "scalar",
    label: "Current ratio",
    unit: "number",
    decimals: 2,
    dataset: "hafd-selected",
    formula: "CUR_ASST ÷ CUR_LIAB",
    summary: "Assets that turn to cash within a year for each dollar owed within a year.",
    value: (get) => ratio(positive(get("CUR_ASST")), positive(get("CUR_LIAB"))),
  },
  {
    id: "cSectionShare",
    kind: "scalar",
    label: "C-section share of births",
    unit: "ratio",
    dataset: "hafd-selected",
    formula: "C_SECTIONS ÷ (NAT_BIRTHS + C_SECTIONS)",
    summary: "Births delivered by cesarean section, as a share of all births.",
    caution: "From the financial report (fiscal year): HCAI has masked births on the utilization report since 2022.",
    value: (get) => ratio(get("C_SECTIONS"), positive(sum(get, ["NAT_BIRTHS", "C_SECTIONS"]))),
  },
  {
    id: "expensePerAdjDay",
    kind: "scalar",
    label: "Expense per adjusted patient day",
    unit: "usd",
    dataset: "hafd-selected",
    formula: "TOT_OP_EXP ÷ (DAY_TOT × GR_PT_REV ÷ GR_IP_TOT)",
    summary: "Operating expense per inpatient day, with outpatient work counted in by its share of charges: HCAI's own trend-chart basis.",
    value: (get) => ratio(positive(get("TOT_OP_EXP")), adjustedDays(get)),
  },
  {
    id: "revenuePerAdjDay",
    kind: "scalar",
    label: "Revenue per adjusted patient day",
    unit: "usd",
    dataset: "hafd-selected",
    formula: "(NET_PT_REV + OTH_OP_REV) ÷ (DAY_TOT × GR_PT_REV ÷ GR_IP_TOT)",
    summary: "Operating revenue per inpatient day, with outpatient work counted in by its share of charges.",
    value: (get) => ratio(positive(sum(get, ["NET_PT_REV", "OTH_OP_REV"])), adjustedDays(get)),
  },
]

export const CALC_BY_ID = Object.fromEntries(CALCS.map((c) => [c.id, c])) as Record<string, Calc>

export type CalcValues = Record<string, number | Record<PayerGroup, number | null> | null>

/** Every calc for one dataset's hospital-year. */
export function computeCalcs(dataset: HcaiDatasetId, get: Get, ctx: YearContext): CalcValues {
  return Object.fromEntries(CALCS.filter((c) => c.dataset === dataset).map((c) => [c.id, c.value(get, ctx)]))
}
