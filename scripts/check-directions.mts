// Checks src/lib/favorability/directions.ts against the ETL dictionaries: every benchmarkable metric has a direction,
// and wherever a dictionary says higherIsBetter true/false, the config agrees. Run: npm run check:directions
import { readdirSync, readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

import { DIRECTIONS } from "../src/lib/favorability/directions.ts"

const root = join(import.meta.dirname, "..", "data", "processed")
const problems: string[] = []
let checked = 0
for (const dir of readdirSync(root)) {
  const file = join(root, dir, "dictionary.json")
  if (!existsSync(file)) continue
  const dict = JSON.parse(readFileSync(file, "utf8")) as { metrics?: { id: string; category: string | null; higherIsBetter: boolean | null }[] }
  for (const m of dict.metrics ?? []) {
    checked++
    const d = DIRECTIONS[m.id]
    if (!d) {
      if (m.category) problems.push(`${dir}/${m.id}: no direction (would be treated as context)`)
      continue
    }
    const expected = m.higherIsBetter === true ? "higher" : m.higherIsBetter === false ? "lower" : "context"
    if (d !== expected) problems.push(`${dir}/${m.id}: config says ${d}, dictionary says ${expected}`)
  }
}
if (problems.length) {
  console.error(problems.join("\n"))
  process.exit(1)
}
console.log(`directions.ts agrees with the dictionaries for all ${checked} metrics`)
