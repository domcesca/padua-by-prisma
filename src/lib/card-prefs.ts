"use client"

import { useSyncExternalStore } from "react"

// A Compare card's switches, per measure, remembered for this browser session only (sessionStorage): Percent or
// Actual (V7.4.5) and Chart or Table (V7.4.6). Both behave the same way: a choice sticks while you move between
// topics, hospitals and tabs, and a new session starts from the defaults (Percent, Chart). Storage blocked: remembered
// in memory for the visit.

function sessionChoice<T extends string>(key: string, options: readonly T[], fallback: T) {
  const listeners = new Set<() => void>()
  let memory: Record<string, T> = {}
  let cachedRaw: string | null | undefined
  let cached: Record<string, T> = {}

  function read(): Record<string, T> {
    let raw: string | null
    try {
      raw = window.sessionStorage.getItem(key)
    } catch {
      return memory
    }
    if (raw !== cachedRaw) {
      cachedRaw = raw
      try {
        const parsed = raw ? JSON.parse(raw) : {}
        cached = Object.fromEntries(
          Object.entries(parsed && typeof parsed === "object" ? parsed : {}).filter((e): e is [string, T] => options.includes(e[1] as T))
        )
      } catch {
        cached = {}
      }
    }
    return cached
  }

  function set(id: string, value: T) {
    const next = { ...read(), [id]: value }
    memory = next
    try {
      window.sessionStorage.setItem(key, JSON.stringify(next))
    } catch {
      // Kept in memory for this visit.
    }
    listeners.forEach((l) => l())
  }

  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  /** The choice for this measure this session; the default on the server and before hydration. */
  function use(id: string): T {
    return useSyncExternalStore(subscribe, () => read()[id] ?? fallback, () => fallback)
  }

  return { set, use }
}

export type ValueBasis = "percent" | "actual"
export type CardView = "chart" | "table"

const basis = sessionChoice<ValueBasis>("padua-value-basis-v1", ["percent", "actual"], "percent")
const view = sessionChoice<CardView>("padua-card-view-v1", ["chart", "table"], "chart")

export const setValueBasis = basis.set
export const useValueBasis = basis.use
export const setCardView = view.set
export const useCardView = view.use
