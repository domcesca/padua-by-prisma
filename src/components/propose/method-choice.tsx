"use client"

import { Check, ChevronDown, Sparkles } from "lucide-react"
import { useState } from "react"

import { fromPriorities, methodReason, type IntakeSuggestion } from "@/lib/propose/intake"
import type { ProposalModule } from "@/lib/propose/module"
import { onRadioGroupKeyDown, rovingTabIndex } from "@/lib/radio-group"
import { cn } from "@/lib/utils"

/**
 * Step 2's method choice (V7.6). The description from Step 1 recommends a method, with why in plain words, but nothing
 * is applied until the proposer confirms it (or picks another). Replaces V6.7's intake, which applied the suggestion
 * silently.
 */
export function MethodChoice({
  modules,
  current,
  description,
  suggestion,
  confirmed,
  manual,
  onConfirm,
  onPick,
}: {
  modules: ProposalModule[]
  current: ProposalModule
  description: string
  suggestion: IntakeSuggestion | null
  confirmed: boolean
  /** The current method was picked by hand (or came with the link, e.g. from Compare's hospital priorities). */
  manual: boolean
  /** Accept the recommendation. */
  onConfirm: () => void
  /** Pick a method from the list: confirms it. */
  onPick: (id: string) => void
}) {
  const [listOpen, setListOpen] = useState(false)
  const suggested = suggestion ? modules.find((m) => m.id === suggestion.module) : undefined
  const recommended = !confirmed ? suggested : undefined
  const showList = listOpen || (!confirmed && !recommended)
  const CurrentIcon = current.icon

  return (
    <div className="space-y-3">
      {confirmed ? (
        <div className="surface flex flex-wrap items-start gap-3 rounded-xl px-4 py-3" role="status">
          <CurrentIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium">
              {current.label}
              <span className="inline-flex items-center gap-1 rounded-full bg-favorable/10 px-2 py-0.5 text-xs font-semibold text-favorable">
                <Check className="size-3" aria-hidden /> Confirmed
              </span>
            </p>
            <p className="text-[13px] leading-snug text-muted-foreground">{current.summary}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {manual && fromPriorities(description)
                ? "Chosen by the Compare priority this case came from."
                : manual
                  ? suggested && suggested.id !== current.id
                    ? `Your choice. Your description suggests ${suggested.label.toLowerCase()} instead.`
                    : "Your choice."
                  : "Recommended from your description, and confirmed."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setListOpen(!listOpen)}
            aria-expanded={listOpen}
            aria-controls="method-options"
            className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-[13px] font-medium text-primary hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Change method
            <ChevronDown className={cn("size-3.5 transition-transform", listOpen && "rotate-180")} aria-hidden />
          </button>
        </div>
      ) : recommended ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3.5">
          <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-primary">
            <Sparkles className="size-3.5" aria-hidden /> Recommended method
          </p>
          <p className="mt-1 flex items-center gap-2 text-[17px] font-semibold tracking-tight">
            <recommended.icon className="size-4 text-primary" aria-hidden />
            {recommended.label}
          </p>
          <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Why: </span>
            {methodReason(recommended.id, suggestion?.matched ?? [])}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">Nothing is estimated until you confirm a method.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onConfirm}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary-fill px-4 text-[14px] font-medium text-primary-foreground hover:bg-primary-fill/85 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <Check className="size-4" aria-hidden />
              Use {recommended.label.toLowerCase()}
            </button>
            <button
              type="button"
              onClick={() => setListOpen(!listOpen)}
              aria-expanded={listOpen}
              aria-controls="method-options"
              className="glass-subtle inline-flex h-9 items-center gap-1 rounded-full px-4 text-[14px] font-medium hover:bg-white/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:hover:bg-white/10"
            >
              Choose another method
              <ChevronDown className={cn("size-3.5 transition-transform", listOpen && "rotate-180")} aria-hidden />
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-black/4 px-4 py-3 dark:bg-white/6" role="status">
          <p className="text-[14px] font-medium">{description.trim() ? "No clear recommendation" : "No description to go on"}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
            {description.trim()
              ? "The description in step 1 doesn't point clearly to one method. Pick how the benefit is estimated below."
              : "Describe the initiative in step 1 for a recommendation, or pick how the benefit is estimated below."}
          </p>
        </div>
      )}

      {showList && (
        <div id="method-options" role="radiogroup" aria-label="How the benefit is estimated" onKeyDown={onRadioGroupKeyDown} className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map((m, i) => {
            const on = confirmed && m.id === current.id
            const Icon = m.icon
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={rovingTabIndex(on, i, confirmed)}
                onClick={() => {
                  onPick(m.id)
                  setListOpen(false)
                }}
                className={cn(
                  "glass flex items-start gap-3 rounded-xl px-3.5 py-3 text-left transition-shadow duration-200",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  on ? "ring-accent glow-soft" : "hover:glow-soft"
                )}
              >
                <Icon className={cn("mt-0.5 size-4 shrink-0", on ? "text-primary" : "text-tertiary-foreground")} aria-hidden />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
                    {m.label}
                    {suggested?.id === m.id && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs leading-none font-medium text-primary">
                        <Sparkles className="size-3" aria-hidden /> Recommended
                      </span>
                    )}
                  </span>
                  <span className="block text-[12px] leading-snug text-muted-foreground">{m.summary}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
