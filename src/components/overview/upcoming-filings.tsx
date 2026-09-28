"use client"

import { CalendarClock } from "lucide-react"
import { useMemo } from "react"

import { DEADLINE_STATUS, KIND_LABEL } from "@/components/deadlines/deadlines-view"
import { deadlineRows, fyeOf, scheduleFor, useProgress } from "@/lib/deadlines/progress"
import { daysBetween, effectiveDue, formatDate, isoDate, today } from "@/lib/deadlines/rules"
import { useMounted } from "@/lib/use-mounted"
import { cn } from "@/lib/utils"
import { OverviewSection, SectionEmpty, SectionLoading } from "./section"

// Upcoming filings: the next few rows of the hospital's Filing calendar, with the status it shows there (and the
// filed/extended progress the viewer marked there, from the same browser storage). Anything past due and not marked
// filed comes first, as it does in the calendar's own summary.

const SHOWN = 3

export function UpcomingFilings({
  facilityId,
  fiscalYearEnd,
  onCalendar,
}: {
  facilityId: string
  /** From the hospital's latest HCAI report; null when it has none. */
  fiscalYearEnd: string | null
  /** Whether the Filing calendar lists this hospital (still reporting to HCAI). */
  onCalendar: boolean
}) {
  const mounted = useMounted()
  const progress = useProgress()
  const now = mounted ? today() : null
  const fye = fyeOf(fiscalYearEnd)
  const nowKey = now && isoDate(now)
  const schedule = useMemo(() => (fye && now ? scheduleFor(fye, now) : []),
    // `now` only changes day to day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fye?.month, fye?.day, nowKey])
  const rows = now ? deadlineRows(schedule, now, progress, facilityId) : []
  const open = rows.filter((r) => r.status !== "filed")
  const pastDue = open.filter((r) => r.status === "past")
  const dueSoon = open.filter((r) => r.status === "soon")
  const shown = [...pastDue, ...open.filter((r) => r.status !== "past")].slice(0, SHOWN)
  const href = `/filing-calendar?facility=${facilityId}`

  return (
    <OverviewSection
      id="upcoming-filings"
      icon={CalendarClock}
      title="Upcoming filings"
      description="HCAI financial and utilization reports, from the Filing calendar."
      link={onCalendar && fye ? { href, label: "Filing calendar" } : null}
    >
      {!onCalendar || !fye ? (
        <SectionEmpty title="No filing calendar for this hospital">
          It hasn&apos;t filed a recent HCAI report, so there&apos;s no fiscal year to build its due dates from. The Filing
          calendar can still show dates for any fiscal year end.
        </SectionEmpty>
      ) : !now ? (
        <SectionLoading label="Working out due dates…" rows={SHOWN} />
      ) : (
        <>
          {!pastDue.length && !dueSoon.length && (
            <p className="text-[13px] text-muted-foreground" role="status">
              Nothing due in the next 30 days. Next up:
            </p>
          )}
          {shown.length === 0 ? (
            <SectionEmpty title="Nothing to file in the next year">Every report in the calendar is marked filed.</SectionEmpty>
          ) : (
            <ul className="divide-y divide-border">
              {shown.map(({ d, p, status }) => {
                const due = effectiveDue(d, p)
                const left = daysBetween(now, due)
                const s = DEADLINE_STATUS[status]
                const Icon = s.icon
                return (
                  <li key={d.id} className="flex items-start gap-3 py-2.5 first:pt-0.5 last:pb-0.5">
                    <div className="w-11 shrink-0 text-center">
                      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{formatDate(due, { month: "short" })}</p>
                      <p className="num text-lg leading-none font-semibold">{formatDate(due, { day: "numeric" })}</p>
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-[14px] leading-snug font-medium">{KIND_LABEL[d.kind](d)}</p>
                      <p className={cn("inline-flex flex-wrap items-center gap-1 text-xs font-medium", s.className)}>
                        <Icon className="size-3.5 shrink-0" aria-hidden />
                        {s.label}
                        <span className="font-normal text-muted-foreground">
                          · {left === 0 ? "today" : left > 0 ? `in ${left} day${left === 1 ? "" : "s"}` : `${-left} day${left === -1 ? "" : "s"} ago`}
                          {p?.extended && " (extended)"}
                        </span>
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="text-xs text-tertiary-foreground">
            Marked filed or extended in this browser only. SIERA has the official dates.
          </p>
        </>
      )}
    </OverviewSection>
  )
}
