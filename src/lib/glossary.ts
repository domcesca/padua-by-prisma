import "server-only"

import { CATEGORY_BY_ID, DATASETS, isHcaiDataset, translateHref } from "@/lib/data/datasets"
import { DATASET_IDS, getDictionary } from "@/lib/data/store"

// The help panel's glossary: every metric and report field, straight from the same dictionaries
// Translate and the metric catalog read (data/processed/<dataset>/dictionary.json), so the
// definitions can't drift apart. Nothing here is written by hand.

export type GlossaryEntry = {
  /** Unique across datasets: the same metric id can be defined by two sources (e.g. occupancy). */
  key: string
  kind: "metric" | "field"
  term: string
  /** HCAI column code, for fields. */
  code?: string
  /** HCAI's own label when ours differs. */
  hcaiLabel?: string
  definition: string
  formula?: string
  caution?: string
  /** Where it comes from and where it sits, e.g. "Utilization data · Licensed beds". */
  context: string
  /** Translate's full entry, for the HCAI financial and utilization datasets. */
  href?: string
}

let cached: Promise<GlossaryEntry[]> | null = null

export function getGlossary(): Promise<GlossaryEntry[]> {
  cached ??= (async () => {
    const dictionaries = await Promise.all(DATASET_IDS.map(getDictionary))
    const metrics: GlossaryEntry[] = []
    const fields: GlossaryEntry[] = []
    for (const d of dictionaries) {
      const source = DATASETS[d.dataset].shortLabel
      const sections = new Map(d.sections.map((s) => [s.id, s.title]))
      for (const m of d.metrics) {
        metrics.push({
          key: `${d.dataset}:m:${m.id}`,
          kind: "metric",
          term: m.label,
          definition: m.summary,
          formula: m.formula,
          ...(m.caution ? { caution: m.caution } : {}),
          context: [source, m.category ? CATEGORY_BY_ID[m.category].label : null, m.group].filter(Boolean).join(" · "),
          ...(isHcaiDataset(d.dataset) ? { href: translateHref(d.dataset, { metric: m.id }) } : {}),
        })
      }
      for (const f of d.fields) {
        fields.push({
          key: `${d.dataset}:f:${f.code}`,
          kind: "field",
          term: f.label,
          code: f.code,
          ...(f.hcaiLabel && f.hcaiLabel !== f.label ? { hcaiLabel: f.hcaiLabel } : {}),
          definition: f.summary,
          ...(f.caution ? { caution: f.caution } : {}),
          context: [source, sections.get(f.section)].filter(Boolean).join(" · "),
          ...(isHcaiDataset(d.dataset) ? { href: translateHref(d.dataset, { field: f.code }) } : {}),
        })
      }
    }
    return [...metrics, ...fields]
  })()
  cached.catch(() => (cached = null))
  return cached
}
