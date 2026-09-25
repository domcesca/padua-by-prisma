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
  /** A limitation the reader must see before acting on the numbers; shown at the top of the results (and in print). */
  caution?: string
}

export type ModuleContext = {
  facilityId: string | null
  facilityName: string | null
  /** Useful life in years, from the cost inputs. */
  life: number
  /** Advanced mode is on: show advanced-only inputs. */
  advanced: boolean
  /** Advanced mode's wage index adjustment is on (reimbursement modules). */
  wageIndex: boolean
}

/** What a module's benefit may depend on besides its own inputs. */
export type BenefitContext = {
  /** Useful life in years, from the cost inputs: for benefits that phase in, averaged over it. */
  life: number
  /** Advanced mode is on: apply advanced-only inputs (off: ignore them, whatever they hold). */
  advanced: boolean
  /** Advanced mode's wage index adjustment is on: price at the hospital's wage-adjusted rate where the module can. */
  wageIndex: boolean
}

/**
 * What the module's volume is, for Advanced mode's break-even and sensitivity: scaling it by k multiplies every
 * volume input (cases, services, hours, improvements) by k and leaves prices alone.
 */
export type VolumeHook<State, Data> = {
  /** The sensitivity bar's label, e.g. "Added cases". */
  label: string
  scale: (state: State, k: number, data: Data | null) => State
  /** The break-even read-out at k times the volume entered, e.g. { value: "142 cases a year", detail: "71% of the 200 entered" }. */
  describe: (state: State, data: Data | null, k: number) => { value: string; detail?: string }
}

/**
 * One input the sensitivity analysis varies: `apply` scales it by f (0.8 for −20%). Without `apply`, the input is a
 * price: it scales the module's whole benefit (e.g. the payment per case).
 */
export type Driver<State> = { id: string; label: string; apply?: (state: State, f: number) => State }

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
  /** Advanced mode's payer-mix weighting applies (reimbursement modules: their estimate is a Medicare rate). */
  payerMix?: boolean
  /** The module phases its benefit in itself, so Advanced mode's generic ramp-up doesn't apply. */
  ownTiming?: boolean
  /** Advanced mode's wage index adjustment applies (reimbursement modules priced at national Medicare rates). */
  wageIndex?: boolean
  /** Advanced options this module keeps in its own benefit section, named for the Advanced panel. */
  advancedExtras?: string[]
  volume?: VolumeHook<State, Data>
  /** Inputs besides volume and the shared costs that the sensitivity analysis varies. */
  drivers?: (state: State, data: Data | null, context: BenefitContext) => Driver<State>[]
  Editor: ComponentType<ModuleEditorProps<State, Data>>
}

/** Erases a module's own types for the registry; each module stays fully typed where it's defined. */
export const defineModule = <S, D>(m: ProposalModule<S, D>) => m as unknown as ProposalModule
