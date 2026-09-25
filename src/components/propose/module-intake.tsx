"use client"

import { ChevronDown, Sparkles } from "lucide-react"

import type { IntakeSuggestion } from "@/lib/propose/intake"
import type { ProposalModule } from "@/lib/propose/module"
import { cn } from "@/lib/utils"

/**
 * "Describe what you're proposing" plus the module picker. With a confident suggestion the picker folds to the chosen
 * module and a "Choose another way" button; with none (or nothing typed) it's open, as it always was.
 */
export function ModuleIntake({
  modules,
  current,
  description,
  suggestion,
  manual,
  open,
  onDescription,
  onPick,
  onToggle,
}: {
  modules: ProposalModule[]
  current: ProposalModule
  description: string
  suggestion: IntakeSuggestion | null
  /** The current module was picked by hand. */
  manual: boolean
  open: boolean
  onDescription: (text: string) => void
  onPick: (id: string) => void
  onToggle: () => void
}) {
  const suggested = suggestion ? modules.find((m) => m.id === suggestion.module) : undefined
  const matched = suggestion?.matched.map((t) => `“${t}”`).join(", ")
  const CurrentIcon = current.icon

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="proposal-description" className="mb-1 block text-[13px] font-medium">
          Describe what you’re proposing <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <input
          id="proposal-description"
          value={description}
          onChange={(e) => onDescription(e.target.value.slice(0, 300))}
          placeholder="e.g. Buying an AI stroke detection tool, or adding 3 FTEs to reduce ED boarding"
          className="glass h-11 w-full rounded-xl px-3.5 text-[15px] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
          {!description.trim()
            ? "We’ll suggest how to estimate the benefit. You can always pick it yourself below."
            : suggested
              ? `Suggests ${suggested.label.toLowerCase()} (matched ${matched}).`
              : "No clear match for that description: pick how the benefit is estimated below."}
        </p>
      </div>

      <div>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <p id="module-label" className="text-[13px] font-medium">
            How the benefit is estimated
          </p>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls="module-options"
            className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium text-primary hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {open ? "Hide the other ways" : "Choose another way"}
            <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
          </button>
        </div>

        {!open && (
          <div className="glass ring-accent flex items-start gap-3 rounded-xl px-3.5 py-3">
            <CurrentIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
                {current.label}
                <Badge suggested={!manual && suggested?.id === current.id} />
              </span>
              <span className="block text-[12px] leading-snug text-muted-foreground">{current.summary}</span>
              {manual && suggested && suggested.id !== current.id && (
                <span className="mt-1 block text-[12px] text-muted-foreground">
                  Your description suggests {suggested.label.toLowerCase()}.{" "}
                  <button type="button" onClick={() => onPick(suggested.id)} className="font-medium text-primary hover:underline">
                    Use it
                  </button>
                </span>
              )}
            </span>
          </div>
        )}

        {open && (
          <div id="module-options" role="radiogroup" aria-labelledby="module-label" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {modules.map((m) => {
              const on = m.id === current.id
              const Icon = m.icon
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onPick(m.id)}
                  className={cn(
                    "glass flex items-start gap-3 rounded-xl px-3.5 py-3 text-left transition-shadow duration-200",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    on ? "ring-accent glow-soft" : "hover:glow-soft"
                  )}
                >
                  <Icon className={cn("mt-0.5 size-4 shrink-0", on ? "text-primary" : "text-tertiary-foreground")} />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
                      {m.label}
                      {suggested?.id === m.id && <Badge suggested />}
                    </span>
                    <span className="block text-[12px] leading-snug text-muted-foreground">{m.summary}</span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Badge({ suggested }: { suggested: boolean }) {
  return suggested ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs leading-none font-medium text-primary">
      <Sparkles className="size-3" aria-hidden /> Suggested
    </span>
  ) : (
    <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs leading-none font-medium text-muted-foreground dark:bg-white/8">Your choice</span>
  )
}
