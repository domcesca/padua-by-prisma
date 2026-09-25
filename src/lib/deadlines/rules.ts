// HCAI hospital financial reporting deadlines.
//
// Sources (verified September 2026):
//  - Quarterly Financial & Utilization Report: due 45 days after the end of each
//    calendar quarter. https://hcai.ca.gov/data/submit-data/financial-reporting
//  - Hospital Annual Disclosure Report: due "within four months after the close
//    of the hospital's fiscal year". Health & Safety Code §128755(a)(1).
//  - Extensions (requested in SIERA): annual reports up to 90 days total (60 on
//    the first request, 30 on a second); quarterly reports up to 30 days, all
//    granted on the first request. 22 CCR §97051.
//  - A report period also ends at closure, relocation, change of licensee, or
//    license suspension. 22 CCR §97040(b).
//  - Late filing penalty: $100 per day. Health & Safety Code §128770(a).
//
// All dates are calendar dates handled in UTC so they never shift with the
// viewer's time zone. Dates are NOT moved for weekends or state holidays;
// SIERA shows each facility's official due dates.

export type ReportKind = "quarterly" | "annual" | "offcycle"

export type Deadline = {
  id: string
  kind: ReportKind
  title: string
  periodLabel: string
  periodStart: Date
  periodEnd: Date
  due: Date
  /** Latest due date with every extension granted. */
  extendedDue: Date
  extensionDays: number
  note?: string
}

export const RULES = {
  quarterly: { dueDays: 45, extensionDays: 30 },
  annual: { dueMonths: 4, firstExtensionDays: 60, extensionDays: 90 },
  penaltyPerDay: 100,
} as const

export const SOURCES = [
  {
    label: "HCAI — Submit Financial Data (SIERA)",
    href: "https://hcai.ca.gov/data/submit-data/financial-reporting",
    detail: "Annual report within four months of fiscal year end; quarterly report 45 days after each calendar quarter.",
  },
  {
    label: "Health & Safety Code §128755",
    href: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=HSC&sectionNum=128755",
    detail: "Annual reports due within four months after the close of the hospital's fiscal year.",
  },
  {
    label: "22 CCR §97051 — Extensions",
    href: "https://www.law.cornell.edu/regulations/california/22-CCR-97051",
    detail: "Annual: up to 90 days total (60 first, 30 second). Quarterly: up to 30 days, granted on the first request.",
  },
  {
    label: "22 CCR §97040 — Report periods",
    href: "https://www.law.cornell.edu/regulations/california/22-CCR-97040",
    detail: "A report period also ends at closure, relocation, change of licensee, or license suspension.",
  },
  {
    label: "HCAI — Distressed hospital financial monitoring (AB 112)",
    href: "https://hcai.ca.gov/document/isor-distressed-hospital-financial-monitoring/",
    detail: "Quarterly reports for periods ending March 31, 2025 and later add balance-sheet items (cash, investments, debt).",
  },
  {
    label: "Health & Safety Code §128770 — Penalties",
    href: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=HSC&sectionNum=128770",
    detail: "$100 per day for late reports; may be reduced or waived on appeal for good cause.",
  },
] as const

// -- date helpers (UTC calendar dates) ---------------------------------------

export const utcDate = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d))

export function today(): Date {
  const now = new Date()
  return utcDate(now.getFullYear(), now.getMonth(), now.getDate())
}

export function addDays(date: Date, days: number) {
  return utcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days)
}

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()

/** Same day-of-month N months later, clamped (May 31 + 4 months = Sep 30), matching SIERA. */
export function addMonths(date: Date, months: number) {
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth() + months
  const target = utcDate(y, m, 1)
  const day = Math.min(date.getUTCDate(), daysInMonth(target.getUTCFullYear(), target.getUTCMonth()))
  return utcDate(target.getUTCFullYear(), target.getUTCMonth(), day)
}

export const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000)

export function formatDate(date: Date, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) {
  return date.toLocaleDateString("en-US", { timeZone: "UTC", ...opts })
}

export const isoDate = (d: Date) => d.toISOString().slice(0, 10)

// -- schedule ------------------------------------------------------------------

/** Fiscal year end as month (0–11) and day; day defaults to the last day of the month. */
export type FiscalYearEnd = { month: number; day?: number }

function fiscalYearEndIn(year: number, fye: FiscalYearEnd) {
  const day = Math.min(fye.day ?? 31, daysInMonth(year, fye.month))
  return utcDate(year, fye.month, day)
}

export function buildSchedule({
  fye,
  from,
  to,
  offCycleEnd,
}: {
  fye: FiscalYearEnd
  from: Date
  to: Date
  /** Optional closure / relocation / change-of-licensee date that ends a report period early. */
  offCycleEnd?: Date | null
}): Deadline[] {
  const out: Deadline[] = []

  // Quarterly: calendar quarters, due 45 days after quarter end.
  for (let y = from.getUTCFullYear() - 1; y <= to.getUTCFullYear() + 1; y++) {
    for (let q = 0; q < 4; q++) {
      const start = utcDate(y, q * 3, 1)
      const end = utcDate(y, q * 3 + 3, 0)
      const due = addDays(end, RULES.quarterly.dueDays)
      out.push({
        id: `q-${y}-${q + 1}`,
        kind: "quarterly",
        title: "Quarterly Financial & Utilization Report",
        periodLabel: `Q${q + 1} ${y} · ${formatDate(start, { month: "short", day: "numeric" })} – ${formatDate(end, { month: "short", day: "numeric" })}`,
        periodStart: start,
        periodEnd: end,
        due,
        extendedDue: addDays(due, RULES.quarterly.extensionDays),
        extensionDays: RULES.quarterly.extensionDays,
      })
    }
  }

  // Annual: due four months after fiscal year end.
  for (let y = from.getUTCFullYear() - 1; y <= to.getUTCFullYear() + 1; y++) {
    const end = fiscalYearEndIn(y, fye)
    const start = addDays(fiscalYearEndIn(y - 1, fye), 1)
    const due = addMonths(end, RULES.annual.dueMonths)
    out.push({
      id: `a-${isoDate(end)}`,
      kind: "annual",
      title: "Hospital Annual Disclosure Report",
      periodLabel: `Fiscal year ending ${formatDate(end)}`,
      periodStart: start,
      periodEnd: end,
      due,
      extendedDue: addDays(due, RULES.annual.extensionDays),
      extensionDays: RULES.annual.extensionDays,
      note: `First extension request adds ${RULES.annual.firstExtensionDays} days (to ${formatDate(addDays(due, RULES.annual.firstExtensionDays))}); a second adds 30 more.`,
    })
  }

  if (offCycleEnd) {
    const due = addMonths(offCycleEnd, RULES.annual.dueMonths)
    out.push({
      id: `o-${isoDate(offCycleEnd)}`,
      kind: "offcycle",
      title: "Annual Disclosure Report (off-cycle)",
      periodLabel: `Period ending ${formatDate(offCycleEnd)} (closure, relocation, or change of licensee)`,
      periodStart: offCycleEnd,
      periodEnd: offCycleEnd,
      due,
      extendedDue: addDays(due, RULES.annual.extensionDays),
      extensionDays: RULES.annual.extensionDays,
      note: "A short report period ends on this date, and the regular fiscal-year schedule continues afterward unless HCAI approves a change.",
    })
  }

  return out.filter((d) => d.due >= from && d.due <= to).sort((a, b) => a.due.getTime() - b.due.getTime())
}

/**
 * "past" = the due date has passed and the viewer hasn't marked it filed. We can't
 * know whether it was filed, so it's a prompt to confirm, not an accusation.
 */
export type DeadlineStatus = "filed" | "past" | "soon" | "upcoming"

/** Per-report progress the viewer tracks locally. */
export type Progress = { filed?: boolean; extended?: boolean }

export const DUE_SOON_DAYS = 30

/** Due date that applies given whether the viewer says extensions were granted. */
export const effectiveDue = (d: Deadline, p: Progress | undefined) => (p?.extended ? d.extendedDue : d.due)

export function statusOf(d: Deadline, now: Date, p: Progress | undefined): DeadlineStatus {
  if (p?.filed) return "filed"
  const left = daysBetween(now, effectiveDue(d, p))
  if (left < 0) return "past"
  return left <= DUE_SOON_DAYS ? "soon" : "upcoming"
}
