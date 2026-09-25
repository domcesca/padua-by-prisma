"use client"

import { AlertCircle, CalendarDays, CheckCircle2, Clock } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState, useSyncExternalStore } from "react"

import { FacilityPicker, type FacilityOption } from "@/components/benchmark/facility-picker"
import { FilterPill } from "@/components/benchmark/filter-pill"
import {
  addDays,
  buildSchedule,
  daysBetween,
  effectiveDue,
  formatDate,
  isoDate,
  RULES,
  statusOf,
  today,
  utcDate,
  type Deadline,
  type DeadlineStatus,
  type FiscalYearEnd,
  type Progress,
} from "@/lib/deadlines/rules"
import { useMounted } from "@/lib/use-mounted"
import { cn } from "@/lib/utils"

export type DeadlineFacility = FacilityOption & { fiscalYearEnd: string | null }

const MONTHS = Array.from({ length: 12 }, (_, m) => formatDate(utcDate(2001, m, 1), { month: "long" }))

// -- local progress (per-viewer convenience; never required for the page to work) --

const STORAGE_KEY = "hcai-deadlines-progress-v1"
const listeners = new Set<() => void>()
let cachedRaw: string | null | undefined
let cachedValue: Record<string, Progress> = {}

function readProgress(): Record<string, Progress> {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    raw = null
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw
    try {
      cachedValue = raw ? JSON.parse(raw) : {}
    } catch {
      cachedValue = {}
    }
  }
  return cachedValue
}

function writeProgress(next: Record<string, Progress>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Storage unavailable (private mode etc.): keep it in memory for this session.
    cachedRaw = JSON.stringify(next)
    cachedValue = next
  }
  listeners.forEach((l) => l())
}

const EMPTY: Record<string, Progress> = {}
function useProgress() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    readProgress,
    () => EMPTY
  )
}

// -------------------------------------------------------------------------------

function fyeFromFacility(f: DeadlineFacility | undefined): FiscalYearEnd | null {
  if (!f?.fiscalYearEnd) return null
  const [, m, d] = f.fiscalYearEnd.split("-").map(Number)
  return { month: m - 1, day: d }
}

export function DeadlinesView({
  facilities,
  initialFacilityId,
  latestYear,
}: {
  facilities: DeadlineFacility[]
  initialFacilityId: string | null
  latestYear: number
}) {
  const router = useRouter()
  const mounted = useMounted()
  const [facilityId, setFacilityId] = useState(initialFacilityId)
  const facility = facilities.find((f) => f.id === facilityId)
  const [manualFye, setManualFye] = useState<FiscalYearEnd>({ month: 11 })
  const [offCycle, setOffCycle] = useState("")
  const progress = useProgress()

  const fye = fyeFromFacility(facility) ?? manualFye
  const now = mounted ? today() : null

  const schedule = useMemo(() => {
    const base = now ?? utcDate(2026, 0, 1)
    const off = /^\d{4}-\d{2}-\d{2}$/.test(offCycle) ? new Date(`${offCycle}T00:00:00Z`) : null
    return buildSchedule({ fye, from: addDays(base, -150), to: addDays(base, 400), offCycleEnd: off })
    // `now` only changes day to day; stringify to keep the memo stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fye.month, fye.day, offCycle, now && isoDate(now)])

  const scope = facility ? facility.id : `fye-${fye.month}`
  const keyOf = (d: Deadline) => `${scope}:${d.id}`
  const setProgress = (d: Deadline, patch: Progress) =>
    writeProgress({ ...readProgress(), [keyOf(d)]: { ...readProgress()[keyOf(d)], ...patch } })

  // Show recent past deadlines (up to 45 days beyond their latest possible date) so
  // late or extended filings stay visible; older ones drop off.
  const rows = now
    ? schedule
        .filter((d) => daysBetween(now, d.extendedDue) >= -45)
        .map((d) => ({ d, p: progress[keyOf(d)], status: statusOf(d, now, progress[keyOf(d)]) }))
    : []

  const past = rows.filter((r) => r.status === "past")
  const soon = rows.filter((r) => r.status === "soon")
  const next = rows.find((r) => r.status === "soon" || r.status === "upcoming")

  function pickFacility(id: string | null) {
    setFacilityId(id)
    router.replace(id ? `/deadlines?facility=${id}` : "/deadlines", { scroll: false })
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
        <div className="flex items-center gap-2">
          <FacilityPicker facilities={facilities} value={facilityId} onChange={pickFacility} latestYear={latestYear} />
          {facilityId && (
            <button
              type="button"
              onClick={() => pickFacility(null)}
              className="h-11 shrink-0 rounded-xl px-3 text-[13px] text-muted-foreground hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Clear
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {facility ? (
            <p className="text-[13px] text-muted-foreground">
              Fiscal year ends{" "}
              <span className="font-medium text-foreground">
                {formatDate(utcDate(2001, fye.month, fye.day ?? 31), { month: "long", day: "numeric" })}
              </span>{" "}
              (from its latest HCAI report)
            </p>
          ) : (
            <FilterPill
              label="Fiscal year end"
              summary={`FY ends ${MONTHS[manualFye.month]}`}
              active={false}
              options={MONTHS.map((m, i) => ({ value: String(i), label: `End of ${m}` }))}
              selected={[String(manualFye.month)]}
              onChange={([v]) => setManualFye({ month: Number(v) })}
            />
          )}
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile
          label="Past due date, not marked filed"
          value={now ? String(past.length) : "—"}
          tone={past.length ? "warning" : undefined}
        />
        <SummaryTile label={`Due in the next 30 days`} value={now ? String(soon.length) : "—"} />
        <SummaryTile
          label="Next deadline"
          value={next ? formatDate(effectiveDue(next.d, next.p), { month: "short", day: "numeric" }) : "—"}
          detail={next ? (next.d.kind === "quarterly" ? next.d.periodLabel.split(" · ")[0] + " quarterly" : "Annual disclosure") : undefined}
        />
      </div>

      {/* Timeline */}
      <section aria-labelledby="deadline-list" className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2 px-1">
          <h2 id="deadline-list" className="text-[13px] font-semibold tracking-tight">
            Filing calendar
          </h2>
          <p className="text-xs text-muted-foreground">Progress you mark is saved in this browser only.</p>
        </div>
        {!now ? (
          <div className="h-96 animate-pulse rounded-2xl bg-card shadow-card" />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-card shadow-card">
            {rows.map(({ d, p, status }) => (
              <DeadlineRow key={d.id} d={d} p={p} status={status} now={now} onChange={(patch) => setProgress(d, patch)} />
            ))}
          </ul>
        )}
      </section>

      {/* Off-cycle modeling */}
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <h2 className="text-[15px] font-semibold tracking-tight">Closing, relocating, or changing owners?</h2>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          Under 22 CCR §97040(b), a report period also ends on the last day of patient care before a closure or
          relocation, the last day of licensure before a change of licensee, or the day a license goes into suspense.
          That triggers an extra annual report due four months later — often earlier than teams expect.
        </p>
        <label className="mt-4 flex flex-wrap items-center gap-3 text-[13px]">
          <span className="text-muted-foreground">Add a report period ending on</span>
          <input
            type="date"
            value={offCycle}
            onChange={(e) => setOffCycle(e.target.value)}
            className="h-9 rounded-lg bg-muted px-2.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {offCycle && (
            <button type="button" onClick={() => setOffCycle("")} className="text-primary hover:underline">
              Remove
            </button>
          )}
        </label>
      </section>
    </div>
  )
}

const STATUS: Record<DeadlineStatus, { label: string; icon: typeof Clock; className: string }> = {
  past: { label: "Due date passed", icon: AlertCircle, className: "text-warning" },
  soon: { label: "Due soon", icon: Clock, className: "text-warning" },
  upcoming: { label: "Upcoming", icon: CalendarDays, className: "text-muted-foreground" },
  filed: { label: "Filed", icon: CheckCircle2, className: "text-positive" },
}

function DeadlineRow({
  d,
  p,
  status,
  now,
  onChange,
}: {
  d: Deadline
  p: Progress | undefined
  status: DeadlineStatus
  now: Date
  onChange: (patch: Progress) => void
}) {
  const due = effectiveDue(d, p)
  const left = daysBetween(now, due)
  const s = STATUS[status]
  const Icon = s.icon

  return (
    <li className={cn("grid gap-4 px-4 py-4 sm:grid-cols-[4.5rem_1fr_auto] sm:items-center sm:px-5", status === "filed" && "opacity-60")}>
      <div className="flex items-baseline gap-2 sm:block sm:text-center">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {formatDate(due, { month: "short" })}
        </p>
        <p className="num text-2xl leading-none font-semibold tracking-tight">{formatDate(due, { day: "numeric" })}</p>
        <p className="num text-[11px] text-tertiary-foreground">{due.getUTCFullYear()}</p>
      </div>

      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <p className="text-[15px] font-medium">{d.title}</p>
          <span className={cn("inline-flex items-center gap-1 text-xs font-medium", s.className)}>
            <Icon className="size-3.5" aria-hidden />
            {s.label}
            {status !== "filed" && (
              <span className="font-normal text-muted-foreground">
                {" "}
                · {left === 0 ? "today" : left > 0 ? `in ${left} day${left === 1 ? "" : "s"}` : `${-left} day${left === -1 ? "" : "s"} ago`}
              </span>
            )}
          </span>
        </div>
        <p className="text-[13px] text-muted-foreground">{d.periodLabel}</p>
        <p className="text-xs leading-relaxed text-tertiary-foreground">
          {p?.extended
            ? `Extended from ${formatDate(d.due)} (up to ${d.extensionDays} days).`
            : `With all extensions: ${formatDate(d.extendedDue)} (up to ${d.extensionDays} days, requested in SIERA).`}
          {d.note && ` ${d.note}`}
          {status === "past" &&
            ` If this hasn’t been filed, HCAI can assess $${RULES.penaltyPerDay}/day after the (extended) due date. Mark it filed to clear this.`}
        </p>
      </div>

      <div className="flex items-center gap-4 sm:flex-col sm:items-end sm:gap-1.5">
        <Check label="Filed" checked={!!p?.filed} onChange={(filed) => onChange({ filed })} />
        {status !== "filed" && (
          <Check label="Extension granted" checked={!!p?.extended} onChange={(extended) => onChange({ extended })} />
        )}
      </div>
    </li>
  )
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-muted-foreground select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded accent-(--primary)"
      />
      {label}
    </label>
  )
}

function SummaryTile({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: string
  detail?: string
  tone?: "warning"
}) {
  return (
    <div className="rounded-2xl bg-card px-5 py-4 shadow-card">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className="num mt-1 flex items-center gap-2 text-[28px] leading-tight font-semibold tracking-tight">
        {tone === "warning" && <AlertCircle className="size-5 text-warning" aria-label="Needs attention" />}
        {value}
      </p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </div>
  )
}
