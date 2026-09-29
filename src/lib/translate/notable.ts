import type { DictionaryField } from "@/lib/data/types"

// What counts as notable for a hospital in Data definitions (V7.5), so the page can lead with exceptions. A field is
// notable when it moved by BIG_CHANGE (20%, the threshold the field list has always flagged) or more year over year AND
// the move is material: a dollar change of at least 1% of the hospital's total operating expenses (financial data), or,
// for counts, days, beds and the like, a field with at least 20 in one of the two years. Without those floors a
// $4,000 line going to $9,000, or 2 beds becoming 3, would crowd out real changes.

export const BIG_CHANGE = 0.2
/** Dollar moves smaller than this share of total operating expenses aren't called notable. */
export const DOLLAR_FLOOR = 0.01
/** Non-dollar fields smaller than this in both years aren't called notable. */
export const SIZE_FLOOR = 20

export type Change = { current: number | null; previous: number | null; change: number | null }

export function isNotable(field: DictionaryField, c: Change | null, operatingExpense: number | null): boolean {
  if (!c || c.change == null || c.current == null || c.previous == null) return false
  if (Math.abs(c.change) < BIG_CHANGE) return false
  if (["text", "date", "code", "pct"].includes(field.unit)) return false
  if (field.unit === "usd") {
    // Without total operating expenses to size it against, a dollar move needs to be at least $1 million.
    const floor = operatingExpense && operatingExpense > 0 ? operatingExpense * DOLLAR_FLOOR : 1_000_000
    return Math.abs(c.current - c.previous) >= floor
  }
  return Math.max(Math.abs(c.current), Math.abs(c.previous)) >= SIZE_FLOOR
}

/** How a notable change ranks: dollar moves by their size against total operating expenses, others by percent. */
export function materiality(field: DictionaryField, c: Change, operatingExpense: number | null) {
  if (field.unit === "usd") return Math.abs((c.current ?? 0) - (c.previous ?? 0)) / (operatingExpense && operatingExpense > 0 ? operatingExpense : 1e8)
  return Math.abs(c.change ?? 0)
}
