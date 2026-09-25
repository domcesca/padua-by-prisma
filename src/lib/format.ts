import type { FieldUnit, MetricUnit } from "@/lib/data/types"

const int = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })
const oneDecimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 })
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })

export const formatInt = (n: number) => int.format(n)

const cents = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatUsd(n: number, opts: { compact?: boolean; cents?: boolean } = {}) {
  const sign = n < 0 ? "−" : ""
  const abs = Math.abs(n)
  if (opts.compact && abs >= 1000) return `${sign}$${compact.format(abs)}`
  if (opts.cents) return `${sign}$${cents.format(abs)}`
  return `${sign}$${int.format(abs)}`
}

export function formatPercent(fraction: number, digits = 1) {
  const pct = fraction * 100
  const sign = pct < 0 ? "−" : ""
  return `${sign}${Math.abs(pct).toFixed(digits)}%`
}

export function formatNumberCompact(n: number) {
  return Math.abs(n) >= 10_000 ? compact.format(n) : int.format(n)
}

/** Enough of a metric definition to format its values. */
export type MetricFormat = { unit: MetricUnit; decimals?: number }

/** Format a benchmark metric value by its unit. `short` is for axis ticks and tight labels. */
export function formatMetric(metric: MetricFormat, value: number | null | undefined, short = false): string {
  if (value == null || !Number.isFinite(value)) return "—"
  switch (metric.unit) {
    case "ratio":
    case "share":
      // Fractions shown as percents; ticks drop the decimal when it's .0.
      return formatPercent(value, short && Number.isInteger(Math.round(value * 1000) / 10) ? 0 : 1)
    case "pct":
      return `${short ? int.format(value) : oneDecimal.format(value)}%`
    case "days": {
      const digits = metric.decimals ?? 0
      const n = value.toLocaleString("en-US", { minimumFractionDigits: short ? 0 : digits, maximumFractionDigits: digits })
      return short ? n : `${n} days`
    }
    case "usd":
      return formatUsd(value, { compact: short || Math.abs(value) >= 1_000_000 })
    case "number": {
      // SIRs, rates, stars, minutes: fixed decimals so peers line up; ticks trim trailing zeros.
      const digits = metric.decimals ?? 2
      return value.toLocaleString("en-US", { minimumFractionDigits: short ? 0 : digits, maximumFractionDigits: digits })
    }
    default:
      return short ? formatNumberCompact(value) : int.format(value)
  }
}

/** Format a raw HCAI field value by its dictionary unit. */
export function formatField(unit: FieldUnit, value: number | null | undefined, opts: { compact?: boolean } = {}) {
  if (value == null || !Number.isFinite(value)) return "—"
  switch (unit) {
    case "usd":
      return formatUsd(value, opts)
    case "pct":
      return `${oneDecimal.format(value)}%`
    case "days":
      return Number.isInteger(value) ? int.format(value) : oneDecimal.format(value)
    case "fte":
      return int.format(value)
    default:
      return opts.compact ? formatNumberCompact(value) : int.format(value)
  }
}

export function formatChange(prev: number | null | undefined, next: number | null | undefined) {
  if (prev == null || next == null || !Number.isFinite(prev) || !Number.isFinite(next) || prev === 0) return null
  return (next - prev) / Math.abs(prev)
}

export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}
