import type { ProposalModule } from "@/lib/propose/module"
import { customModule } from "./custom"
import { outpatientModule } from "./outpatient"
import { penaltyModule } from "./penalty"
import { reimbursementModule } from "./reimbursement"
import { savingsModule } from "./savings"

// Benefit modules, in the order the chooser shows them. Add new ones here (see lib/propose/module.ts).
export const MODULES: ProposalModule[] = [reimbursementModule, outpatientModule, savingsModule, penaltyModule, customModule]

export const MODULE_IDS = MODULES.map((m) => m.id)
