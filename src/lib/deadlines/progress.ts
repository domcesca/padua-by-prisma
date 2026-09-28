"use client"

import { useSyncExternalStore } from "react"

import { addDays, buildSchedule, daysBetween, statusOf, type Deadline, type DeadlineStatus, type FiscalYearEnd, type Progress } from "./rules"

// The Filing calendar's schedule as the viewer sees it: which reports are shown and the filed/extended progress they
// marked (saved in this browser only). Shared by the Filing calendar and the Overview's Upcoming filings, so both
// read the same rows the same way.

const STORAGE_KEY = "hcai-deadlines-progress-v1"
const listeners = new Set<() => void>()
let cachedRaw: string | null | undefined
let cachedValue: Record<string, Progress> = {}

export function readProgress(): Record<string, Progress> {
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

export function writeProgress(next: Record<string, Progress>) {
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
export function useProgress() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    readProgress,
    () => EMPTY
  )
}

/** A hospital's fiscal year end from its directory record ("2024-06-30"), or null. */
export function fyeOf(fiscalYearEnd: string | null | undefined): FiscalYearEnd | null {
  if (!fiscalYearEnd) return null
  const [, m, d] = fiscalYearEnd.split("-").map(Number)
  return { month: m - 1, day: d }
}

export type DeadlineRow = { d: Deadline; p: Progress | undefined; status: DeadlineStatus }

/** The reports around today (from 150 days back to 400 ahead) for a fiscal year end. */
export function scheduleFor(fye: FiscalYearEnd, now: Date, offCycleEnd: Date | null = null) {
  return buildSchedule({ fye, from: addDays(now, -150), to: addDays(now, 400), offCycleEnd })
}

/**
 * The rows the Filing calendar lists: recent past deadlines stay (up to 45 days beyond their latest possible date) so
 * late or extended filings stay visible; older ones drop off. `scope` keys the progress: the hospital's id, or
 * `fye-<month>` with no hospital.
 */
export function deadlineRows(schedule: Deadline[], now: Date, progress: Record<string, Progress>, scope: string): DeadlineRow[] {
  return schedule
    .filter((d) => daysBetween(now, d.extendedDue) >= -45)
    .map((d) => ({ d, p: progress[`${scope}:${d.id}`], status: statusOf(d, now, progress[`${scope}:${d.id}`]) }))
}
