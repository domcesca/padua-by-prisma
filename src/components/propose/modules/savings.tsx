"use client"

import { PiggyBank, Plus, RotateCcw, Trash2 } from "lucide-react"

import { formatInt, formatUsd } from "@/lib/format"
import { defineModule, type BenefitLine, type Driver, type ModuleEditorProps } from "@/lib/propose/module"
import { MAX_LONG_TERM_CARE_SHARE, type SavingsData } from "@/lib/propose/savings"
import { Toggle } from "../advanced-panel"
import { NumberField } from "../number-field"
import { SourceTag } from "../source-tag"

// Staffing changes, workflow redesign, supply standardization: a guided version of Custom with
// three kinds of saving. Staff time and supplies are the proposer's numbers; the cost of a
// patient day starts from the hospital's HCAI financials (operating expense ÷ adjusted patient
// days) and can be overwritten. Advanced mode can break staff time down by role (each with its own hours and hourly
// cost), summed into the same staff-time saving; outside Advanced, or with it switched off, the single pair is used.

type State = {
  /** Staff hours saved a week, and what an hour costs with benefits. */
  hours: number
  wage: number
  /** Patient days avoided a year, and the cost of one (null: use the hospital's HCAI figure). */
  days: number
  dayCost: number | null
  /** A flat amount a year: supplies and anything else. */
  other: number
  otherLabel: string
  /** Advanced: staff time by role instead of the single hours × cost pair. */
  byRole: boolean
  roles: Role[]
}

type Role = { name: string; hours: number; wage: number }

const WEEKS = 52
const MAX_ROLES = 12

const initial = (): State => ({ hours: 0, wage: 0, days: 0, dayCost: null, other: 0, otherLabel: "", byRole: false, roles: [] })

/** "RN~12~65|Tech~5~40": name, hours a week, cost of an hour. "~" and "|" are kept out of names. */
const cleanName = (name: string) => name.replace(/[~|]/g, " ").slice(0, 40)
const encodeRoles = (roles: Role[]) =>
  roles
    .filter((r) => r.name.trim() || r.hours || r.wage)
    .map((r) => `${cleanName(r.name).trim()}~${r.hours}~${r.wage}`)
    .join("|")
function decodeRoles(raw: string | null): Role[] {
  const n = (v: string | undefined, max: number) => {
    const x = Number(v)
    return v != null && v.trim() !== "" && Number.isFinite(x) ? Math.min(max, Math.max(0, x)) : 0
  }
  return (raw ?? "")
    .split("|")
    .filter(Boolean)
    .slice(0, MAX_ROLES)
    .map((part) => {
      const [name, hours, wage] = part.split("~")
      return { name: cleanName(name ?? ""), hours: n(hours, 1e6), wage: n(wage, 1e5) }
    })
}

/** Roles apply only in Advanced mode with the breakdown switched on. */
const usesRoles = (s: State, advanced: boolean) => advanced && s.byRole
const roleLabel = (r: Role, i: number) => r.name.trim() || `Role ${i + 1}`

function toParams(s: State): Record<string, string> {
  const out: Record<string, string> = {}
  if (s.hours) out.hours = String(s.hours)
  if (s.wage) out.wage = String(s.wage)
  if (s.days) out.beddays = String(s.days)
  if (s.dayCost != null) out.daycost = String(s.dayCost)
  if (s.other) out.other = String(s.other)
  if (s.otherLabel.trim()) out.otherfor = s.otherLabel.trim()
  if (s.byRole) out.byrole = "1"
  if (encodeRoles(s.roles)) out.roles = encodeRoles(s.roles)
  return out
}

function fromParams(params: URLSearchParams): State {
  const n = (key: string, max: number) => {
    const raw = params.get(key)
    const v = Number(raw)
    return raw != null && raw.trim() !== "" && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : null
  }
  return {
    hours: n("hours", 1e6) ?? 0,
    wage: n("wage", 1e5) ?? 0,
    days: n("beddays", 1e7) ?? 0,
    dayCost: n("daycost", 1e6),
    other: n("other", 1e10) ?? 0,
    otherLabel: (params.get("otherfor") ?? "").slice(0, 80),
    byRole: params.get("byrole") === "1",
    roles: decodeRoles(params.get("roles")),
  }
}

/** The hospital's HCAI cost per patient day, when it's fit to pre-fill. */
const usable = (data: SavingsData | null) =>
  data?.costPerDay && data.costPerDay.longTermCareShare <= MAX_LONG_TERM_CARE_SHARE ? data.costPerDay : null

/** The cost of a patient day in use, and whether it's the hospital's HCAI figure. */
function dayCostOf(s: State, data: SavingsData | null) {
  if (s.dayCost != null) return { value: s.dayCost, fromData: false }
  const cpd = usable(data)
  return { value: cpd?.value ?? 0, fromData: !!cpd }
}

function amounts(s: State, data: SavingsData | null, advanced: boolean) {
  const day = dayCostOf(s, data)
  const labor = usesRoles(s, advanced) ? s.roles.reduce((t, r) => t + r.hours * r.wage * WEEKS, 0) : s.hours * s.wage * WEEKS
  return { day, labor, stay: s.days * day.value, other: s.other }
}

/** How staff time was worked out, for the line detail. */
function laborDetail(s: State, advanced: boolean) {
  if (!usesRoles(s, advanced)) return `${formatInt(s.hours)} hours a week × ${formatUsd(s.wage)} × ${WEEKS}`
  const used = s.roles.filter((r) => r.hours && r.wage)
  return `By role: ${used.map((r) => `${roleLabel(r, s.roles.indexOf(r))} ${formatInt(r.hours)} h × ${formatUsd(r.wage)}`).join("; ")} (a week, × ${WEEKS})`
}

function Editor({ state, onChange, data, context }: ModuleEditorProps<State, SavingsData>) {
  const set = (patch: Partial<State>) => onChange({ ...state, ...patch })
  const a = amounts(state, data, context.advanced)
  const byRole = usesRoles(state, context.advanced)
  const cpd = data?.costPerDay
  const prefill = usable(data)
  const total = a.labor + a.stay + a.other

  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        For staffing changes, workflow redesign, or supply standardization. Fill in any of the three; they add up to
        the yearly saving.
      </p>

      <Block
        title="Staff time"
        tag={<SourceTag kind="assumption" />}
        amount={a.labor}
        detail={byRole ? `${state.roles.length} ${state.roles.length === 1 ? "role" : "roles"} × ${WEEKS} weeks` : `${formatInt(state.hours)} hours × ${formatUsd(state.wage)} × ${WEEKS} weeks`}
        header={
          context.advanced && (
            <Toggle
              label="Break down by role"
              checked={state.byRole}
              onChange={(on) =>
                // First time on: start the list from the single pair, so nothing entered is lost.
                set({ byRole: on, roles: on && !state.roles.length ? [{ name: "", hours: state.hours, wage: state.wage }] : state.roles })
              }
            />
          )
        }
      >
        {byRole ? (
          <RoleList roles={state.roles} onChange={(roles) => set({ roles })} />
        ) : (
          <>
            <NumberField label="Hours saved a week" value={state.hours} onChange={(hours) => set({ hours })} max={1e6} decimals={1} className="w-40" />
            <NumberField
              label="Cost of an hour"
              prefix="$"
              value={state.wage}
              onChange={(wage) => set({ wage })}
              max={1e5}
              decimals={2}
              className="w-44"
              hint="Loaded: pay plus benefits and taxes."
            />
          </>
        )}
      </Block>

      <Block
        title="Shorter stays"
        tag={a.day.fromData ? <SourceTag kind="data">HCAI {prefill!.year}</SourceTag> : <SourceTag kind="assumption" />}
        amount={a.stay}
        detail={`${formatInt(state.days)} patient days × ${formatUsd(a.day.value)}`}
        note={
          <>
            {cpd ? (
              <>
                {context.facilityName ?? "This hospital"}’s {cpd.year} average: {formatUsd(cpd.value)} a patient day (operating expense{" "}
                {formatUsd(cpd.operatingExpense, { compact: true })} ÷ {formatInt(cpd.adjustedPatientDays)} adjusted patient days).
                {data?.peers && ` Peer median ${formatUsd(data.peers.median)} (${data.peers.count} peers).`}{" "}
                {!prefill &&
                  `${Math.round(cpd.longTermCareShare * 100)}% of its patient days are in long-term care units (skilled nursing, sub-acute), which pulls that average well below the cost of an acute day, so it isn’t filled in: enter your own. `}
              </>
            ) : context.facilityId ? (
              data && "HCAI has no complete financial report for this hospital, so enter your own cost per patient day. "
            ) : (
              "Pick a hospital to start from its HCAI cost per patient day, or enter your own. "
            )}
            <span className="font-medium text-foreground">
              That’s the average, fully loaded cost. A day taken off a stay usually saves less, since buildings and most
              staff cost the same, unless the freed bed goes to another patient.
            </span>
          </>
        }
      >
        <NumberField label="Patient days avoided a year" value={state.days} onChange={(days) => set({ days })} max={1e7} decimals={1} className="w-48" />
        <div className="flex items-end gap-1.5">
          <NumberField
            label="Cost of a patient day"
            prefix="$"
            value={a.day.value}
            onChange={(dayCost) => set({ dayCost })}
            max={1e6}
            className="w-44"
          />
          {state.dayCost != null && prefill && (
            <button
              type="button"
              onClick={() => set({ dayCost: null })}
              className="mb-1 inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium text-primary hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <RotateCcw className="size-3" /> Use HCAI {prefill.year}
            </button>
          )}
        </div>
      </Block>

      <Block title="Supplies and other" tag={<SourceTag kind="assumption" />} amount={a.other} detail="Flat amount a year">
        <div className="min-w-0 flex-1 basis-56">
          <label htmlFor="savings-other-label" className="mb-1 block text-[13px] font-medium">
            What it is <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            id="savings-other-label"
            value={state.otherLabel}
            onChange={(e) => set({ otherLabel: e.target.value.slice(0, 80) })}
            placeholder="e.g. Standardized surgical supplies"
            className="glass-subtle h-10 w-full rounded-lg px-3 text-[14px] outline-none placeholder:text-tertiary-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <NumberField label="Saved a year" prefix="$" value={state.other} onChange={(other) => set({ other })} className="w-44" />
      </Block>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-3 text-right">
        <div>
          <p className="text-xs text-muted-foreground">Savings a year</p>
          <p className="num text-[20px] font-semibold tracking-tight">{formatUsd(total)}</p>
        </div>
      </div>
    </div>
  )
}

/** Advanced: staff time by role, summed into the one staff-time saving. */
function RoleList({ roles, onChange }: { roles: Role[]; onChange: (roles: Role[]) => void }) {
  const set = (i: number, patch: Partial<Role>) => onChange(roles.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  return (
    <div className="w-full space-y-2">
      {roles.map((r, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2.5 border-b border-border/60 pb-2">
          <div className="min-w-0 flex-1 basis-40">
            <label htmlFor={`savings-role-${i}`} className="mb-1 block text-[13px] font-medium">
              Role
            </label>
            <input
              id={`savings-role-${i}`}
              value={r.name}
              onChange={(e) => set(i, { name: cleanName(e.target.value) })}
              placeholder="e.g. RN, unit clerk"
              className="glass-subtle h-10 w-full rounded-lg px-3 text-[14px] outline-none placeholder:text-tertiary-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <NumberField label="Hours saved a week" value={r.hours} onChange={(hours) => set(i, { hours })} max={1e6} decimals={1} className="w-36" />
          <NumberField label="Cost of an hour" prefix="$" value={r.wage} onChange={(wage) => set(i, { wage })} max={1e5} decimals={2} className="w-36" />
          <p className="num mb-2.5 ml-auto text-[13px] text-muted-foreground">{formatUsd(r.hours * r.wage * WEEKS)} a year</p>
          <button
            type="button"
            onClick={() => onChange(roles.filter((_, j) => j !== i))}
            aria-label={`Remove ${roleLabel(r, i)}`}
            className="mb-1 flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onChange([...roles, { name: "", hours: 0, wage: 0 }])}
          disabled={roles.length >= MAX_ROLES}
          className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium text-primary hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40"
        >
          <Plus className="size-3.5" /> Add a role
        </button>
        <p className="text-xs text-muted-foreground">Loaded hourly cost: pay plus benefits and taxes.</p>
      </div>
    </div>
  )
}

function Block({
  title,
  tag,
  amount,
  detail,
  note,
  header,
  children,
}: {
  title: string
  tag: React.ReactNode
  amount: number
  detail: string
  note?: React.ReactNode
  /** Controls under the title, e.g. Advanced mode's switch. */
  header?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="surface space-y-2.5 rounded-xl p-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
          {title} {tag}
        </h3>
        <div className="text-right">
          <p className="num text-[14px] font-medium">{formatUsd(amount)}</p>
          {amount !== 0 && <p className="num text-xs text-muted-foreground">{detail}</p>}
        </div>
      </div>
      {header}
      <div className="flex flex-wrap items-end gap-2.5">{children}</div>
      {note && <p className="text-xs leading-relaxed text-muted-foreground">{note}</p>}
    </section>
  )
}

export const savingsModule = defineModule<State, SavingsData>({
  id: "savings",
  label: "Cost savings",
  advancedExtras: ["staff time by role"],
  volume: {
    label: "Savings volume (hours, days, supplies)",
    scale: (s, k) => ({ ...s, hours: s.hours * k, days: s.days * k, other: s.other * k, roles: s.roles.map((r) => ({ ...r, hours: r.hours * k })) }),
    describe: (s, data, k) => ({
      value: `${Math.round(k * 100)}% of the savings entered`,
      detail: [
        (s.byRole ? s.roles.some((r) => r.hours) : s.hours) && `${formatInt((s.byRole ? s.roles.reduce((t, r) => t + r.hours, 0) : s.hours) * k)} staff hours a week`,
        s.days && `${formatInt(s.days * k)} patient days a year`,
        s.other && `${formatUsd(s.other * k)} supplies and other`,
      ]
        .filter(Boolean)
        .join(", "),
    }),
  },
  drivers: (s, data, { advanced }) => {
    const roles = usesRoles(s, advanced)
    const out: Driver<State>[] = []
    if (roles ? s.roles.some((r) => r.hours && r.wage) : s.hours && s.wage) {
      out.push({ id: "hours", label: "Staff hours saved", apply: (st, f) => ({ ...st, hours: st.hours * f, roles: st.roles.map((r) => ({ ...r, hours: r.hours * f })) }) })
      out.push({ id: "wage", label: "Cost of an hour", apply: (st, f) => ({ ...st, wage: st.wage * f, roles: st.roles.map((r) => ({ ...r, wage: r.wage * f })) }) })
    }
    const day = dayCostOf(s, data).value
    if (s.days && day) {
      out.push({ id: "days", label: "Patient days avoided", apply: (st, f) => ({ ...st, days: st.days * f }) })
      out.push({ id: "daycost", label: "Cost of a patient day", apply: (st, f) => ({ ...st, dayCost: day * f }) })
    }
    if (s.other) out.push({ id: "other", label: s.otherLabel.trim() || "Supplies and other", apply: (st, f) => ({ ...st, other: st.other * f }) })
    return out
  },
  summary: "Staff time, shorter stays, and supplies saved a year.",
  icon: PiggyBank,
  hasData: true,
  initial,
  toParams,
  fromParams,
  benefit: (s, data, { advanced }) => {
    const a = amounts(s, data, advanced)
    const lines: BenefitLine[] = []
    if (a.labor) lines.push({ label: usesRoles(s, advanced) ? "Staff time (by role)" : "Staff time", detail: laborDetail(s, advanced), amount: a.labor })
    if (a.stay)
      lines.push({
        label: "Shorter stays",
        detail: `${formatInt(s.days)} patient days × ${formatUsd(a.day.value)}${a.day.fromData ? ` (HCAI ${data!.costPerDay!.year} average)` : ""}`,
        amount: a.stay,
      })
    if (a.other) lines.push({ label: s.otherLabel.trim() || "Supplies and other", detail: "Flat amount a year", amount: a.other })

    const notes: string[] = []
    if (a.labor)
      notes.push(
        `Staff time counts as a saving only if it cuts paid hours (overtime, agency, open positions) or replaces work that would otherwise be paid for. ${usesRoles(s, advanced) ? "Advanced: broken down by role; each role’s hours and hourly cost are" : "Hours and hourly cost are"} the proposer’s assumptions.`
      )
    if (a.stay)
      notes.push(
        a.day.fromData
          ? `Cost per patient day is the hospital’s ${data!.costPerDay!.year} average from its HCAI annual financial report (operating expense ÷ adjusted patient days): a fully loaded average, so a day taken off a stay usually saves less unless the bed is filled again. Days avoided are the proposer’s assumption.`
          : "Patient days avoided and the cost of a patient day are the proposer’s assumptions."
      )
    if (a.other) notes.push("Supplies and other savings are the proposer’s assumption.")

    const total = a.labor + a.stay + a.other
    return {
      annual: total,
      lines,
      notes,
      incomplete:
        s.days && !a.day.value
          ? !data && s.dayCost == null
            ? "Loading the hospital’s cost per patient day…"
            : "Enter the cost of a patient day."
          : total
            ? undefined
            : "Enter at least one saving.",
    }
  },
  Editor,
})
