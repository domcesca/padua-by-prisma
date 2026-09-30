"use client"

import { ArrowRight, CalendarClock } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"

import { DEADLINE_STATUS, KIND_LABEL } from "@/components/deadlines/deadlines-view"
import { deadlineRows, fyeOf, scheduleFor, useProgress } from "@/lib/deadlines/progress"
import { daysBetween, effectiveDue, formatDate, isoDate, today } from "@/lib/deadlines/rules"
import { useMounted } from "@/lib/use-mounted"
import { cn } from "@/lib/utils"

// Upcoming filings (V7.5.5: one line in Overview's top strip): the hospital's next HCAI filing from the Filing
// calendar, with the status it shows there (and the filed/extended progress the viewer marked there, from the same
// browser storage). Anything past due and not marked filed comes first, as in the calendar's own summary.

export function FilingBanner({
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
  const schedule = useMemo(
    () => (fye && now ? scheduleFor(fye, now) : []),
    // `now` only changes day to day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fye?.month, fye?.day, nowKey]
  )
  const rows = now ? deadlineRows(schedule, now, progress, facilityId) : []
  const open = rows.filter((r) => r.status !== "filed")
  const next = open.find((r) => r.status === "past") ?? open[0] ?? null
  const more = open.length - (next ? 1 : 0)

  let body: React.ReactNode
  if (!onCalendar || !fye) body = <span className="text-muted-foreground">No filing calendar: it hasn&apos;t filed a recent HCAI report.</span>
  else if (!now) body = <span className="text-muted-foreground">Working out due dates…</span>
  else if (!next) body = <span className="text-muted-foreground">Nothing to file in the next year: every report is marked filed.</span>
  else {
    const due = effectiveDue(next.d, next.p)
    const left = daysBetween(now, due)
    const s = DEADLINE_STATUS[next.status]
    const Icon = s.icon
    body = (
      <>
        <span className="font-medium">
          {next.status === "past" ? "Past due" : "Next due"}: {KIND_LABEL[next.d.kind](next.d)}, {formatDate(due, { month: "short", day: "numeric" })}
        </span>
        <span className={cn("inline-flex items-center gap-1 text-xs font-medium", s.className)}>
          <Icon className="size-3.5 shrink-0" aria-hidden />
          {s.label}
          <span className="font-normal text-muted-foreground">
            · {left === 0 ? "today" : left > 0 ? `in ${left} day${left === 1 ? "" : "s"}` : `${-left} day${left === -1 ? "" : "s"} ago`}
            {next.p?.extended && " (extended)"}
            {more > 0 && ` · ${more} more in the next year`}
          </span>
        </span>
      </>
    )
  }

  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5 text-[14px] sm:items-center" role="group" aria-label="Upcoming HCAI filings">
      <CalendarClock className="mt-0.5 size-4 shrink-0 text-primary sm:mt-0" aria-hidden />
      {/* Wide enough that, on a phone, the calendar link wraps under the text rather than squeezing it. */}
      <p className="flex min-w-0 flex-1 basis-[16rem] flex-wrap items-center gap-x-2 gap-y-0.5">{body}</p>
      {onCalendar && fye && (
        <Link
          href={`/filing-calendar?facility=${facilityId}`}
          className="ml-7 inline-flex items-center gap-1 rounded text-[13px] font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring sm:ml-0"
        >
          Filing calendar
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      )}
    </div>
  )
}
