"use client"

import { ListPlus, Plus, Trash2 } from "lucide-react"

import { Segmented } from "@/components/shell/segmented"
import { formatInt, formatUsd } from "@/lib/format"
import { defineModule, type ModuleEditorProps } from "@/lib/propose/module"
import { NumberField } from "../number-field"

// The universal fallback: named benefit lines, each a quantity × rate or a flat amount a year.
// No data source and no matching; the admin's own numbers, added up.

type Item = { label: string; kind: "rate" | "flat"; quantity: number; rate: number; amount: number }
type State = { items: Item[] }

const blank = (): Item => ({ label: "", kind: "rate", quantity: 0, rate: 0, amount: 0 })
const itemValue = (i: Item) => (i.kind === "rate" ? i.quantity * i.rate : i.amount)
const MAX_ITEMS = 20

// In the URL as a compact JSON list: [label, quantity, rate] or [label, amount].
function toParams(s: State): Record<string, string> {
  const items = s.items.filter((i) => i.label.trim() || itemValue(i))
  if (!items.length) return {}
  return { items: JSON.stringify(items.map((i) => (i.kind === "rate" ? [i.label, i.quantity, i.rate] : [i.label, i.amount]))) }
}

function fromParams(params: URLSearchParams): State {
  try {
    const raw = JSON.parse(params.get("items") ?? "[]") as unknown
    if (!Array.isArray(raw)) return { items: [blank()] }
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0)
    const items = raw.slice(0, MAX_ITEMS).flatMap((r): Item[] => {
      if (!Array.isArray(r) || typeof r[0] !== "string") return []
      const label = r[0].slice(0, 80)
      return r.length >= 3
        ? [{ ...blank(), label, kind: "rate", quantity: n(r[1]), rate: n(r[2]) }]
        : [{ ...blank(), label, kind: "flat", amount: n(r[1]) }]
    })
    return { items: items.length ? items : [blank()] }
  } catch {
    return { items: [blank()] }
  }
}

function Editor({ state, onChange }: ModuleEditorProps<State, null>) {
  const set = (index: number, patch: Partial<Item>) =>
    onChange({ items: state.items.map((it, i) => (i === index ? { ...it, ...patch } : it)) })
  const total = state.items.reduce((sum, i) => sum + itemValue(i), 0)

  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        List what the initiative brings in or saves each year: new revenue, avoided costs, staff time freed up. Each
        line is a quantity times a rate (e.g. 400 visits × $180) or a flat amount a year.
      </p>
      <ol className="space-y-2.5">
        {state.items.map((item, i) => (
          <li key={i} className="surface space-y-2.5 rounded-xl p-3">
            <div className="flex items-center gap-2">
              <input
                value={item.label}
                onChange={(e) => set(i, { label: e.target.value.slice(0, 80) })}
                placeholder={i === 0 ? "e.g. Added outpatient scans" : "What this line is"}
                aria-label={`Line ${i + 1}: name`}
                className="glass-subtle h-9 min-w-0 flex-1 rounded-lg px-3 text-[14px] outline-none placeholder:text-tertiary-foreground focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button
                type="button"
                onClick={() => onChange({ items: state.items.length > 1 ? state.items.filter((_, j) => j !== i) : [blank()] })}
                aria-label={`Remove line ${i + 1}`}
                className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
            <div className="flex flex-wrap items-end gap-2.5">
              <Segmented
                label={`Line ${i + 1}: how it's counted`}
                size="sm"
                value={item.kind}
                onChange={(kind) => set(i, { kind })}
                options={[
                  { value: "rate", label: "Quantity × rate" },
                  { value: "flat", label: "Flat amount" },
                ]}
                className="mb-1"
              />
              {item.kind === "rate" ? (
                <>
                  <NumberField label="Quantity a year" value={item.quantity} onChange={(quantity) => set(i, { quantity })} className="w-32" />
                  <NumberField label="Rate" prefix="$" value={item.rate} onChange={(rate) => set(i, { rate })} decimals={2} className="w-36" />
                </>
              ) : (
                <NumberField label="Per year" prefix="$" value={item.amount} onChange={(amount) => set(i, { amount })} className="w-44" />
              )}
              <p className="num mb-2.5 ml-auto text-[14px] font-medium">{formatUsd(itemValue(item))}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          disabled={state.items.length >= MAX_ITEMS}
          onClick={() => onChange({ items: [...state.items, blank()] })}
          className="glass-subtle inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
        >
          <Plus className="size-3.5" /> Add a line
        </button>
        <p className="text-[14px]">
          <span className="text-muted-foreground">Total a year: </span>
          <span className="num font-semibold">{formatUsd(total)}</span>
        </p>
      </div>
    </div>
  )
}

export const customModule = defineModule<State, null>({
  id: "custom",
  label: "Custom",
  summary: "Your own benefit lines: any quantity × rate, or a flat amount a year.",
  icon: ListPlus,
  hasData: false,
  initial: () => ({ items: [blank()] }),
  toParams,
  fromParams,
  benefit: (s) => {
    const lines = s.items
      .filter((i) => itemValue(i) !== 0)
      .map((i, n) => ({
        label: i.label.trim() || `Line ${n + 1}`,
        detail: i.kind === "rate" ? `${formatInt(i.quantity)} × ${formatUsd(i.rate)}` : "Flat amount a year",
        amount: itemValue(i),
      }))
    return {
      annual: lines.reduce((sum, l) => sum + l.amount, 0),
      lines,
      notes: ["Benefit lines are the proposer’s own estimates; no external data is applied."],
      incomplete: lines.length ? undefined : "Add at least one benefit line with a value.",
    }
  },
  Editor,
})
