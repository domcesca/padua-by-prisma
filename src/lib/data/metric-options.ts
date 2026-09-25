import type { PickerOption } from "@/components/shell/grouped-picker"
import { CATEGORIES, CATEGORY_BY_ID, type MetricDef } from "./datasets"

/**
 * Metrics as picker options. Across categories (Build, Correlate) they're grouped by category,
 * its Medicare versions, and quality's sub-headings; within one category (Benchmark) by the
 * sub-heading alone. Search also matches each metric's one-line summary.
 */
export function metricPickerOptions(metrics: MetricDef[], { acrossCategories }: { acrossCategories: boolean }): PickerOption[] {
  const order = (m: MetricDef) => CATEGORIES.findIndex((c) => c.id === m.category) * 2 + (m.lens ? 1 : 0)
  return [...metrics]
    .sort((a, b) => order(a) - order(b))
    .map((m) => {
      const parts = acrossCategories ? [CATEGORY_BY_ID[m.category].label] : []
      if (m.lens === "medicare" && acrossCategories) parts.push("Medicare")
      if (m.group) parts.push(m.group)
      return { value: m.id, label: m.label, group: parts.join(" · ") || undefined, keywords: [m.summary] }
    })
}
