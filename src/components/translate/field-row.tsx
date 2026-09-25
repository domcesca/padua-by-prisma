"use client"

import { AlertTriangle, ChevronRight } from "lucide-react"

import type { DictionaryField, DictionarySection, FieldUnit } from "@/lib/data/types"
import { formatField, formatPercent } from "@/lib/format"
import { cn } from "@/lib/utils"

export const BIG_CHANGE = 0.2

const UNIT_LABEL: Record<FieldUnit, string> = {
  usd: "Dollars",
  count: "Count",
  days: "Days",
  hours: "Hours",
  pct: "Percent",
  beds: "Beds",
  fte: "Full-time equivalents",
  minutes: "Minutes",
  text: "Text",
  date: "Date",
  code: "Code",
}

export type FieldValues = {
  /** Value shown in the row (selected year, or the uploaded row). */
  current: number | string | null
  /** Prior year value, when comparing years. */
  previous?: number | null
  /** Year-over-year change as a fraction. */
  change?: number | null
  /** Every year, for the detail table. */
  history?: { year: number; value: number | null; annualized: boolean }[]
}

export function FieldRow({
  field,
  section,
  values,
  expanded,
  onToggle,
  compareLabel,
}: {
  field: DictionaryField
  section: DictionarySection | undefined
  values: FieldValues | null
  expanded: boolean
  onToggle: () => void
  compareLabel?: string
}) {
  const drivers = [...(field.drivers ?? []), ...(section?.drivers ?? [])]
  const caution = field.caution ?? section?.caution
  const change = values?.change ?? null
  const big = change != null && Math.abs(change) >= BIG_CHANGE
  const panelId = `field-${field.code}-panel`

  return (
    <li id={`field-${field.code}`} className="scroll-mt-24">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
        className={cn(
          "grid w-full grid-cols-[1fr_auto] items-start gap-x-4 gap-y-1 px-4 py-3.5 text-left transition-colors duration-150 sm:grid-cols-[9.5rem_1fr_auto] sm:px-5",
          "hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
          expanded && "bg-muted/40"
        )}
      >
        <code className="order-last col-span-2 font-mono text-xs text-tertiary-foreground sm:order-none sm:col-span-1 sm:pt-0.5">
          {field.code}
        </code>
        <span className="min-w-0">
          <span className="block text-[15px] leading-snug font-medium">{field.label}</span>
          <span className="mt-0.5 block text-[13px] leading-relaxed text-muted-foreground">{field.summary}</span>
        </span>
        <span className="flex items-start gap-3">
          {values && (
            <span className="max-w-40 text-right sm:max-w-56">
              <span
                className="num block truncate text-[15px] font-medium"
                title={values.current != null ? String(values.current) : undefined}
              >
                {typeof values.current === "number" && !["text", "code", "date"].includes(field.unit)
                  ? formatField(field.unit, values.current, { compact: true })
                  : (values.current ?? "—")}
              </span>
              {change != null && (
                <span
                  className={cn("num mt-0.5 inline-flex items-center gap-1 text-xs", big ? "font-medium text-foreground" : "text-muted-foreground")}
                  title={big ? "Large year-over-year change — expand to see common reasons" : undefined}
                >
                  {big && <span className="size-1.5 rounded-full bg-warning" aria-hidden />}
                  {change > 0 ? "+" : ""}
                  {formatPercent(change, 0)}
                  <span className="sr-only">{big ? " (large change)" : ""}</span>
                </span>
              )}
            </span>
          )}
          <ChevronRight
            className={cn("mt-1 size-4 shrink-0 text-tertiary-foreground transition-transform duration-200", expanded && "rotate-90")}
          />
        </span>
      </button>

      {expanded && (
        <div id={panelId} className="fade-up grid gap-5 bg-muted/40 px-4 pt-1 pb-5 sm:px-5 lg:grid-cols-2 lg:pl-[calc(9.5rem+2.25rem)]">
          <div className="space-y-3">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
              <dt className="text-muted-foreground">HCAI label</dt>
              <dd>{field.hcaiLabel}</dd>
              <dt className="text-muted-foreground">Unit</dt>
              <dd>{UNIT_LABEL[field.unit]}</dd>
              {section && (
                <>
                  <dt className="text-muted-foreground">Section</dt>
                  <dd>{section.title}</dd>
                </>
              )}
            </dl>
            {caution && (
              <p className="flex gap-2 rounded-lg bg-card px-3 py-2.5 text-[13px] leading-relaxed text-muted-foreground ring-1 ring-border">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                <span>
                  <span className="sr-only">Caution: </span>
                  {caution}
                </span>
              </p>
            )}
            {values?.history && values.history.length > 0 && typeof values.current !== "string" && (
              <HistoryTable unit={field.unit} history={values.history} />
            )}
          </div>

          {drivers.length > 0 && (
            <div>
              <p className="text-[13px] font-medium">
                {big ? `Why it might have moved ${compareLabel ?? "this year"}` : "Why this number moves"}
              </p>
              <ul className="mt-2 space-y-2">
                {drivers.map((d) => (
                  <li key={d} className="flex gap-2.5 text-[13px] leading-relaxed text-muted-foreground">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-tertiary-foreground" aria-hidden />
                    {d}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

function HistoryTable({ unit, history }: { unit: FieldUnit; history: NonNullable<FieldValues["history"]> }) {
  return (
    <table className="num w-full max-w-sm text-[13px]">
      <caption className="sr-only">Values by report year</caption>
      <thead>
        <tr className="border-b border-border text-xs text-muted-foreground">
          <th className="py-1 text-left font-medium">Year</th>
          <th className="py-1 text-right font-medium">Value</th>
          <th className="py-1 text-right font-medium">Change</th>
        </tr>
      </thead>
      <tbody>
        {history.map((h, i) => {
          const prev = history[i - 1]?.value
          const change = prev != null && h.value != null && prev !== 0 ? (h.value - prev) / Math.abs(prev) : null
          return (
            <tr key={h.year} className="border-b border-border last:border-0">
              <td className="py-1">
                {h.year}
                {h.annualized && <span title="Annualized from a partial-year report"> *</span>}
              </td>
              <td className="py-1 text-right whitespace-nowrap">{formatField(unit, h.value, { compact: true })}</td>
              <td className="py-1 pl-3 text-right whitespace-nowrap text-muted-foreground">
                {change == null ? "—" : `${change > 0 ? "+" : ""}${formatPercent(change, 0)}`}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
