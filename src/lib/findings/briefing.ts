"use client"

import { useSyncExternalStore } from "react"

import type { ConfidenceLevel, Finding } from "./score"

// Pinned findings for the briefing page (/briefing), remembered in this browser only: no accounts, nothing sent
// anywhere (the same pattern as Deadlines' filed/unfiled progress). Each pin keeps a snapshot of the finding as it
// stood when pinned, so the briefing can say whether it still qualifies and whether its score moved.

const KEY = "padua-briefing-v1"
/** Most pins kept; the oldest drop off past this. */
export const MAX_PINS = 30

export type PinSnapshot = {
  label: string
  /** The finding's headline: its lead metric or penalty. */
  lead: string
  /** "Higher than 8% of 7 peers", "Penalty ~$175K a year", … */
  headline: string
  score: number
  level: ConfidenceLevel
  tier: "primary" | "secondary"
  through: string | null
  peerGroup: string
}

export type Pin = {
  /** facilityId:family — the finding's stable id. */
  id: string
  facilityId: string
  facilityName: string
  family: string
  /** The peer group it was pinned against (Benchmark's peer filters), so the briefing re-checks it like for like. */
  peerQuery: string
  pinnedAt: string
  snapshot: PinSnapshot
}

const listeners = new Set<() => void>()
let cachedRaw: string | null | undefined
let cached: Pin[] = []
const EMPTY: Pin[] = []

function read(): Pin[] {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(KEY)
  } catch {
    // Private mode / blocked storage: behave as if nothing was pinned (or keep what's in memory).
    return cached
  }
  if (raw === cachedRaw) return cached
  cachedRaw = raw
  try {
    const parsed = raw ? JSON.parse(raw) : []
    cached = Array.isArray(parsed)
      ? parsed
          .filter((p): p is Pin => typeof p?.id === "string" && typeof p?.facilityId === "string" && !!p?.snapshot)
          .map((p) => ({ ...p, peerQuery: typeof p.peerQuery === "string" ? p.peerQuery : "" }))
      : []
  } catch {
    cached = []
  }
  return cached
}

function write(next: Pin[]) {
  cached = next
  try {
    cachedRaw = JSON.stringify(next)
    window.localStorage.setItem(KEY, cachedRaw)
  } catch {
    // Storage unavailable: keep the pins in memory for this visit.
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

export function usePins(): Pin[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY)
}

/** Who's viewing a finding: the hospital and the peer group it was ranked against (for pins). */
export type FindingContext = { facilityName: string; peerGroup: string; peerQuery: string }

export function snapshotOf(finding: Finding, tier: "primary" | "secondary", peerGroup: string, headline: string): PinSnapshot {
  return {
    label: finding.label,
    lead: finding.lead.label,
    headline,
    score: finding.score,
    level: finding.level,
    tier,
    through: finding.lead.status.through,
    peerGroup,
  }
}

export function pin(entry: Omit<Pin, "pinnedAt">) {
  const rest = read().filter((p) => p.id !== entry.id)
  write([{ ...entry, pinnedAt: new Date().toISOString() }, ...rest].slice(0, MAX_PINS))
}

export function unpin(id: string) {
  write(read().filter((p) => p.id !== id))
}

export function unpinHospital(facilityId: string) {
  write(read().filter((p) => p.facilityId !== facilityId))
}
