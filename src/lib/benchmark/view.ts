import { CATEGORY_BY_ID, parseCategory } from "@/lib/data/datasets"
import type { MetricCategory } from "@/lib/data/types"

// Which metrics Benchmark shows, shared by the page, the API route, and the URL:
//   ?view=utilization&metrics=occupancy,edVisits&since=2021

export type BenchmarkViewState = {
  category: MetricCategory
  /** Metric ids to show; null = the category's defaults. */
  metrics: string[] | null
  /** First year to show; null = every year loaded. */
  since: number | null
}

type ParamSource = { get(name: string): string | null }

export function parseView(params: ParamSource): BenchmarkViewState {
  const metrics = (params.get("metrics") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const since = Number.parseInt(params.get("since") ?? "", 10)
  return {
    category: parseCategory(params.get("view")),
    metrics: metrics.length ? metrics : null,
    since: Number.isFinite(since) && since > 1990 ? since : null,
  }
}

export function viewToParams(view: BenchmarkViewState, params = new URLSearchParams()) {
  if (view.category !== "financial") params.set("view", view.category)
  else params.delete("view")
  const defaults = CATEGORY_BY_ID[view.category].defaultMetrics
  const custom = view.metrics && view.metrics.join(",") !== defaults.join(",")
  if (custom) params.set("metrics", view.metrics!.join(","))
  else params.delete("metrics")
  if (view.since != null) params.set("since", String(view.since))
  else params.delete("since")
  return params
}

export const metricsFor = (view: BenchmarkViewState) => view.metrics ?? CATEGORY_BY_ID[view.category].defaultMetrics
