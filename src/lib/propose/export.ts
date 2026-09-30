import { SHEET_KINDS, type AssumptionSheet } from "./assumptions"
import { formatPayback, type Projection } from "./engine"
import type { Warning } from "./warnings"

// The business case as a CSV (V7.6): the scenario output and, always with it, the assumption sheet, so the numbers
// can be traced back to what was assumed. Plain numbers (no currency formatting) in the output tables, so a
// spreadsheet can add them up; the sheet keeps the wording the page shows.

const cell = (v: string | number | null | undefined) => {
  if (v == null) return ""
  const s = typeof v === "number" ? (Number.isFinite(v) ? String(Math.round(v * 100) / 100) : "") : v
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const row = (...cells: (string | number | null | undefined)[]) => cells.map(cell).join(",")

export function proposalCsv({
  title,
  facilityName,
  method,
  generated,
  projections,
  life,
  sheet,
  warnings,
  notes,
  link,
}: {
  title: string
  facilityName: string | null
  method: string
  generated: string
  projections: Projection[]
  life: number
  sheet: AssumptionSheet
  warnings: Warning[]
  notes: string[]
  link: string
}) {
  const lines: string[] = [
    row("Business case", title),
    row("Hospital", facilityName ?? "None chosen"),
    row("Benefit method", method),
    row("Generated", generated),
    row("Link", link),
    "",
    row("Scenario output"),
    row("Scenario", "Share of estimate (%)", "Payback", "ROI (%)", "NPV ($)", "Benefit a year ($)", "Net a year ($)", "Amortized net a year ($)", `Net over ${life} years ($)`),
    ...projections.map((p) =>
      row(p.label, p.multiplier * 100, formatPayback(p.paybackYears, life), p.roi == null ? null : p.roi * 100, p.npv, p.annualBenefit, p.annualNet, p.annualNetAfterAmortization, p.cumulativeNet)
    ),
    "",
    row("Year by year"),
    row("Scenario", "Year", "Benefit ($)", "Costs ($)", "Net ($)", "Cumulative ($)", "Present value ($)"),
    ...projections.flatMap((p) => p.rows.map((r) => row(p.label, r.year === 0 ? "Start" : r.year, r.benefit, -r.cost, r.net, r.cumulative, r.present))),
    "",
    row("Assumption sheet"),
    row("Kind", "Item", "Value", "Source"),
    ...SHEET_KINDS.flatMap((k) => sheet[k.key].map((i) => row(k.label, i.label, i.value, i.source ?? (k.key === "inputs" ? "Entered in this business case" : k.key === "outputs" ? "Calculated by Padua" : "")))),
  ]
  if (warnings.length) lines.push("", row("Checks flagged"), ...warnings.map((w) => row(w.text)))
  if (notes.length) lines.push("", row("Method notes"), ...notes.map((n) => row(n)))
  return lines.join("\n")
}

export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([`﻿${text}`], { type }))
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
