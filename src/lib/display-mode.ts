"use client"

import { useSyncExternalStore } from "react"

// Guided or Analysis: how much each screen shows at once. The same data and calculations either way; Guided shows
// fewer metrics and controls in plainer words, Analysis shows everything (the default, and what Padua showed before
// V7.1). Remembered in this browser only.

export type DisplayMode = "guided" | "analysis"

const KEY = "padua-display-mode-v1"
const listeners = new Set<() => void>()
let memory: DisplayMode | null = null

function read(): DisplayMode {
  try {
    const v = window.localStorage.getItem(KEY)
    if (v === "guided" || v === "analysis") return v
  } catch {
    // Storage blocked: fall back to what was chosen this visit.
  }
  return memory ?? "analysis"
}

export function setDisplayMode(mode: DisplayMode) {
  memory = mode
  try {
    window.localStorage.setItem(KEY, mode)
  } catch {
    // Kept in memory for this visit.
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

/** The viewer's mode; "analysis" on the server and before hydration, so the first paint matches today's pages. */
export function useDisplayMode(): DisplayMode {
  return useSyncExternalStore(subscribe, read, () => "analysis")
}
