// Plain-language starting points for Correlate (V7.5): questions administrators ask, each set up as the two measures
// that answer it. Picking one only sets the axes; the peer group and year stay as they are.

export type CorrelateQuestion = { id: string; question: string; x: string; y: string }

export const CORRELATE_QUESTIONS: CorrelateQuestion[] = [
  { id: "cost-complexity", question: "Are higher costs associated with greater case complexity?", x: "caseMixIndex", y: "expensePerAdjDischarge" },
  { id: "cost-occupancy", question: "Do fuller hospitals spend less per case?", x: "occupancy", y: "expensePerAdjDischarge" },
  { id: "stay-readmit", question: "Do longer stays go with more readmissions?", x: "alos", y: "readmHospitalWide" },
  { id: "ed-lwbs", question: "Do busier EDs lose more patients before they’re seen?", x: "edVisitsPerStation", y: "edLwbsRate" },
  { id: "experience-margin", question: "Is better patient experience linked to stronger margins?", x: "hcahpsRating", y: "operatingMargin" },
  { id: "medicare-margin", question: "Do Medicare losses pull down the overall margin?", x: "medicareMargin", y: "operatingMargin" },
]

/** The question a pair of axes answers, if it's one of the starting points. */
export const questionFor = (x: string, y: string) => CORRELATE_QUESTIONS.find((q) => q.x === x && q.y === y) ?? null
