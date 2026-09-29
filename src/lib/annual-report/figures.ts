import type { MetricFormat } from "../format.ts"

// A figure in the annual report, as data: what the chart draws, what its table lists, and one sentence per point for
// the keyboard announcement. One shape for every chart, so every one gets the same keyboard access, screen-reader
// table and Chart / Table switch (components/overview/report-figure.tsx).

export type FigureKind =
  /** Lines over years, one per series. */
  | "line"
  /** Vertical bars over years, one bar per series side by side. */
  | "bars"
  /** Vertical bars over years, series stacked. */
  | "stacked"
  /** Horizontal bars, one row per category, one bar per series. */
  | "hbars"
  /** A bridge: each row a step up or down from the one before; totals start from zero. */
  | "bridge"

export type FigureSeries = {
  key: string
  label: string
  values: (number | null)[]
}

/** A bridge step: an amount added or taken away, or a running total. */
export type BridgeStep = {
  label: string
  kind: "total" | "up" | "down"
  amount: number
  from: number
  to: number
}

export type Figure = {
  id: string
  kind: FigureKind
  title: string
  /** Which report and period the figure shows: "Financial report · fiscal years ended June 30". */
  period: string
  format: MetricFormat
  /** Row labels: years, payers, bed types, steps. */
  categories: string[]
  series: FigureSeries[]
  /** Bridges only. */
  steps?: BridgeStep[]
  /** A reference line (1.0 for infection ratios) and its name. */
  reference?: { value: number; label: string }
  /** Columns the table adds after the series (e.g. length of stay beside occupancy by bed type). */
  extraColumns?: {
    label: string
    format: MetricFormat
    values: (number | null)[]
  }[]
  /** A short line under the figure: a caveat or what a color means. */
  note?: string
  /** Name of the category column in the table. */
  categoryLabel: string
}
