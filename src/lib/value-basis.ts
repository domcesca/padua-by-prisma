"use client"

import { useSyncExternalStore } from "react"

// Percent or Actual on Compare's ratio cards (V7.4.5), per metric, remembered for this browser session only
// (sessionStorage): a new session starts on Percent again. Storage blocked: remembered in memory for the visit.

export type ValueBasis = "percent" | "actual"

const KEY = "padua-value-basis-v1"
const listeners = new Set<() => void>()
let memory: Record<string, ValueBasis> = {}
let cachedRaw: string | null | undefined
let cached: Record<string, ValueBasis> = {}

function read(): Record<string, ValueBasis> {
  let raw: string | null
  try {
    raw = window.sessionStorage.getItem(KEY)
  } catch {
    return memory
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw
    try {
      const parsed = raw ? JSON.parse(raw) : {}
      cached = parsed && typeof parsed === "object" ? parsed : {}
    } catch {
      cached = {}
    }
  }
  return cached
}

export function setValueBasis(metricId: string, basis: ValueBasis) {
  const next = { ...read(), [metricId]: basis }
  memory = next
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Kept in memory for this visit.
  }
  listeners.forEach((l) => l())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The basis chosen for a metric this session; Percent on the server and before hydration. */
export function useValueBasis(metricId: string): ValueBasis {
  return useSyncExternalStore(subscribe, () => read()[metricId] ?? "percent", () => "percent")
}
