/** 3–5 evenly spaced axis ticks on a 1 / 2 / 2.5 / 5 × 10ⁿ step, spanning the data. */
export function niceTicks(values: number[], includeZero: boolean) {
  let min = values.length ? Math.min(...values) : 0
  let max = values.length ? Math.max(...values) : 1
  if (includeZero) {
    min = Math.min(0, min)
    max = Math.max(0, max)
  }
  if (min === max) max = min + (Math.abs(min) || 1)
  const rough = (max - min) / 3
  const mag = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough)!
  const start = Math.floor(min / step) * step
  const end = Math.ceil(max / step) * step
  const ticks: number[] = []
  // Round to kill float noise like 0.30000000000000004.
  for (let t = start; t <= end + step / 2; t += step) ticks.push(Number(t.toPrecision(12)))
  return ticks
}
