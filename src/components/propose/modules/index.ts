import type { ProposalModule } from "@/lib/propose/module"
import { customModule } from "./custom"
import { reimbursementModule } from "./reimbursement"

// Benefit modules, in the order the chooser shows them. Add new ones here (see lib/propose/module.ts).
export const MODULES: ProposalModule[] = [reimbursementModule, customModule]

export const MODULE_IDS = MODULES.map((m) => m.id)
