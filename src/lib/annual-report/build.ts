import type { Ownership, PayerGroup } from "@/lib/data/types"
import { formatInt, formatPercent, formatUsd, type MetricFormat } from "@/lib/format"

import { CALCS, PAYER_GROUPS, PAYERS } from "./calcs"
import type { BridgeStep, Figure } from "./figures"
import type { AnnualReportData, ReportYear } from "./types"

// Overview's annual report (V7.5.5), as data: thirteen sections of prose and figures built from one hospital's
// /api/report/[id] payload. Prose leads; a figure appears only where the Phase 1 audit lists one. Nothing is compared
// with any other hospital. Financial sections speak of the hospital's fiscal year, utilization sections of the
// calendar year, and no figure mixes the two. A section whose figures the hospital doesn't file (reduced filers report
// zeros for the pages they skip) is left out, and "About this report" says which and why.

export type SectionId =
  | "brief"
  | "profile"
  | "income"
  | "revenue"
  | "expenses"
  | "position"
  | "workforce"
  | "inpatient"
  | "ed"
  | "procedures"
  | "capital"
  | "quality"
  | "about"

export type Paragraph = string | { lead: string; text: string }

export type ReportSection = {
  id: SectionId
  title: string
  /** The report and period the section reads from, shown under its title. */
  period: string | null
  /** The opening plain-language sentence. */
  lead: string
  paragraphs: Paragraph[]
  figures: Figure[]
  /** Section 12: not part of HCAI's filing. */
  addendum?: boolean
  /** Section 13: lists and links. */
  about?: AboutContent
}

export type AboutContent = {
  sources: { label: string; href: string; detail: string }[]
  /** The annual report's own measures: how each is worked out. */
  calcs: {
    label: string
    formula: string
    summary: string
    caution?: string
  }[]
  omitted: { title: string; reason: string }[]
  gaps: string[]
  siera: string
}

export type AnnualReport = {
  sections: ReportSection[]
  omitted: { id: SectionId; title: string; reason: string }[]
}

export const SECTION_TITLES: Record<SectionId, string> = {
  brief: "The year in brief",
  profile: "Who the hospital is",
  income: "Did it make money?",
  revenue: "Where the money comes from",
  expenses: "Where the money goes",
  position: "Financial position",
  workforce: "Workforce",
  inpatient: "Inpatient care",
  ed: "Emergency department",
  procedures: "Surgery, births and cardiac care",
  capital: "Capital investment",
  quality: "Quality, from CMS and CDPH",
  about: "About this report",
}

/** Ownership as an adjective (Compare's labels, such as "County / City / UC", are filter names). */
const OWNERSHIP_PROSE: Record<Ownership, string> = {
  nonprofit: "nonprofit",
  investor: "investor-owned",
  district: "healthcare-district",
  government: "publicly owned",
  state: "state-run",
  other: "",
}

export const SIERA_URL = "https://reports.siera.hcai.ca.gov"

// -- numbers and words ------------------------------------------------------------------------------------------------

const USD: MetricFormat = { unit: "usd" }
const COUNT: MetricFormat = { unit: "count" }
const SHARE: MetricFormat = { unit: "ratio" }
const PCT: MetricFormat = { unit: "pct" }

const money = (v: number) => formatUsd(v, { compact: Math.abs(v) >= 100_000 })
/** A share as a percent; one that rounds to zero without being zero reads "less than 0.1%". */
const pct = (v: number) => (v !== 0 && Math.abs(v) < 0.0005 ? `${v < 0 ? "−" : ""}less than 0.1%` : formatPercent(v))
/** Within 0.05% of revenue either way: a break-even year (county facilities often book revenue to match cost). */
const breakEven = (result: number, revenue: number) => revenue > 0 && Math.abs(result) < 0.0005 * revenue
/** "made $1.2M" / "lost $1.2M" / "broke even". */
const result = (v: number, revenue: number) => (breakEven(v, revenue) ? "broke even" : `${v < 0 ? "lost" : "made"} ${money(Math.abs(v))}`)
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

const PAYER_LABEL: Record<PayerGroup, string> = {
  medicare: "Medicare",
  medical: "Medi-Cal",
  commercial: "Commercial insurance",
  indigent: "County and indigent programs",
  other: "Self-pay and other",
}

/** A payer's name mid-sentence: program names keep their capitals. */
const payerMid = (p: PayerGroup) => (p === "medicare" || p === "medical" ? PAYER_LABEL[p] : lowerFirst(PAYER_LABEL[p]))

/** A reported value: a finite number, else null. */
const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : null)
const f = (y: ReportYear | undefined, code: string) => n(y?.fields[code])
/** A field's value when it's reported as something other than zero (reduced filers report zeros). */
const nz = (y: ReportYear | undefined, code: string) => {
  const v = f(y, code)
  return v != null && v !== 0 ? v : null
}
const total = (y: ReportYear | undefined, codes: string[]) => codes.reduce((s, c) => s + (f(y, c) ?? 0), 0)
const calc = (y: ReportYear | undefined, id: string) => {
  const v = y?.calcs[id]
  return typeof v === "number" && Number.isFinite(v) ? v : null
}
const payerCalc = (y: ReportYear | undefined, id: string) => {
  const v = y?.calcs[id]
  return v && typeof v === "object" ? (v as Record<PayerGroup, number | null>) : null
}
const measure = (y: ReportYear | undefined, id: string) => n(y?.measures[id])

/** "up 4.2% from $171.1M" / "down 3.0% from 9,870" / "unchanged"; null without a prior value. */
function change(prev: number | null, next: number | null, fmt: (v: number) => string) {
  if (prev == null || next == null || prev === 0) return null
  const d = (next - prev) / Math.abs(prev)
  if (Math.abs(d) < 0.0005) return "about the same as the year before"
  return `${d > 0 ? "up" : "down"} ${formatPercent(Math.abs(d))} from ${fmt(prev)}`
}

/** A change in a ratio in percentage points: "up 2.1 points from 3.4%". */
function pointChange(prev: number | null, next: number | null) {
  if (prev == null || next == null) return null
  const d = (next - prev) * 100
  if (Math.abs(d) < 0.05) return `unchanged from ${pct(prev)}`
  return `${d > 0 ? "up" : "down"} ${Math.abs(d).toFixed(1)} point${Math.abs(d) >= 0.95 && Math.abs(d) < 1.05 ? "" : "s"} from ${pct(prev)}`
}

const list = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : items.length === 2 ? `${items[0]} and ${items[1]}` : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
/** A name compared without case or punctuation ("AHMC HEALTHCARE INC." is "AHMC Healthcare Inc."). */
const simplify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")

// -- report periods --------------------------------------------------------------------------------------------------

/** "the fiscal year ended June 30, 2024" from a financial year's meta. */
export function fiscalYear(y: ReportYear) {
  const end = y.meta.end ? new Date(`${y.meta.end}T00:00:00Z`) : null
  const base =
    end && !Number.isNaN(end.getTime())
      ? `the fiscal year ended ${MONTHS[end.getUTCMonth()]} ${end.getUTCDate()}, ${end.getUTCFullYear()}`
      : `report year ${y.year}`
  return base
}

/** "June 30, 2024", the day the fiscal year ended, or null. */
function fiscalEnd(y: ReportYear) {
  const end = y.meta.end ? new Date(`${y.meta.end}T00:00:00Z`) : null
  return end && !Number.isNaN(end.getTime()) ? `${MONTHS[end.getUTCMonth()]} ${end.getUTCDate()}, ${end.getUTCFullYear()}` : null
}

/** "FY ended Jun 2024" for axis labels and table rows. */
export function fiscalShort(y: ReportYear) {
  const end = y.meta.end ? new Date(`${y.meta.end}T00:00:00Z`) : null
  return end && !Number.isNaN(end.getTime()) ? `FY ${MONTHS[end.getUTCMonth()].slice(0, 3)} ${end.getUTCFullYear()}` : `FY ${y.year}`
}

/** The fiscal-year label for a figure's period line, noting a year that ends on a different month. */
function fiscalPeriod(years: ReportYear[]) {
  const ends = [...new Set(years.map((y) => (y.meta.end ? MONTHS[new Date(`${y.meta.end}T00:00:00Z`).getUTCMonth()] : null)).filter(Boolean))]
  return `HCAI financial report · fiscal years${ends.length === 1 ? ` ending in ${ends[0]}` : ""}`
}
const CALENDAR_PERIOD = "HCAI utilization report · calendar years"

const auditPhrase = (y: ReportYear) =>
  y.meta.status === "Audited" ? "audited" : y.meta.status === "In Process" ? "not yet audited" : y.meta.status ? lowerFirst(y.meta.status) : null

// -- section builders -------------------------------------------------------------------------------------------------

type Ctx = {
  data: AnnualReportData
  name: string
  fin: ReportYear | undefined
  finPrev: ReportYear | undefined
  finYears: ReportYear[]
  util: ReportYear | undefined
  utilPrev: ReportYear | undefined
  utilYears: ReportYear[]
}

const lastN = <T>(xs: T[], k: number) => xs.slice(Math.max(0, xs.length - k))

/** Operating revenue: net patient revenue plus other operating revenue. */
const opRevenue = (y: ReportYear | undefined) => total(y, ["NET_PT_REV", "OTH_OP_REV"])

const hasIncome = (y: ReportYear | undefined) => opRevenue(y) > 0 && (f(y, "TOT_OP_EXP") ?? 0) > 0

function brief(c: Ctx): ReportSection | null {
  const { fin, finPrev, util, utilPrev, name } = c
  if (!fin && !util) return null
  const paragraphs: Paragraph[] = []
  let lead = ""
  if (fin && hasIncome(fin)) {
    const om = measure(fin, "operatingMargin")
    const tm = calc(fin, "totalMargin")
    const ops = f(fin, "NET_FRM_OP")
    const net = f(fin, "NET_INCOME")
    const audit = auditPhrase(fin)
    const rev = opRevenue(fin)
    const allRev = rev + (f(fin, "NONOP_REV") ?? 0)
    const opsEven = breakEven(ops ?? 0, rev)
    const intro = `In ${fiscalYear(fin)}${audit ? ` (${audit})` : ""}, ${name}`
    lead =
      opsEven && net != null && breakEven(net, allRev)
        ? `${intro} broke even, both on operations and overall.`
        : `${intro} ${result(ops ?? 0, rev)} on operations${om != null && !opsEven ? `, an operating margin of ${pct(om)}` : ""}${net != null ? `, and ${result(net, allRev)} overall${tm != null && !breakEven(net, allRev) ? ` (a total margin of ${pct(tm)})` : ""}` : ""}.`
    const npr = f(fin, "NET_PT_REV")
    if (npr) {
      const ch = change(f(finPrev, "NET_PT_REV"), npr, money)
      paragraphs.push(
        `Net patient revenue was ${money(npr)}${ch ? `, ${ch}` : ""}; operating expenses were ${money(f(fin, "TOT_OP_EXP")!)}${finPrev && hasIncome(finPrev) ? `, ${change(f(finPrev, "TOT_OP_EXP"), f(fin, "TOT_OP_EXP"), money)}` : ""}.`
      )
    }
  }
  if (util) {
    const dis = nz(util, "TOT_DISCHARGES")
    const occ = measure(util, "occupancy")
    if (dis) {
      const ch = change(nz(utilPrev, "TOT_DISCHARGES"), dis, formatInt)
      const s = `In calendar ${util.year} ${lead ? "it" : name} discharged ${formatInt(dis)} patients${ch ? `, ${ch}` : ""}${occ != null ? `, and its licensed beds were ${occ.toFixed(1)}% occupied` : ""}.`
      if (lead) paragraphs.push(s)
      else lead = s
    }
  }
  if (!lead) return null
  // The biggest change from the year before among the headline figures, in its own sentence.
  const moves: {
    label: string
    prev: number | null
    next: number | null
    fmt: (v: number) => string
    when: string
  }[] = [
    {
      label: "Net patient revenue",
      prev: nz(finPrev, "NET_PT_REV"),
      next: nz(fin, "NET_PT_REV"),
      fmt: money,
      when: "fiscal",
    },
    {
      label: "Operating expenses",
      prev: nz(finPrev, "TOT_OP_EXP"),
      next: nz(fin, "TOT_OP_EXP"),
      fmt: money,
      when: "fiscal",
    },
    {
      label: "Discharges",
      prev: nz(utilPrev, "TOT_DISCHARGES"),
      next: nz(util, "TOT_DISCHARGES"),
      fmt: formatInt,
      when: "calendar",
    },
    {
      label: "Emergency visits",
      prev: nz(utilPrev, "ER_TRAFFIC_TOT"),
      next: nz(util, "ER_TRAFFIC_TOT"),
      fmt: formatInt,
      when: "calendar",
    },
    {
      label: "Inpatient surgeries",
      prev: nz(utilPrev, "INPATIENT_SURG_OPER"),
      next: nz(util, "INPATIENT_SURG_OPER"),
      fmt: formatInt,
      when: "calendar",
    },
    {
      label: "Outpatient surgeries",
      prev: nz(utilPrev, "OUTPATIENT_SURG_OPER"),
      next: nz(util, "OUTPATIENT_SURG_OPER"),
      fmt: formatInt,
      when: "calendar",
    },
    {
      label: "Paid FTEs",
      prev: nz(finPrev, "HOSP_FTE"),
      next: nz(fin, "HOSP_FTE"),
      fmt: formatInt,
      when: "fiscal",
    },
  ]
  const biggest = moves
    .filter((m) => m.prev != null && m.next != null && m.prev > 0)
    .map((m) => ({ ...m, d: (m.next! - m.prev!) / m.prev! }))
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0]
  if (biggest && Math.abs(biggest.d) >= 0.05) {
    paragraphs.push(
      `The biggest change from the year before: ${lowerFirst(biggest.label)} ${biggest.d > 0 ? "rose" : "fell"} ${formatPercent(Math.abs(biggest.d))}, to ${biggest.fmt(biggest.next!)} (${biggest.when === "fiscal" ? "fiscal" : "calendar"} year).`
    )
  }
  const periods = [fin && `financial figures cover ${fiscalYear(fin)}`, util && `utilization figures cover calendar ${util.year}`].filter(Boolean) as string[]
  if (periods.length === 2) paragraphs.push(`Throughout this report, ${list(periods)}. The two are never combined in one chart.`)
  return {
    id: "brief",
    title: SECTION_TITLES.brief,
    period: null,
    lead,
    paragraphs,
    figures: [],
  }
}

function profile(c: Ctx): ReportSection {
  const { data, name } = c
  const fac = data.facility
  const where = [fac.city, fac.county && `${fac.county} County`].filter(Boolean).join(", ")
  const kind = fac.licenseCategory ? fac.licenseCategory.toLowerCase() : fac.typeOfCare ? `${fac.typeOfCare.toLowerCase()} hospital` : "hospital"
  const owner = OWNERSHIP_PROSE[fac.ownership]
  const described = owner ? `${owner} ${kind}` : kind
  const lead = `${name} is ${/^[aeiou]/i.test(described) ? "an" : "a"} ${described}${where ? ` in ${where}` : ""}.`
  const paragraphs: Paragraph[] = []
  const parent = data.profile.parentOrganization
  const bits: string[] = []
  if (parent) bits.push(`Its parent organization is ${parent.replace(/\.$/, "")}`)
  if (fac.owner && simplify(fac.owner) !== simplify(parent ?? "")) bits.push(`${bits.length ? "its" : "Its"} licensed owner is ${fac.owner.replace(/\.$/, "")}`)
  if (bits.length) paragraphs.push(`${bits.join("; ")}.`)

  const latestBeds = Object.keys(data.bedTypes)
    .map(Number)
    .sort((a, b) => a - b)
    .at(-1)
  const beds = latestBeds != null ? data.bedTypes[latestBeds] : []
  if (fac.licensedBeds) {
    const byType = [...beds].sort((a, b) => (b.licensedBeds ?? 0) - (a.licensedBeds ?? 0)).map((b) => `${formatInt(b.licensedBeds!)} ${lowerFirst(b.label)}`)
    paragraphs.push(
      `It is licensed for ${formatInt(fac.licensedBeds)} beds${byType.length > 1 ? `: ${list(byType)}` : ""}${latestBeds ? ` (end of ${latestBeds})` : ""}.`
    )
  }
  const care: string[] = []
  if (data.profile.principalService) care.push(`its principal service is ${data.profile.principalService.toLowerCase().replace(/ \/ /g, "/")}`)
  if (fac.edLevel)
    care.push(`it runs ${fac.edLevel === "Standby" ? "a standby" : fac.edLevel === "Basic" ? "a basic" : "a comprehensive"} emergency department`)
  if (fac.traumaLevel) care.push(`it is a level ${fac.traumaLevel} trauma center`)
  if (fac.teaching) care.push("it is a teaching hospital")
  if (fac.rural) care.push("HCAI classes it as small and rural")
  if (care.length) paragraphs.push(`${care[0].charAt(0).toUpperCase()}${care[0].slice(1)}${care.length > 1 ? `; ${care.slice(1).join("; ")}` : ""}.`)
  if (fac.campuses.length) paragraphs.push(`Its utilization report also covers ${list(fac.campuses)}, which operate under the same license.`)
  if (fac.hospitalType && fac.hospitalType !== "Comparable")
    paragraphs.push(
      `HCAI groups it as ${fac.hospitalType === "Kaiser" ? "a Kaiser Foundation hospital" : fac.hospitalType === "PHF" ? "a psychiatric health facility" : fac.hospitalType === "State" ? "a state hospital" : fac.hospitalType === "LTC Emphasis" ? "a hospital with a long-term care emphasis" : "not comparable with other hospitals"}, which files a reduced or differently structured report; sections it doesn't file are left out.`
    )
  return {
    id: "profile",
    title: SECTION_TITLES.profile,
    period: "HCAI financial and utilization reports · latest filing",
    lead,
    paragraphs,
    figures: [],
  }
}

function income(c: Ctx): ReportSection | null {
  const { fin, finPrev, finYears } = c
  if (!fin || !hasIncome(fin)) return null
  const years = lastN(finYears.filter(hasIncome), 5)
  const om = measure(fin, "operatingMargin")
  const omPrev = measure(finPrev, "operatingMargin")
  const ops = f(fin, "NET_FRM_OP") ?? 0
  const even = breakEven(ops, opRevenue(fin))
  const lead = `It ${result(ops, opRevenue(fin))} on operations in ${fiscalYear(fin)}${om != null && !even ? `, an operating margin of ${pct(om)}` : ""}${omPrev != null && om != null && !(even && breakEven(f(finPrev, "NET_FRM_OP") ?? 0, opRevenue(finPrev))) ? `, ${even ? "against an operating margin of " + pct(omPrev) : pointChange(omPrev, om)} the year before` : ""}.`
  const marginSeries = [
    {
      key: "operating",
      label: "Operating margin",
      values: years.map((y) => measure(y, "operatingMargin")),
    },
    {
      key: "total",
      label: "Total margin",
      values: years.map((y) => calc(y, "totalMargin")),
    },
  ]
  // A hospital that broke even every year (county facilities that book revenue to match cost) gets no flat-zero chart.
  const flat = marginSeries.every((x) => x.values.every((v) => v == null || Math.abs(v) < 0.0005))
  const figures: Figure[] = []
  if (!flat)
    figures.push({
      id: "margins",
      kind: "line",
      title: "Operating and total margin",
      period: fiscalPeriod(years),
      format: SHARE,
      categoryLabel: "Fiscal year",
      categories: years.map(fiscalShort),
      series: marginSeries,
      reference: { value: 0, label: "Break-even" },
      note: "Operating margin counts patient care and other operating revenue; total margin adds donations, investment income and tax or county funds.",
    })
  const charges = nz(fin, "GR_PT_REV")
  if (charges) {
    const ded = f(fin, "DED_FR_REV") ?? 0
    const cap = f(fin, "TOT_CAP_REV") ?? 0
    const npr = f(fin, "NET_PT_REV") ?? 0
    const oth = f(fin, "OTH_OP_REV") ?? 0
    const exp = f(fin, "TOT_OP_EXP") ?? 0
    const nonop = (f(fin, "NONOP_REV") ?? 0) - (f(fin, "NONOP_EXP") ?? 0)
    const taxes = (f(fin, "INC_TAX") ?? 0) + (f(fin, "EXT_ITEM") ?? 0)
    const net = f(fin, "NET_INCOME") ?? 0
    const steps: BridgeStep[] = []
    let run = 0
    const push = (label: string, kind: BridgeStep["kind"], amount: number) => {
      if (kind === "total") {
        steps.push({ label, kind, amount, from: 0, to: amount })
        run = amount
      } else if (amount !== 0) {
        const to = run + (kind === "up" ? amount : -amount)
        steps.push({ label, kind, amount, from: run, to })
        run = to
      }
    }
    push("Charges", "total", charges)
    push("Deductions from revenue", "down", ded)
    if (cap) push("Capitation payments", cap > 0 ? "up" : "down", Math.abs(cap))
    push("Net patient revenue", "total", npr)
    if (oth) push("Other operating revenue", oth > 0 ? "up" : "down", Math.abs(oth))
    push("Operating expenses", "down", exp)
    push("Operating income", "total", f(fin, "NET_FRM_OP") ?? run)
    if (nonop) push("Non-operating income, net", nonop > 0 ? "up" : "down", Math.abs(nonop))
    // Income taxes and extraordinary items: an expense when positive.
    if (taxes) push("Taxes and extraordinary items", taxes > 0 ? "down" : "up", Math.abs(taxes))
    push("Net income", "total", net)
    figures.push({
      id: "bridge",
      kind: "bridge",
      title: `From charges to net income, ${fiscalShort(fin)}`,
      period: fiscalPeriod([fin]),
      format: USD,
      categoryLabel: "Step",
      categories: steps.map((s) => s.label),
      series: [
        {
          key: "amount",
          label: "Amount",
          values: steps.map((s) => (s.kind === "down" ? -s.amount : s.amount)),
        },
      ],
      steps,
      note: "Solid bars are totals; hatched bars add to the total before them, dotted bars take away from it.",
    })
  }
  const paragraphs: Paragraph[] = []
  const nonopRev = nz(fin, "NONOP_REV")
  if (nonopRev) {
    const parts = (
      [
        ["donations", nz(fin, "CONTRIBTNS")],
        ["investment income", nz(fin, "INC_INVEST")],
        ["district tax revenue", nz(fin, "DIST_REV")],
        ["county appropriations", nz(fin, "CNTY_APPRO")],
      ] as [string, number | null][]
    ).filter((p): p is [string, number] => p[1] != null && p[1] > 0)
    paragraphs.push(
      `Outside operations it received ${money(nonopRev)}${parts.length ? `, including ${list(parts.map(([l, v]) => `${money(v)} in ${l}`))}` : ""}${nz(fin, "NONOP_EXP") ? `, and spent ${money(f(fin, "NONOP_EXP")!)} on non-operating items` : ""}.`
    )
  } else {
    paragraphs.push("It reported no non-operating revenue, so its bottom line follows its operating result.")
  }
  if (charges) {
    const npr = f(fin, "NET_PT_REV") ?? 0
    paragraphs.push(
      `For every dollar it charged, it kept ${formatUsd(npr / charges, { cents: true })} as net patient revenue after discounts, charity care and bad debt.`
    )
  }
  return {
    id: "income",
    title: SECTION_TITLES.income,
    period: fiscalPeriod([fin]),
    lead,
    paragraphs,
    figures,
  }
}

function revenue(c: Ctx): ReportSection | null {
  const { fin } = c
  const mix = payerCalc(fin, "payerMixNetRevenue")
  const rates = payerCalc(fin, "collectionRate")
  const chargesBy = PAYERS.map((p) => PAYER_GROUPS[p].reduce((s, x) => s + (f(fin, `GR_IP_${x}`) ?? 0) + (f(fin, `GR_OP_${x}`) ?? 0), 0))
  const netBy = PAYERS.map((p) => PAYER_GROUPS[p].reduce((s, x) => s + (f(fin, `NETRV_${x}`) ?? 0), 0))
  if (!fin || !mix || chargesBy.every((v) => v <= 0)) return null
  const ranked = PAYERS.map((p) => ({ p, share: mix[p] ?? 0 })).sort((a, b) => b.share - a.share)
  const lead = `${PAYER_LABEL[ranked[0].p]} paid ${pct(ranked[0].share)} of its patient revenue in ${fiscalYear(fin)}${ranked[1].share > 0 ? `, and ${payerMid(ranked[1].p)} ${pct(ranked[1].share)}` : ""}.`
  const shown = PAYERS.filter((_, i) => chargesBy[i] > 0 || netBy[i] !== 0)
  const idx = shown.map((p) => PAYERS.indexOf(p))
  const figures: Figure[] = [
    {
      id: "charged-collected",
      kind: "hbars",
      title: "Charged and collected, by payer",
      period: fiscalPeriod([fin]),
      format: USD,
      categoryLabel: "Payer",
      categories: shown.map((p) => PAYER_LABEL[p]),
      series: [
        {
          key: "charged",
          label: "Charged",
          values: idx.map((i) => chargesBy[i]),
        },
        {
          key: "collected",
          label: "Net revenue",
          values: idx.map((i) => netBy[i]),
        },
      ],
      extraColumns: [
        {
          label: "Collection rate",
          format: SHARE,
          values: shown.map((p) => rates?.[p] ?? null),
        },
      ],
      note: "Net revenue is what the hospital expects to be paid; managed-care figures include capitation payments, which have no charges behind them.",
    },
    {
      id: "net-mix",
      kind: "hbars",
      title: "Share of net patient revenue, by payer",
      period: fiscalPeriod([fin]),
      format: SHARE,
      categoryLabel: "Payer",
      categories: shown.map((p) => PAYER_LABEL[p]),
      series: [
        {
          key: "share",
          label: "Share of net patient revenue",
          values: shown.map((p) => mix[p]),
        },
      ],
      note: "A payer whose net revenue is below zero (write-offs larger than payments) counts as zero, as in Compare's payer mix.",
    },
  ]
  const paragraphs: Paragraph[] = []
  const charges = f(fin, "GR_PT_REV") ?? 0
  const contractual = total(fin, ["C_ADJ_MCAR_TR", "C_ADJ_MCAR_MC", "C_ADJ_MCAL_TR", "C_ADJ_MCAL_MC", "C_ADJ_CNTY", "C_ADJ_THRD_TR", "C_ADJ_THRD_MC"])
  const charity = total(fin, ["CHAR_HB", "CHAR_OTH"])
  const bad = f(fin, "BAD_DEBT") ?? 0
  if (charges > 0) {
    const parts = [
      contractual > 0 && `${money(contractual)} in contractual discounts to insurers and government programs (${pct(contractual / charges)} of charges)`,
      charity > 0 && `${money(charity)} in charity care (${pct(charity / charges)})`,
      bad > 0 && `${money(bad)} in bad debt (${pct(bad / charges)})`,
    ].filter(Boolean) as string[]
    if (parts.length) paragraphs.push(`Of ${money(charges)} in charges, it wrote off ${list(parts)}.`)
  }
  const chargeTotal = chargesBy.reduce((a, b) => a + b, 0)
  // Payers with under 1% of charges are left out of the comparison: a handful of claims says little.
  const best = PAYERS.filter((p) => rates?.[p] != null && chargesBy[PAYERS.indexOf(p)] >= 0.01 * chargeTotal).sort((a, b) => rates![b]! - rates![a]!)
  if (best.length >= 2) {
    paragraphs.push(
      `${PAYER_LABEL[best[0]]} paid the most per dollar charged (${formatUsd(rates![best[0]]!, { cents: true })}); ${payerMid(best.at(-1)!)} the least (${formatUsd(rates![best.at(-1)!]!, { cents: true })}).`
    )
  }
  const cap = nz(fin, "TOT_CAP_REV")
  if (cap) paragraphs.push(`${money(cap)} of its net patient revenue came as capitation: fixed payments per enrolled member rather than per service.`)
  const dsh = nz(fin, "DISP_855")
  if (dsh) paragraphs.push(`It received ${money(Math.abs(dsh))} in Medi-Cal disproportionate-share payments for serving many low-income patients.`)
  return {
    id: "revenue",
    title: SECTION_TITLES.revenue,
    period: fiscalPeriod([fin]),
    lead,
    paragraphs,
    figures,
  }
}

const EXPENSE_TYPES: { key: string; label: string; codes: string[] }[] = [
  {
    key: "labor",
    label: "Salaries and benefits",
    codes: ["EXP_SAL", "EXP_BEN"],
  },
  {
    key: "fees",
    label: "Physician and professional fees",
    codes: ["EXP_PHYS", "EXP_OTHPRO"],
  },
  { key: "supplies", label: "Supplies and drugs", codes: ["EXP_SUPP"] },
  { key: "purchased", label: "Purchased services", codes: ["EXP_PURCH"] },
  {
    key: "capital",
    label: "Depreciation, leases and interest",
    codes: ["EXP_DEPRE", "EXP_LEASES", "EXP_INTRST"],
  },
  {
    key: "other",
    label: "Insurance and all other",
    codes: ["EXP_INSUR", "EXP_OTH"],
  },
]
const EXPENSE_CENTERS: { label: string; codes: string[] }[] = [
  { label: "Inpatient units", codes: ["EXP_DLY"] },
  { label: "Ancillary services", codes: ["EXP_ANC"] },
  { label: "Ambulatory services", codes: ["EXP_AMB"] },
  { label: "Care purchased from others", codes: ["EXP_PIP", "EXP_POP"] },
  { label: "Education and research", codes: ["EXP_RES", "EXP_ED"] },
  { label: "General services", codes: ["EXP_GEN"] },
  { label: "Fiscal services", codes: ["EXP_FISC"] },
  { label: "Administration", codes: ["EXP_ADM"] },
  { label: "Unassigned costs", codes: ["EXP_UNASSG"] },
]
const typesReported = (y: ReportYear | undefined) => EXPENSE_TYPES.filter((t) => total(y, t.codes) > 0).length

function expenses(c: Ctx): ReportSection | null {
  const { fin, finPrev, finYears } = c
  if (!fin || typesReported(fin) < 2) return null
  const years = lastN(
    finYears.filter((y) => typesReported(y) >= 2),
    5
  )
  const exp = f(fin, "TOT_OP_EXP") ?? 0
  const labor = calc(fin, "laborShare")
  const lead = `Operating expenses were ${money(exp)} in ${fiscalYear(fin)}${finPrev ? `, ${change(nz(finPrev, "TOT_OP_EXP"), exp, money) ?? "with no prior year to compare"}` : ""}${labor != null ? `; salaries and benefits were ${pct(labor)} of them` : ""}.`
  const types = EXPENSE_TYPES.filter((t) => years.some((y) => total(y, t.codes) > 0))
  const figures: Figure[] = [
    {
      id: "expense-types",
      kind: "stacked",
      title: "Operating expenses by type",
      period: fiscalPeriod(years),
      format: USD,
      categoryLabel: "Fiscal year",
      categories: years.map(fiscalShort),
      series: types.map((t) => ({
        key: t.key,
        label: t.label,
        values: years.map((y) => total(y, t.codes)),
      })),
    },
  ]
  const centers = EXPENSE_CENTERS.map((cen) => ({
    ...cen,
    value: total(fin, cen.codes),
  })).filter((cen) => cen.value > 0)
  if (centers.length >= 2) {
    figures.push({
      id: "expense-centers",
      kind: "hbars",
      title: `Operating expenses by department group, ${fiscalShort(fin)}`,
      period: fiscalPeriod([fin]),
      format: USD,
      categoryLabel: "Department group",
      categories: centers.map((cen) => cen.label),
      series: [
        {
          key: "expense",
          label: "Operating expense",
          values: centers.map((cen) => cen.value),
        },
      ],
      extraColumns: [
        {
          label: "Share",
          format: SHARE,
          values: centers.map((cen) => (exp > 0 ? cen.value / exp : null)),
        },
      ],
    })
  }
  const paragraphs: Paragraph[] = []
  const perDay = calc(fin, "expensePerAdjDay")
  const perDis = measure(fin, "expensePerAdjDischarge")
  if (perDay != null || perDis != null) {
    paragraphs.push(
      `That comes to ${list([perDay != null && `${money(perDay)} per adjusted patient day`, perDis != null && `${money(perDis)} per adjusted discharge`].filter(Boolean) as string[])}, counting outpatient work in by its share of charges${calc(finPrev, "expensePerAdjDay") != null && perDay != null ? ` (${change(calc(finPrev, "expensePerAdjDay"), perDay, money)} per adjusted day)` : ""}.`
    )
  }
  const biggestMove = types
    .map((t) => ({
      t,
      prev: total(finPrev, t.codes),
      next: total(fin, t.codes),
    }))
    .filter((m) => m.prev > 0 && m.next > 0)
    .sort((a, b) => Math.abs(b.next - b.prev) - Math.abs(a.next - a.prev))[0]
  if (biggestMove && finPrev) {
    paragraphs.push(`The largest change in dollars was in ${lowerFirst(biggestMove.t.label)}, ${change(biggestMove.prev, biggestMove.next, money)}.`)
  }
  if (labor != null) paragraphs.push("Contract and registry staff are paid through purchased services, not salaries, so they don't count in the labor share.")
  return {
    id: "expenses",
    title: SECTION_TITLES.expenses,
    period: fiscalPeriod([fin]),
    lead,
    paragraphs,
    figures,
  }
}

const hasBalanceSheet = (y: ReportYear | undefined) => (f(y, "TOT_ASST") ?? 0) > 0

function position(c: Ctx): ReportSection | null {
  const { fin, finYears } = c
  if (!fin || !hasBalanceSheet(fin)) return null
  const years = lastN(finYears.filter(hasBalanceSheet), 5)
  const cash = f(fin, "CASH") ?? 0
  const dcoh = measure(fin, "daysCashOnHand")
  const when = fiscalEnd(fin) ? `On ${fiscalEnd(fin)}, the last day of its fiscal year,` : `At the end of report year ${fin.year}`
  const lead =
    cash > 0
      ? `${when} it held ${money(cash)} in cash${dcoh != null ? `, enough to cover ${dcoh < 1 ? "less than a day" : `${formatInt(Math.round(dcoh))} day${Math.round(dcoh) === 1 ? "" : "s"}`} of operating expenses` : ""}.`
      : `${when} its balance sheet showed no cash of its own${nz(fin, "CUR_ASST") ? `, against ${money(f(fin, "CUR_ASST")!)} in current assets` : ""}.`
  const figures: Figure[] = [
    {
      id: "balance",
      kind: "line",
      title: "Cash, property, debt and equity at year end",
      period: fiscalPeriod(years),
      format: USD,
      categoryLabel: "Fiscal year end",
      categories: years.map(fiscalShort),
      series: [
        { key: "cash", label: "Cash", values: years.map((y) => f(y, "CASH")) },
        {
          key: "ppe",
          label: "Property and equipment (net)",
          values: years.map((y) => f(y, "NET_PPE")),
        },
        {
          key: "debt",
          label: "Long-term debt",
          values: years.map((y) => f(y, "TOT_LTDEBT")),
        },
        {
          key: "equity",
          label: "Equity (net assets)",
          values: years.map((y) => f(y, "EQUITY")),
        },
      ],
      reference: { value: 0, label: "Zero" },
    },
  ]
  const paragraphs: Paragraph[] = []
  const cr = calc(fin, "currentRatio")
  if (cr != null) {
    paragraphs.push(
      `It had ${formatUsd(cr, { cents: true })} of current assets for every dollar due within a year (a current ratio of ${cr.toFixed(2)})${cr < 1 ? ", so it owed more in the coming year than it held in assets that turn to cash within one" : ""}.`
    )
  }
  const equity = f(fin, "EQUITY") ?? 0
  const debt = f(fin, "TOT_LTDEBT") ?? 0
  const de = calc(fin, "debtToEquity")
  if (equity <= 0) {
    paragraphs.push(
      `Its equity was ${equity < 0 ? `negative (${money(equity)})` : "zero"}: its liabilities ${equity < 0 ? "exceeded" : "equaled"} its assets, so debt to equity isn't meaningful${debt > 0 ? `. It carried ${money(debt)} in long-term debt` : ""}.`
    )
  } else if (de != null) {
    paragraphs.push(
      debt > 0
        ? `It carried ${money(debt)} in long-term debt against ${money(equity)} in equity: ${formatUsd(de, { cents: true })} of debt for each dollar of net assets.`
        : `It reported no long-term debt, against ${money(equity)} in equity.`
    )
  }
  const assets = f(fin, "TOT_ASST")
  if (assets)
    paragraphs.push(
      `Total assets were ${money(assets)}${(f(fin, "NET_PPE") ?? 0) / assets >= 0.0005 ? `, ${pct(f(fin, "NET_PPE")! / assets)} of them in property and equipment after depreciation` : ""}.`
    )
  return {
    id: "position",
    title: SECTION_TITLES.position,
    period: fiscalPeriod([fin]),
    lead,
    paragraphs,
    figures,
  }
}

const JOB_CLASSES: { label: string; code: string }[] = [
  { label: "Registered nurses", code: "PRD_HR_RN" },
  { label: "Technical and specialist staff", code: "PRD_HR_TCH" },
  { label: "Aides and orderlies", code: "PRD_HR_AID" },
  { label: "Clerical and administrative staff", code: "PRD_HR_CLR" },
  { label: "Environmental and food service", code: "PRD_HR_ENV" },
  { label: "Managers and supervisors", code: "PRD_HR_MGT" },
  { label: "Licensed vocational nurses", code: "PRD_HR_LVN" },
  { label: "All other employees", code: "PRD_HR_OTH" },
]
const hasWorkforce = (y: ReportYear | undefined) => (f(y, "PROD_HRS") ?? 0) > 0 || (f(y, "HOSP_FTE") ?? 0) > 0

function workforce(c: Ctx): ReportSection | null {
  const { fin, finPrev, finYears } = c
  if (!fin || !hasWorkforce(fin)) return null
  const years = lastN(finYears.filter(hasWorkforce), 5)
  const fte = nz(fin, "HOSP_FTE")
  const lead = fte
    ? `It paid ${formatInt(Math.round(fte))} full-time-equivalent employees in ${fiscalYear(fin)}${nz(finPrev, "HOSP_FTE") ? `, ${change(f(finPrev, "HOSP_FTE"), fte, (v) => formatInt(Math.round(v)))}` : ""}.`
    : `Its employees worked ${formatInt(f(fin, "PROD_HRS")!)} hours in ${fiscalYear(fin)}.`
  const figures: Figure[] = [
    {
      id: "hours",
      kind: "stacked",
      title: "Hours worked: employees and contract staff",
      period: fiscalPeriod(years),
      format: { unit: "count" },
      categoryLabel: "Fiscal year",
      categories: years.map(fiscalShort),
      series: [
        {
          key: "employees",
          label: "Employee hours worked",
          values: years.map((y) => f(y, "PROD_HRS")),
        },
        {
          key: "contract",
          label: "Contract and registry hours",
          values: years.map((y) => total(y, ["CNT_HR_RN", "CNT_HR_OTH"])),
        },
      ],
      extraColumns: [
        {
          label: "Paid FTEs",
          format: COUNT,
          values: years.map((y) => nz(y, "HOSP_FTE")),
        },
      ],
    },
  ]
  const classes = JOB_CLASSES.map((j) => ({
    ...j,
    value: f(fin, j.code) ?? 0,
  })).filter((j) => j.value > 0)
  const worked = f(fin, "PROD_HRS") ?? 0
  if (classes.length >= 2) {
    figures.push({
      id: "job-classes",
      kind: "hbars",
      title: `Employee hours worked by job class, ${fiscalShort(fin)}`,
      period: fiscalPeriod([fin]),
      format: COUNT,
      categoryLabel: "Job class",
      categories: classes.map((j) => j.label),
      series: [
        {
          key: "hours",
          label: "Hours worked",
          values: classes.map((j) => j.value),
        },
      ],
      extraColumns: [
        {
          label: "Share",
          format: SHARE,
          values: classes.map((j) => (worked > 0 ? j.value / worked : null)),
        },
      ],
    })
  }
  const paragraphs: Paragraph[] = []
  const perFte = calc(fin, "laborCostPerFte")
  if (perFte != null)
    paragraphs.push(
      `Salaries and benefits came to ${money(perFte)} per paid FTE${calc(finPrev, "laborCostPerFte") != null ? `, ${change(calc(finPrev, "laborCostPerFte"), perFte, money)}` : ""}.`
    )
  const perBed = calc(fin, "ftesPerAdjOccupiedBed")
  if (perBed != null)
    paragraphs.push(
      `It employed ${perBed.toFixed(2)} FTEs for each adjusted occupied bed: each bed filled on an average day, with outpatient work counted in as extra beds by its share of charges.`
    )
  const share = calc(fin, "contractHoursShare")
  if (share === 0) paragraphs.push("It reported no contract or registry hours.")
  else if (share != null) {
    const rn = nz(fin, "CNT_HR_RN")
    paragraphs.push(
      `Contract and registry staff worked ${pct(share)} of all hours${calc(finPrev, "contractHoursShare") != null ? `, ${pointChange(calc(finPrev, "contractHoursShare"), share)} the year before` : ""}${rn ? `; ${formatInt(rn)} of those hours were registry or travel nurses` : ""}.`
    )
  }
  if (fin.meta.reports > 1)
    paragraphs.push("This year combines more than one report, so FTE-based figures aren't worked out: FTEs are added across the reports.")
  return {
    id: "workforce",
    title: SECTION_TITLES.workforce,
    period: fiscalPeriod([fin]),
    lead,
    paragraphs,
    figures,
  }
}

function inpatient(c: Ctx): ReportSection | null {
  const { data, fin, util, utilPrev } = c
  const dis = nz(util, "TOT_DISCHARGES")
  const payerDis = PAYERS.map((p) => PAYER_GROUPS[p].reduce((s, x) => s + (f(fin, `DIS_${x}`) ?? 0), 0))
  const payerDays = PAYERS.map((p) => PAYER_GROUPS[p].reduce((s, x) => s + (f(fin, `DAY_${x}`) ?? 0), 0))
  const disSum = payerDis.reduce((a, b) => a + b, 0)
  const daySum = payerDays.reduce((a, b) => a + b, 0)
  const beds = util ? (data.bedTypes[util.year] ?? []).filter((b) => b.occupancy != null) : []
  if (!dis && disSum <= 0 && !beds.length) return null
  const days = nz(util, "TOT_CEN_DAYS")
  const occ = measure(util, "occupancy")
  const lead =
    util && dis
      ? `In calendar ${util.year} it discharged ${formatInt(dis)} patients${days ? ` after ${formatInt(days)} patient days` : ""}${occ != null ? `; its licensed beds were ${occ.toFixed(1)}% occupied${measure(utilPrev, "occupancy") != null ? `, against ${measure(utilPrev, "occupancy")!.toFixed(1)}% the year before` : ""}` : ""}.`
      : `In ${fiscalYear(fin!)} it discharged ${formatInt(disSum)} patients after ${formatInt(daySum)} patient days.`
  const figures: Figure[] = []
  if (fin && disSum > 0 && daySum > 0) {
    const shown = PAYERS.filter((_, i) => payerDis[i] > 0 || payerDays[i] > 0)
    figures.push({
      id: "payer-volume",
      kind: "hbars",
      title: "Discharges and patient days, by payer",
      period: fiscalPeriod([fin]),
      format: SHARE,
      categoryLabel: "Payer",
      categories: shown.map((p) => PAYER_LABEL[p]),
      series: [
        {
          key: "discharges",
          label: "Share of discharges",
          values: shown.map((p) => payerDis[PAYERS.indexOf(p)] / disSum),
        },
        {
          key: "days",
          label: "Share of patient days",
          values: shown.map((p) => payerDays[PAYERS.indexOf(p)] / daySum),
        },
      ],
      extraColumns: [
        {
          label: "Discharges",
          format: COUNT,
          values: shown.map((p) => payerDis[PAYERS.indexOf(p)]),
        },
        {
          label: "Patient days",
          format: COUNT,
          values: shown.map((p) => payerDays[PAYERS.indexOf(p)]),
        },
      ],
      note: "From the financial report, so its fiscal year; the rest of this section is calendar-year utilization data.",
    })
  }
  if (util && beds.length) {
    figures.push({
      id: "bed-types",
      kind: "hbars",
      title: `Occupancy by bed type, ${util.year}`,
      period: CALENDAR_PERIOD,
      format: PCT,
      categoryLabel: "Bed type",
      categories: beds.map((b) => b.label),
      series: [
        {
          key: "occupancy",
          label: "Occupancy",
          values: beds.map((b) => b.occupancy),
        },
      ],
      extraColumns: [
        {
          label: "Licensed beds",
          format: COUNT,
          values: beds.map((b) => b.licensedBeds),
        },
        {
          label: "Average length of stay",
          format: { unit: "days", decimals: 1 },
          values: beds.map((b) => b.alos),
        },
        {
          label: "Discharges",
          format: COUNT,
          values: beds.map((b) => b.discharges),
        },
      ],
    })
  }
  const paragraphs: Paragraph[] = []
  const alos = measure(util, "alos")
  if (alos != null)
    paragraphs.push(
      `Patients in its general acute beds stayed ${alos.toFixed(1)} days on average${measure(utilPrev, "alos") != null ? `, against ${measure(utilPrev, "alos")!.toFixed(1)} the year before` : ""}.`
    )
  const longest = [...beds].filter((b) => b.alos != null && (b.discharges ?? 0) > 0).sort((a, b) => b.alos! - a.alos!)[0]
  if (longest && beds.length > 1) paragraphs.push(`Stays were longest in its ${lowerFirst(longest.label)} beds (${longest.alos!.toFixed(1)} days).`)
  const cmi = data.caseMix.at(-1)
  if (cmi) {
    const prev = data.caseMix.at(-2)
    paragraphs.push(
      `Its case mix index, HCAI's measure of how complex its inpatients' conditions were, was ${cmi.value.toFixed(2)} in federal fiscal year ${cmi.year}${prev ? ` (${prev.value.toFixed(2)} the year before)` : ""}; 1.00 is an average Medicare patient.`
    )
  }
  if (fin && daySum > 0) {
    const mcare = payerDays[0] / daySum
    if (mcare >= 0.0005) paragraphs.push(`Medicare patients accounted for ${pct(mcare)} of its patient days in ${fiscalYear(fin)}.`)
  }
  return {
    id: "inpatient",
    title: SECTION_TITLES.inpatient,
    period: util ? `${CALENDAR_PERIOD}, with payer figures from the financial report` : fiscalPeriod([fin!]),
    lead,
    paragraphs,
    figures,
  }
}

const ED_LEVELS: { key: string; label: string; code: string }[] = [
  { key: "l1", label: "Minor", code: "EMS_VISITS_NON_URGENT_TOT" },
  { key: "l2", label: "Low", code: "EMS_VISITS_URGENT_TOT" },
  { key: "l3", label: "Moderate", code: "EMS_VISITS_MODERATE_TOT" },
  { key: "l4", label: "Severe", code: "EMS_VISITS_SEVERE_TOT" },
  { key: "l5", label: "Critical", code: "EMS_VISITS_CRITICAL_TOT" },
]
const hasEd = (y: ReportYear | undefined) => (f(y, "ER_TRAFFIC_TOT") ?? 0) > 0

function ed(c: Ctx): ReportSection | null {
  const { util, utilPrev, utilYears } = c
  if (!util || !hasEd(util)) return null
  const years = lastN(utilYears.filter(hasEd), 5)
  const visits = f(util, "ER_TRAFFIC_TOT")!
  const lead = `Its emergency department had ${formatInt(visits)} visits in ${util.year}${hasEd(utilPrev) ? `, ${change(f(utilPrev, "ER_TRAFFIC_TOT"), visits, formatInt)}` : ""}.`
  const figures: Figure[] = []
  if (years.some((y) => ED_LEVELS.some((l) => (f(y, l.code) ?? 0) > 0))) {
    figures.push({
      id: "ed-severity",
      kind: "stacked",
      title: "Emergency visits by severity",
      period: CALENDAR_PERIOD,
      format: COUNT,
      categoryLabel: "Year",
      categories: years.map((y) => String(y.year)),
      series: ED_LEVELS.map((l) => ({
        key: l.key,
        label: l.label,
        values: years.map((y) => f(y, l.code)),
      })),
      note: "Severity is the level of the visit's evaluation and management code, from minor (level 1) to critical (level 5).",
    })
  }
  const paragraphs: Paragraph[] = []
  const admit = measure(util, "edAdmitRate")
  const lwbs = measure(util, "edLwbsRate")
  const bits = [
    admit != null && `${pct(admit)} of visits ended in an admission`,
    lwbs != null && (lwbs === 0 ? "no patient left without being seen" : `${pct(lwbs)} of patients left without being seen`),
  ].filter(Boolean) as string[]
  if (bits.length) paragraphs.push(`${bits[0].charAt(0).toUpperCase()}${bits[0].slice(1)}${bits[1] ? `, and ${bits[1]}` : ""}.`)
  const high = measure(util, "edHighAcuityShare")
  if (high != null) paragraphs.push(`Severe and critical visits made up ${pct(high)} of those treated and released.`)
  const perStation = measure(util, "edVisitsPerStation")
  const stations = nz(util, "EMER_MED_TREAT_STATIONS_ON_1231")
  if (perStation != null && stations)
    paragraphs.push(`With ${formatInt(stations)} treatment stations, it saw ${formatInt(Math.round(perStation))} visits per station.`)
  const diversion = measure(util, "diversionHours")
  if (diversion != null)
    paragraphs.push(
      diversion > 0 ? `Ambulances were diverted for ${formatInt(Math.round(diversion))} hours over the year.` : "It reported no ambulance diversion."
    )
  return {
    id: "ed",
    title: SECTION_TITLES.ed,
    period: CALENDAR_PERIOD,
    lead,
    paragraphs,
    figures,
  }
}

const hasSurgery = (y: ReportYear | undefined) => (f(y, "INPATIENT_SURG_OPER") ?? 0) + (f(y, "OUTPATIENT_SURG_OPER") ?? 0) > 0

function procedures(c: Ctx): ReportSection | null {
  const { fin, util, utilPrev, utilYears } = c
  const births = total(fin, ["NAT_BIRTHS", "C_SECTIONS"])
  const cath = nz(util, "CATHETERIZATION_PROC_TOT")
  const heart = (nz(util, "CARDIOVASCULAR_SURG_OPER_BYPASS_USED_TOT") ?? 0) + (nz(util, "CARDIOVASCULAR_SURG_OPER_BYPASS_NOT_USED_TOT") ?? 0)
  if (!hasSurgery(util) && births <= 0 && !cath && !heart) return null
  const paragraphs: Paragraph[] = []
  const figures: Figure[] = []
  let lead: string
  if (util && hasSurgery(util)) {
    const ip = f(util, "INPATIENT_SURG_OPER") ?? 0
    const op = f(util, "OUTPATIENT_SURG_OPER") ?? 0
    lead = `Its surgeons performed ${formatInt(ip + op)} operations in ${util.year} (${formatInt(ip)} inpatient, ${formatInt(op)} outpatient)${hasSurgery(utilPrev) ? `, ${change((f(utilPrev, "INPATIENT_SURG_OPER") ?? 0) + (f(utilPrev, "OUTPATIENT_SURG_OPER") ?? 0), ip + op, formatInt)}` : ""}.`
    const years = lastN(utilYears.filter(hasSurgery), 5)
    figures.push({
      id: "surgeries",
      kind: "bars",
      title: "Inpatient and outpatient surgeries",
      period: CALENDAR_PERIOD,
      format: COUNT,
      categoryLabel: "Year",
      categories: years.map((y) => String(y.year)),
      series: [
        {
          key: "ip",
          label: "Inpatient",
          values: years.map((y) => f(y, "INPATIENT_SURG_OPER")),
        },
        {
          key: "op",
          label: "Outpatient",
          values: years.map((y) => f(y, "OUTPATIENT_SURG_OPER")),
        },
      ],
      extraColumns: [
        {
          label: "Operating rooms",
          format: COUNT,
          values: years.map((y) => nz(y, "OPER_RM_TOT")),
        },
      ],
    })
    const rooms = nz(util, "OPER_RM_TOT")
    if (rooms) paragraphs.push(`It had ${formatInt(rooms)} operating room${rooms === 1 ? "" : "s"}.`)
  } else {
    lead = util ? `It reported no surgeries in ${util.year}.` : "It files no utilization report, so surgery counts aren't available."
  }
  if (fin && births > 0) {
    const cs = calc(fin, "cSectionShare")
    paragraphs.push(
      `It delivered ${formatInt(births)} babies in ${fiscalYear(fin)}${cs != null ? (cs === 0 ? ", none of them by C-section" : `, ${pct(cs)} of them by C-section`) : ""}. Births come from the financial report, because HCAI has masked them on the utilization report since 2022.`
    )
  }
  if (util && (cath || heart)) {
    const stents = nz(util, "PCI_WITH_STENT")
    const cabg = nz(util, "CORONARY_ARTERY_BYPASS_GRAFT_SURG")
    const surgery = cabg ? `${formatInt(cabg)} coronary bypass surgeries` : heart ? `${formatInt(heart)} open-heart surgeries` : null
    const lab = cath
      ? `${formatInt(cath)} cardiac catheterization procedures${stents ? ` (${formatInt(stents)} of them angioplasties with a stent)` : ""}`
      : null
    paragraphs.push(`In ${util.year} its cardiac program performed ${list([lab, surgery].filter(Boolean) as string[])}.`)
  }
  return {
    id: "procedures",
    title: SECTION_TITLES.procedures,
    period: CALENDAR_PERIOD + (births > 0 ? ", births from the financial report" : ""),
    lead,
    paragraphs,
    figures,
  }
}

function capital(c: Ctx): ReportSection | null {
  const { util, utilYears } = c
  const equip = nz(util, "EQUIP_VAL_TOT")
  const proj = nz(util, "PROJ_EXPENDITURES_TOT")
  if (!util || (!equip && !proj)) return null
  const parts = [
    equip && `${money(equip)} on major equipment (items over $500,000 each)`,
    proj && `${money(proj)} in projected spending on capital projects over $1 million`,
  ].filter(Boolean) as string[]
  const lead = `In ${util.year} it reported ${list(parts)}.`
  const paragraphs: Paragraph[] = []
  const history = utilYears.filter((y) => y.year < util.year && (nz(y, "EQUIP_VAL_TOT") || nz(y, "PROJ_EXPENDITURES_TOT")))
  if (history.length) {
    paragraphs.push(
      `Earlier years: ${history.map((y) => `${y.year}, ${list([nz(y, "EQUIP_VAL_TOT") && `${money(f(y, "EQUIP_VAL_TOT")!)} in equipment`, nz(y, "PROJ_EXPENDITURES_TOT") && `${money(f(y, "PROJ_EXPENDITURES_TOT")!)} in projects`].filter(Boolean) as string[])}`).join("; ")}.`
    )
  }
  paragraphs.push("HCAI lists what each item and project is; Padua keeps only the totals, so the descriptions are in the filing itself.")
  return {
    id: "capital",
    title: SECTION_TITLES.capital,
    period: CALENDAR_PERIOD,
    lead,
    paragraphs,
    figures: [],
  }
}

const SIR_LABEL: Record<string, string> = {
  clabsiSir: "Central line bloodstream infections",
  cdiSir: "C. diff infections",
  mrsaSir: "MRSA bloodstream infections",
}
const SIR_MID: Record<string, string> = {
  clabsiSir: "central line bloodstream infections",
  cdiSir: "C. diff infections",
  mrsaSir: "MRSA bloodstream infections",
}
/** A CMS or CDPH period for use in brackets: "Published Aug 2026" reads "Aug 2026 release". */
const periodText = (p: { year: number; detail: { period?: string } | null }) => {
  const period = p.detail?.period
  const release = period?.match(/^Published (.+)$/)
  return release ? `${release[1]} release` : (period ?? `${p.year}`)
}

function quality(c: Ctx): ReportSection | null {
  const { data, name } = c
  const m = Object.fromEntries(data.addendum.measures.map((x) => [x.id, x]))
  if (!data.addendum.measures.length) return null
  const paragraphs: Paragraph[] = []
  const figures: Figure[] = []
  const star = m.overallStar?.points.at(-1)
  const lead = star
    ? `CMS gave ${name} ${star.value} out of 5 stars in its overall hospital rating (${periodText(star)}).`
    : `CMS and CDPH publish quality measures for ${name}; the latest are below.`
  const readm = (m.readmHybrid ?? m.readmHospitalWide)?.points.at(-1)
  if (readm) {
    const cmp = readm.detail?.compared
    paragraphs.push(
      `${readm.value.toFixed(1)}% of its patients were readmitted to a hospital within 30 days (${periodText(readm)})${cmp ? `, which CMS rates ${cmp === "same" ? "no different from" : cmp === "better" ? "better than" : "worse than"} the national rate` : ""}.`
    )
  }
  const sirs = ["clabsiSir", "cdiSir", "mrsaSir"].map((id) => m[id]).filter(Boolean)
  const latest = Math.max(...sirs.map((s) => s.points.at(-1)!.year))
  const shown = sirs.filter((s) => s.points.at(-1)!.year === latest)
  if (shown.length) {
    const words = shown.map((s) => {
      const p = s.points.at(-1)!
      const cmp = p.detail?.compared
      return `${SIR_MID[s.id]} ${cmp === "better" ? "fewer than predicted" : cmp === "worse" ? "more than predicted" : "no different from predicted"} (ratio ${p.value.toFixed(2)})`
    })
    paragraphs.push(
      `In ${latest}, CDPH counted ${list(words)}. A ratio of 1.00 is the number predicted for a hospital of its size and type, from national data.`
    )
    figures.push({
      id: "infections",
      kind: "hbars",
      title: `Infection ratios, ${latest}`,
      period: "CDPH healthcare-associated infections · calendar year",
      format: { unit: "number", decimals: 2 },
      categoryLabel: "Infection",
      categories: shown.map((s) => SIR_LABEL[s.id]),
      series: [
        {
          key: "sir",
          label: "Observed ÷ predicted",
          values: shown.map((s) => s.points.at(-1)!.value),
        },
      ],
      reference: { value: 1, label: "Predicted" },
      extraColumns: [
        {
          label: "Observed",
          format: COUNT,
          values: shown.map((s) => s.points.at(-1)!.detail?.observed ?? null),
        },
        {
          label: "Predicted",
          format: { unit: "number", decimals: 1 },
          values: shown.map((s) => s.points.at(-1)!.detail?.predicted ?? null),
        },
      ],
      note: "Below 1.00 means fewer infections than predicted. CDPH's own test says whether the difference is meaningful; the text above gives its verdict.",
    })
  }
  if (data.addendum.sharedWith) paragraphs.push(`CMS reports this hospital together with ${data.addendum.sharedWith}, so its CMS figures cover both.`)
  return {
    id: "quality",
    title: SECTION_TITLES.quality,
    period: "CMS Care Compare and CDPH · not part of HCAI's report",
    lead,
    paragraphs,
    figures,
    addendum: true,
  }
}

/** Why a section a hospital doesn't file is left out, by HCAI's hospital type where that explains it. */
function omissionReason(id: SectionId, c: Ctx): string {
  const type = c.data.facility.hospitalType
  const financial = ["income", "revenue", "expenses", "position", "workforce"].includes(id)
  if (financial && !c.fin) return "It files no HCAI financial report."
  if (!financial && id !== "quality" && id !== "inpatient" && !c.util) return "It files no HCAI utilization report."
  if (financial) {
    if (type === "Kaiser" && id === "position") return "Kaiser Foundation Hospitals file their balance sheet by region, not by hospital."
    if (type === "PHF") return "County psychiatric health facilities file a reduced financial report without these pages."
    if (type === "State") return "State hospitals file a reduced financial report without these figures."
    return "Its financial report shows none of these figures."
  }
  if (id === "quality") return "CMS and CDPH publish no quality measures for it."
  if (id === "ed") return "It reported no emergency department visits."
  if (id === "procedures") return "It reported no surgeries, births or cardiac procedures."
  if (id === "capital") return "It reported no equipment over $500,000 and no projects over $1 million."
  return "Its filings report none of these figures."
}

function about(c: Ctx, omitted: { id: SectionId; title: string; reason: string }[]): ReportSection {
  const { data, fin, util } = c
  const src = data.sources.filter(
    (s) =>
      s.id === "hafd-selected" ||
      s.id === "hau" ||
      (s.id === "case-mix-index" && data.caseMix.length) ||
      ((s.id === "cms-care-compare" || s.id === "cdph-hai") && data.addendum.measures.length)
  )
  const periods = [
    fin &&
      `The financial report covers ${fiscalYear(fin)}${fin.meta.annualized ? ", scaled to a full year because the filing didn't cover one" : ""}${fin.meta.reports > 1 ? `, combining ${fin.meta.reports} filings` : ""}.`,
    util && `The utilization report covers calendar ${util.year}.`,
  ].filter(Boolean) as string[]
  return {
    id: "about",
    title: SECTION_TITLES.about,
    period: null,
    lead: `This report is built from ${c.name}'s own filings with HCAI, the state Department of Health Care Access and Information, and compares it with no other hospital.`,
    paragraphs: [
      ...periods,
      ...(data.addendum.measures.length ? ["The quality section is an addendum from CMS and CDPH, not part of HCAI's report."] : []),
      "Margins, collection rates, labor ratios and the other figures Padua works out are simple ratios of the amounts filed; nothing is estimated or compared with other hospitals.",
    ],
    figures: [],
    about: {
      sources: src.map((s) => ({
        label: s.label,
        href: s.sourcePage,
        detail: `${s.periodType}; ${s.years[0]}–${s.years.at(-1)}; processed ${s.processed}`,
      })),
      omitted: omitted.map((o) => ({ title: o.title, reason: o.reason })),
      calcs: CALCS.map((x) => ({
        label: x.label,
        formula: x.formula,
        summary: x.summary,
        caution: x.caution,
      })),
      gaps: [
        "The cash-flow statement (report page 9) and the inventory of services offered (page 2) are only in HCAI's Complete Data Set, which Padua doesn't yet read.",
        "Restricted funds, changes in equity, and the detail behind long-term debt and property and equipment: Padua has the year-end totals only.",
        "Other operating revenue by source, and salaries and hourly rates by job class: totals and hours only.",
        "Capital item and project descriptions, and the utilization report's yes-or-no service flags.",
        "Births on the utilization report, which HCAI has masked since 2022 (the financial report's count is used instead).",
      ],
      siera: SIERA_URL,
    },
  }
}

// -- the report --------------------------------------------------------------------------------------------------------

export function buildAnnualReport(data: AnnualReportData, name = data.facility.name): AnnualReport {
  const finYears = data.financial
  const utilYears = data.utilization
  const c: Ctx = {
    data,
    name,
    fin: finYears.at(-1),
    finPrev: finYears.at(-2),
    finYears,
    util: utilYears.at(-1),
    utilPrev: utilYears.at(-2),
    utilYears,
  }
  const built: [SectionId, ReportSection | null][] = [
    ["brief", brief(c)],
    ["profile", profile(c)],
    ["income", income(c)],
    ["revenue", revenue(c)],
    ["expenses", expenses(c)],
    ["position", position(c)],
    ["workforce", workforce(c)],
    ["inpatient", inpatient(c)],
    ["ed", ed(c)],
    ["procedures", procedures(c)],
    ["capital", capital(c)],
    ["quality", quality(c)],
  ]
  const omitted = built
    .filter(([, s]) => !s)
    .map(([id]) => ({
      id,
      title: SECTION_TITLES[id],
      reason: omissionReason(id, c),
    }))
  const sections = built.map(([, s]) => s).filter((s): s is ReportSection => !!s)
  sections.push(about(c, omitted))
  return { sections, omitted }
}
