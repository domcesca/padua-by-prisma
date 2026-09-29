// The formulas behind Compare's ratio metrics, as numerator and denominator (V7.4.5): each part worked out from a
// hospital-year's raw HCAI fields exactly as the ETL computes the ratio (etl/hcai_etl/datasets/hafd_selected.py,
// hau.py). No imports but types, so scripts/check-components.mts can run it against every hospital-year.

import type { HcaiDatasetId } from "../data/types.ts"

export type ComponentUnit = "usd" | "count" | "days"
export type ComponentPart = { label: string; unit: ComponentUnit }
export type ComponentPoint = {
  year: number
  hospital: { numerator: number; denominator: number } | null
  /** Median numerator and median denominator across the peers with a value for the ratio that year. */
  peers: { numerator: number; denominator: number; n: number } | null
}
export type MetricComponents = { numerator: ComponentPart; denominator: ComponentPart; points: ComponentPoint[] }

export type Get = (code: string) => number | null
export type Parts = { numerator: number; denominator: number } | null

const sum = (get: Get, codes: string[]) => {
  const vals = codes.map(get)
  return vals.every((v) => v == null) ? null : vals.reduce<number>((s, v) => s + (v ?? 0), 0)
}

const MEDICARE = ["MCAR_TR", "MCAR_MC"]

export const DEFS: Record<string, { dataset: HcaiDatasetId; numerator: ComponentPart; denominator: ComponentPart; parts: (get: Get) => Parts }> = {
  // NET_FRM_OP ÷ (NET_PT_REV + OTH_OP_REV)
  operatingMargin: {
    dataset: "hafd-selected",
    numerator: { label: "Net income from operations", unit: "usd" },
    denominator: { label: "Operating revenue", unit: "usd" },
    parts: (get) => {
      const net = get("NET_FRM_OP")
      const rev = (get("NET_PT_REV") ?? 0) + (get("OTH_OP_REV") ?? 0)
      return net != null && rev > 0 ? { numerator: net, denominator: rev } : null
    },
  },
  // (Medicare net revenue − estimated Medicare cost) ÷ Medicare net revenue, cost by the payment-to-cost method.
  medicareMargin: {
    dataset: "hafd-selected",
    numerator: { label: "Medicare revenue less estimated cost", unit: "usd" },
    denominator: { label: "Medicare net revenue", unit: "usd" },
    parts: (get) => {
      const netRev = sum(get, MEDICARE.map((s) => `NETRV_${s}`))
      const gross = (sum(get, MEDICARE.map((s) => `GR_IP_${s}`)) ?? 0) + (sum(get, MEDICARE.map((s) => `GR_OP_${s}`)) ?? 0)
      const opex = get("TOT_OP_EXP")
      const chargesAll = (get("GR_PT_REV") ?? 0) + (get("OTH_OP_REV") ?? 0)
      const cost = opex && opex > 0 && gross > 0 && chargesAll > 0 ? (opex * gross) / chargesAll : null
      return cost != null && netRev && netRev > 0 ? { numerator: netRev - cost, denominator: netRev } : null
    },
  },
  // DIS_MCAR_MC ÷ (DIS_MCAR_TR + DIS_MCAR_MC)
  medicareAdvantageShare: {
    dataset: "hafd-selected",
    numerator: { label: "Medicare Advantage discharges", unit: "count" },
    denominator: { label: "All Medicare discharges", unit: "count" },
    parts: (get) => {
      const all = sum(get, MEDICARE.map((s) => `DIS_${s}`))
      return all && all > 0 ? { numerator: get("DIS_MCAR_MC") ?? 0, denominator: all } : null
    },
  },
  // TOT_CEN_DAYS ÷ TOT_LIC_BED_DAYS (stored as a percent)
  occupancy: {
    dataset: "hau",
    numerator: { label: "Patient days", unit: "days" },
    denominator: { label: "Licensed bed-days", unit: "days" },
    parts: (get) => {
      const days = get("TOT_CEN_DAYS")
      const bedDays = get("TOT_LIC_BED_DAYS")
      return days != null && bedDays ? { numerator: days, denominator: bedDays } : null
    },
  },
  // ADMITTED_FROM_EMER_DEPT_TOT ÷ ER_TRAFFIC_TOT
  edAdmitRate: {
    dataset: "hau",
    numerator: { label: "ED visits admitted", unit: "count" },
    denominator: { label: "ED visits", unit: "count" },
    parts: (get) => {
      const admitted = get("ADMITTED_FROM_EMER_DEPT_TOT")
      const ed = get("ER_TRAFFIC_TOT")
      return admitted != null && ed ? { numerator: admitted, denominator: ed } : null
    },
  },
  // EMER_REGISTRATIONS_PATS_LEAVE_WO_BEING_SEEN ÷ ER_TRAFFIC_TOT
  edLwbsRate: {
    dataset: "hau",
    numerator: { label: "Left without being seen", unit: "count" },
    denominator: { label: "ED visits", unit: "count" },
    parts: (get) => {
      const left = get("EMER_REGISTRATIONS_PATS_LEAVE_WO_BEING_SEEN")
      const ed = get("ER_TRAFFIC_TOT")
      return left != null && ed ? { numerator: left, denominator: ed } : null
    },
  },
  // (EMS_VISITS_SEVERE_TOT + EMS_VISITS_CRITICAL_TOT) ÷ EMER_DEPT_VISITS_NOT_RESULT_ADMISSIONS_TOT
  edHighAcuityShare: {
    dataset: "hau",
    numerator: { label: "Severe or critical visits", unit: "count" },
    denominator: { label: "ED visits not admitted", unit: "count" },
    parts: (get) => {
      const released = get("EMER_DEPT_VISITS_NOT_RESULT_ADMISSIONS_TOT")
      const high = (get("EMS_VISITS_SEVERE_TOT") ?? 0) + (get("EMS_VISITS_CRITICAL_TOT") ?? 0)
      return released ? { numerator: high, denominator: released } : null
    },
  },
}

/** Ratio metrics with an Actual view. Per-case and per-day metrics, counts and dollars are already actual values. */
export const COMPONENT_METRICS = Object.keys(DEFS)

