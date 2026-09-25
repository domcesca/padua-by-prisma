import type { LucideIcon } from "lucide-react"
import type { ComponentType } from "react"

// The contract every benefit module implements. The core engine (engine.ts) doesn't know what a
// DRG or a line item is: it takes the module's annual benefit and does the rest. Adding a module
// means writing one of these, registering it in components/propose/modules, and (only if it needs
// server data) a loader in lib/propose/module-data.ts. Nothing in the engine or page changes.

/** One line of a module's benefit estimate, shown in the results and the printout. */
export type BenefitLine = {
  label: string
  /** How the line was worked out, e.g. "30 cases × $13,397". */
  detail?: string
  amount: number
}

export type Benefit = {
  /** Expected-case annual benefit, in dollars; scenarios scale it. */
  annual: number
  lines: BenefitLine[]
  /** Caveats the results and printout repeat (data sources, what's left out). */
  notes: string[]
  /** What's still missing before the estimate means anything, if anything. */
  incomplete?: string
}

export type ModuleContext = {
  facilityId: string | null
  facilityName: string | null
  /** Useful life in years, from the cost inputs. */
  life: number
}

/** What a module's benefit may depend on besides its own inputs. */
export type BenefitContext = {
  /** Useful life in years, from the cost inputs: for benefits that phase in, averaged over it. */
  life: number
}

export type ModuleEditorProps<State, Data> = {
  state: State
  onChange: (next: State) => void
  /** The module's server data, or null while it loads (or when it has none). */
  data: Data | null
  context: ModuleContext
}

export type ProposalModule<State = unknown, Data = unknown> = {
  id: string
  label: string
  /** One line for the module chooser. */
  summary: string
  icon: LucideIcon
  /** Loads server data through /api/propose/<id>?facility=…; leave false for modules that need none. */
  hasData: boolean
  initial: () => State
  /** State → URL params (keys unique to this module), so a proposal survives reloads and can be shared. */
  toParams: (state: State) => Record<string, string>
  fromParams: (params: URLSearchParams) => State
  benefit: (state: State, data: Data | null, context: BenefitContext) => Benefit
  Editor: ComponentType<ModuleEditorProps<State, Data>>
}

/** Erases a module's own types for the registry; each module stays fully typed where it's defined. */
export const defineModule = <S, D>(m: ProposalModule<S, D>) => m as unknown as ProposalModule
