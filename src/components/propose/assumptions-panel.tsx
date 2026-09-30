"use client"

import { ChevronDown, Database, Calculator, PencilLine, Save, TriangleAlert } from "lucide-react"
import { useState } from "react"

import { SHEET_KINDS, type AssumptionSheet } from "@/lib/propose/assumptions"
import { FLOW_STEPS, type FlowStep } from "@/lib/propose/spec"
import type { Warning } from "@/lib/propose/warnings"
import { cn } from "@/lib/utils"

// The business case's assumptions at a glance (V7.6), beside every step: public data, the proposer's inputs, and what
// Padua calculated from them, kept apart so none is mistaken for another, plus the checks flagged so far and the draft's
// save state. Beside the flow on wide screens (sticky); a collapsed summary above it on phones.

const ICONS = { publicData: Database, inputs: PencilLine, outputs: Calculator }
const TONE = {
  publicData: "bg-primary/10 text-primary",
  inputs: "bg-black/5 text-muted-foreground dark:bg-white/8",
  outputs: "bg-favorable/10 text-favorable",
}

export type DraftState = { saved: boolean; savedAt: number | null; onSave: () => void }

export function AssumptionsPanel({
  sheet,
  warnings,
  headline,
  onStep,
  draft,
  compact = false,
}: {
  sheet: AssumptionSheet
  warnings: Warning[]
  /** One line on where the case stands: "Expected: pays back in 2.4 years", or what's still missing. */
  headline: string
  onStep: (step: FlowStep) => void
  draft: DraftState
  /** Phones: one collapsed card above the step. */
  compact?: boolean
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({ publicData: true, inputs: false, outputs: true })
  const body = (
    <div className="space-y-3">
      <p className="text-[13px] leading-snug font-medium">{headline}</p>
      {warnings.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            <TriangleAlert className="size-3.5 text-warning" aria-hidden />
            {warnings.length} {warnings.length === 1 ? "check" : "checks"} to review
          </p>
          <ul className="mt-1 space-y-1">
            {warnings.map((w) => (
              <li key={w.id} className="text-xs leading-snug">
                {w.text}{" "}
                <button type="button" onClick={() => onStep(w.step)} className="font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  Step {w.step}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {SHEET_KINDS.map((k) => {
        const items = sheet[k.key]
        const Icon = ICONS[k.key]
        const id = `assumptions-${k.key}${compact ? "-m" : ""}`
        const isOpen = open[k.key]
        return (
          <div key={k.key}>
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={id}
              onClick={() => setOpen({ ...open, [k.key]: !isOpen })}
              className="flex w-full items-center gap-2 rounded-md py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", TONE[k.key])}>
                <Icon className="size-3" aria-hidden />
                {k.label}
              </span>
              <span className="text-xs text-muted-foreground">{items.length}</span>
              <ChevronDown className={cn("ml-auto size-3.5 text-muted-foreground transition-transform", isOpen && "rotate-180")} aria-hidden />
            </button>
            {isOpen && (
              <div id={id}>
                <p className="text-[11px] text-tertiary-foreground">{k.help}</p>
                {items.length ? (
                  <dl className="mt-1 divide-y divide-border/60">
                    {items.map((i) => (
                      <div key={`${i.label}|${i.value}`} className="py-1.5">
                        <dt className="text-xs text-muted-foreground">{i.label}</dt>
                        <dd className="num text-[13px] leading-snug font-medium">{i.value}</dd>
                        {i.source && <dd className="text-[11px] text-tertiary-foreground">{i.source}</dd>}
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {k.key === "publicData" ? "None yet: public data comes in with the benefit method and the hospital." : k.key === "outputs" ? "Appear once the method is confirmed." : "None yet."}
                  </p>
                )}
              </div>
            )}
          </div>
        )
      })}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <button
          type="button"
          onClick={draft.onSave}
          className="glass-subtle inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium hover:bg-white/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:hover:bg-white/10"
        >
          <Save className="size-3.5" aria-hidden />
          {draft.saved ? "Save now" : "Save draft"}
        </button>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {draft.saved && draft.savedAt
            ? `Saved in this browser at ${new Date(draft.savedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}; changes save as you go.`
            : "Not saved: the link keeps it, or save a draft in this browser."}
        </p>
      </div>
    </div>
  )

  if (compact) {
    return (
      <details className="widget group p-4 print:hidden" data-tour="propose-assumptions">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold">Assumptions</span>
            <span className="block truncate text-xs text-muted-foreground">
              {sheet.publicData.length} public · {sheet.inputs.length} yours · {sheet.outputs.length} calculated
              {warnings.length ? ` · ${warnings.length} to review` : ""}
            </span>
          </span>
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="mt-3">{body}</div>
      </details>
    )
  }
  return (
    <section aria-labelledby="assumptions-title" data-tour="propose-assumptions" className="widget space-y-3 p-4 print:hidden">
      <h2 id="assumptions-title" className="text-[15px] font-semibold tracking-tight">
        Assumptions
      </h2>
      {body}
    </section>
  )
}

export function FlowStepper({
  step,
  onStep,
  status,
}: {
  step: FlowStep
  onStep: (step: FlowStep) => void
  /** Per step: done (its inputs are in), and how many checks it has. */
  status: Record<FlowStep, { done: boolean; warnings: number }>
}) {
  return (
    <nav aria-label="Business case steps" className="print:hidden">
      <p className="mb-2 text-xs font-medium text-muted-foreground sm:sr-only">
        Step {step} of 4 · {FLOW_STEPS[step - 1].label}
      </p>
      <ol className="grid grid-cols-4 gap-1.5 sm:gap-2">
        {FLOW_STEPS.map((s) => {
          const current = s.step === step
          const st = status[s.step]
          return (
            <li key={s.step} className="min-w-0">
              <button
                type="button"
                onClick={() => onStep(s.step)}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex w-full min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:gap-2 sm:px-3 sm:text-left",
                  current ? "bg-primary/10" : "hover:bg-black/4 dark:hover:bg-white/6"
                )}
              >
                <span
                  className={cn(
                    "num flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    current ? "bg-primary-fill text-primary-foreground" : st.done ? "bg-favorable/15 text-favorable" : "bg-black/6 text-muted-foreground dark:bg-white/10"
                  )}
                  aria-hidden
                >
                  {s.step}
                </span>
                <span className="w-full min-w-0 sm:w-auto">
                  <span className={cn("block truncate text-[12px] leading-tight sm:text-[13px]", current ? "font-semibold" : "font-medium")}>
                    <span className="sm:hidden">{s.short}</span>
                    <span className="hidden sm:inline">{s.label}</span>
                  </span>
                  <span className="sr-only block truncate text-[11px] leading-tight text-muted-foreground sm:not-sr-only">
                    {st.warnings ? `${st.warnings} to review` : st.done ? "Done" : current ? "In progress" : "To do"}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/**
 * The assumption sheet as the printout's last page (V7.6): every export carries it, whatever the printout settings,
 * so the numbers can be traced back to what was assumed.
 */
export function AssumptionSheetPrint({ sheet, warnings, title }: { sheet: AssumptionSheet; warnings: Warning[]; title: string }) {
  return (
    <section aria-label="Assumption sheet" className="hidden break-before-page print:block">
      <h2 className="text-xl font-semibold tracking-tight">Assumption sheet</h2>
      <p className="mb-3 text-xs text-muted-foreground">{title}: what the figures rest on, by where each came from.</p>
      {SHEET_KINDS.map((k) => (
        <div key={k.key} className="mb-4 break-inside-avoid">
          <h3 className="text-[14px] font-semibold">
            {k.label} <span className="font-normal text-muted-foreground">· {k.help}</span>
          </h3>
          {sheet[k.key].length ? (
            <table className="num mt-1 w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th scope="col" className="py-1 pr-3 font-medium">Item</th>
                  <th scope="col" className="py-1 pr-3 font-medium">Value</th>
                  {k.key === "publicData" && <th scope="col" className="py-1 font-medium">Source</th>}
                </tr>
              </thead>
              <tbody>
                {sheet[k.key].map((i) => (
                  <tr key={`${i.label}|${i.value}`} className="border-b border-border/60">
                    <th scope="row" className="py-1 pr-3 font-normal">{i.label}</th>
                    <td className="py-1 pr-3">{i.value}</td>
                    {k.key === "publicData" && <td className="py-1 text-muted-foreground">{i.source}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-[12px] text-muted-foreground">None.</p>
          )}
        </div>
      ))}
      {warnings.length > 0 && (
        <div className="break-inside-avoid">
          <h3 className="text-[14px] font-semibold">Checks flagged</h3>
          <ul className="mt-1 list-disc pl-5 text-[12px]">
            {warnings.map((w) => (
              <li key={w.id}>{w.text}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
