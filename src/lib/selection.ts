"use client"

import { useSyncExternalStore } from "react"

import type { MetricCategory } from "@/lib/data/types"

// The hospital and category the viewer is working with, remembered in this
// browser so moving between tabs (or coming back later) keeps the context.
// Per-viewer convenience only: every view still works from its URL alone.

export type Selection = { facilityId: string | null; category: MetricCategory }

const KEY = "hcai-selection-v1"
const EMPTY: Selection = { facilityId: null, category: "financial" }
const listeners = new Set<() => void>()

let cachedRaw: string | null | undefined
let cached: Selection = EMPTY

function read(): Selection {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(KEY)
  } catch {
    // Private mode / blocked storage: behave as if nothing was saved.
  }
  if (raw === cachedRaw) return cached
  cachedRaw = raw
  try {
    const parsed = raw ? (JSON.parse(raw) as Partial<Selection>) : {}
    cached = {
      facilityId: typeof parsed.facilityId === "string" ? parsed.facilityId : null,
      category: parsed.category === "utilization" || parsed.category === "quality" ? parsed.category : "financial",
    }
  } catch {
    cached = EMPTY
  }
  return cached
}

export function rememberSelection(patch: Partial<Selection>) {
  const next = { ...read(), ...patch }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    return
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => e.key === KEY && listener()
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

/** The remembered selection, or null during server render / before hydration. */
export function useSelection(): Selection | null {
  return useSyncExternalStore(subscribe, read, () => null)
}

/** A tab's link, carrying the remembered hospital and category. */
export function hrefWithSelection(href: string, selection: Selection | null) {
  if (!selection?.facilityId) {
    if (href === "/translate" && selection?.category === "utilization") return "/translate?source=utilization"
    if (href === "/benchmark" && selection && selection.category !== "financial") return `/benchmark?view=${selection.category}`
    return href
  }
  const params = new URLSearchParams({ facility: selection.facilityId })
  switch (href) {
    case "/benchmark":
      if (selection.category !== "financial") params.set("view", selection.category)
      break
    case "/translate":
      params.set("source", selection.category === "utilization" ? "utilization" : "financial")
      break
    case "/build":
      if (selection.category !== "financial") params.set("category", selection.category)
      break
    case "/deadlines":
    case "/propose":
      break
    default:
      return href
  }
  return `${href}?${params}`
}
