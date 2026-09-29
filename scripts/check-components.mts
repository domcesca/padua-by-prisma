// Checks src/lib/benchmark/component-defs.ts against the ETL: for every hospital-year with a value for a ratio metric,
// the numerator ÷ denominator worked out from its raw fields must give back the published ratio. The ETL rounds with
// Python's round() (half to even, on binary floats), so a match is within that rounding: 4 decimal places, and for
// occupancy (a ratio rounded to 4 places, then ×100 to 1 place) within one step of the last place.
// Run: npm run check:components
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { DEFS } from "../src/lib/benchmark/component-defs.ts"

const root = join(import.meta.dirname, "..", "data", "processed")
const load = (dataset: string, file: string) => JSON.parse(readFileSync(join(root, dataset, file), "utf8"))
const problems: string[] = []
for (const [id, def] of Object.entries(DEFS)) {
  const fields = load(def.dataset, "fields.json") as { fields: string[]; values: Record<string, Record<string, (number | null)[]>> }
  const metrics = load(def.dataset, "metrics.json") as Record<string, Record<string, Record<string, unknown>>>
  const index = new Map(fields.fields.map((c, i) => [c, i]))
  let checked = 0
  let off = 0
  for (const [facility, years] of Object.entries(metrics)) {
    for (const [year, row] of Object.entries(years)) {
      const stored = row[id]
      if (typeof stored !== "number") continue
      checked++
      const values = fields.values[facility]?.[year]
      const parts = values
        ? def.parts((code) => {
            const v = values[index.get(code) ?? -1]
            return typeof v === "number" && Number.isFinite(v) ? v : null
          })
        : null
      const ratio = parts ? parts.numerator / parts.denominator : null
      const diff = ratio == null ? Infinity : id === "occupancy" ? Math.abs(ratio * 100 - stored) : Math.abs(ratio - stored)
      if (diff > (id === "occupancy" ? 0.1 + 1e-9 : 0.00005 + 1e-9)) {
        off++
        if (off <= 3) problems.push(`${id} ${facility} ${year}: parts give ${ratio}, published ${stored}`)
      }
    }
  }
  console.log(`${id.padEnd(24)} ${checked} hospital-years, ${checked - off} match`)
}
if (problems.length) {
  console.error(problems.join("\n"))
  process.exit(1)
}
