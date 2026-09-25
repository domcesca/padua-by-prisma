import { SEARCH_TERMS } from "./search-terms"

// "Describe what you're proposing" → the benefit module that fits best. No separate vocabulary: it reads the same
// plain-language entries as the DRG and APC pickers (search-terms.ts). An entry with DRGs votes for inpatient
// reimbursement, one with APCs for outpatient, one with `modules` for those modules. Direct codes count fully,
// related-only entries half, intent entries (`modules`) double, and a multi-word phrase a little more than a
// single word (it's more specific).
//
// It only suggests when the winner is clear: a real score, and well ahead of the runner-up. Otherwise it returns
// null and the page shows the full module picker, as if nothing had been typed.

export type IntakeSuggestion = {
  module: string
  /** The words in the description that decided it, for "matched “stroke”". */
  matched: string[]
  score: number
}

const MIN_SCORE = 1
/** The winner must beat the runner-up by this factor. */
const MIN_LEAD = 1.5

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const phrase = (term: string) => new RegExp(`(^|[^a-z0-9])${escape(term)}($|[^a-z0-9])`)

type Vote = { module: string; weight: number }

function votes(entry: (typeof SEARCH_TERMS)[number]): Vote[] {
  const out: Vote[] = []
  if (entry.drgs?.length) out.push({ module: "reimbursement", weight: 1 })
  else if (entry.related?.length) out.push({ module: "reimbursement", weight: 0.5 })
  if (entry.apcs?.length) out.push({ module: "outpatient", weight: 1 })
  else if (entry.relatedApcs?.length) out.push({ module: "outpatient", weight: 0.5 })
  // An explicit intent ("readmissions", "hire") says what the proposal does; clinical words say who it's for.
  for (const m of entry.modules ?? []) out.push({ module: m, weight: 2 })
  return out
}

export function suggestModule(description: string): IntakeSuggestion | null {
  const text = description.toLowerCase().replace(/\s+/g, " ").trim()
  if (text.length < 3) return null
  const scores = new Map<string, { score: number; matched: Set<string> }>()
  for (const entry of SEARCH_TERMS) {
    // Each entry counts once, by its most specific (longest) matching term.
    const hit = entry.terms.filter((t) => phrase(t).test(text)).sort((a, b) => b.length - a.length)[0]
    if (!hit) continue
    const bonus = hit.includes(" ") ? 0.25 : 0
    for (const v of votes(entry)) {
      const s = scores.get(v.module) ?? { score: 0, matched: new Set<string>() }
      s.score += v.weight + bonus
      s.matched.add(hit)
      scores.set(v.module, s)
    }
  }
  const ranked = [...scores].sort((a, b) => b[1].score - a[1].score)
  const [best, second] = ranked
  if (!best || best[1].score < MIN_SCORE) return null
  if (second && best[1].score < second[1].score * MIN_LEAD) return null
  return { module: best[0], matched: [...best[1].matched], score: best[1].score }
}
