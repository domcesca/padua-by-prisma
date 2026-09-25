import {
  CATEGORY_BY_ID,
  parseCategory,
  parsePayerView,
  supportsUnits,
  UNIT_DEFAULT_METRICS,
  UNIT_METRICS,
  type PayerView,
} from "@/lib/data/datasets"
import type { MetricCategory } from "@/lib/data/types"
import { MAX_COMPARE } from "@/lib/specialty/mdc"

// Which metrics Benchmark shows, shared by the page, the API route, and the URL:
//   ?view=utilization&metrics=occupancy,edVisits&since=2021&payer=medicare
//   ?view=utilization&unit=icu        (one bed classification; utilization only)
//   ?view=utilization&specialty=all&with=106190555,106381154
//                                      (Medicare cases by MDC; specialty=05 for one MDC; utilization only)

export type BenchmarkViewState = {
  category: MetricCategory
  /** Metric ids to show; null = the category's defaults. */
  metrics: string[] | null
  /** First year to show; null = every year loaded. */
  since: number | null
  /** Payer lens; metrics with a payer-specific version switch to it. */
  payer: PayerView
  /** Bed classification (units.json id) to narrow utilization to; null = whole hospital. */
  unit: string | null
  /** Medicare specialty (MDC) view instead of HCAI utilization: "all" for every MDC, or one MDC key; null = off. */
  specialty: string | null
  /** Hospitals shown side by side in the specialty view. */
  compare: string[]
}

type ParamSource = { get(name: string): string | null }

export function parseView(params: ParamSource): BenchmarkViewState {
  const metrics = (params.get("metrics") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const since = Number.parseInt(params.get("since") ?? "", 10)
  const category = parseCategory(params.get("view"))
  const unit = params.get("unit")
  const specialtyParam = params.get("specialty")
  const specialty = supportsUnits(category) && specialtyParam && /^(all|none|PRE|\d{2})$/.test(specialtyParam) ? specialtyParam : null
  return {
    category,
    specialty,
    compare: specialty ? (params.get("with") ?? "").split(",").filter((id) => /^\d{9}$/.test(id)).slice(0, MAX_COMPARE) : [],
    unit: !specialty && supportsUnits(category) && unit && /^[a-zA-Z]+$/.test(unit) ? unit : null,
    metrics: metrics.length ? metrics : null,
    since: Number.isFinite(since) && since > 1990 ? since : null,
    // The unit view is all-payer: HCAI doesn't split bed classifications by payer.
    payer: (unit || specialty) && supportsUnits(category) ? "all" : parsePayerView(params.get("payer")),
  }
}

export function viewToParams(view: BenchmarkViewState, params = new URLSearchParams()) {
  if (view.category !== "financial") params.set("view", view.category)
  else params.delete("view")
  const defaults = view.unit ? UNIT_DEFAULT_METRICS : CATEGORY_BY_ID[view.category].defaultMetrics
  const custom = view.metrics && view.metrics.join(",") !== defaults.join(",")
  if (custom) params.set("metrics", view.metrics!.join(","))
  else params.delete("metrics")
  if (view.since != null) params.set("since", String(view.since))
  else params.delete("since")
  if (view.payer !== "all" && !view.unit && !view.specialty) params.set("payer", view.payer)
  else params.delete("payer")
  if (view.unit && supportsUnits(view.category)) params.set("unit", view.unit)
  else params.delete("unit")
  if (view.specialty && supportsUnits(view.category)) params.set("specialty", view.specialty)
  else params.delete("specialty")
  if (view.specialty && view.compare.length) params.set("with", view.compare.join(","))
  else params.delete("with")
  return params
}

/**
 * The chosen metric ids (all-payer ids, plus any lens-only extras); see applyPayerView for what's shown.
 * Under a unit, only the metrics HCAI reports by bed classification.
 */
export function metricsFor(view: BenchmarkViewState) {
  if (view.unit) {
    const chosen = view.metrics?.filter((id) => UNIT_METRICS.includes(id)) ?? []
    return chosen.length ? chosen : UNIT_DEFAULT_METRICS
  }
  return view.metrics ?? CATEGORY_BY_ID[view.category].defaultMetrics
}
