"use client"

import { useSyncExternalStore } from "react"

// Saved business-case drafts (V7.6): a case in progress, kept in this browser's localStorage so it can be picked up
// later. No accounts and nothing on a server, like the rest of the app. A draft is the case's link (every input lives
// in it) plus enough to list it. Storage blocked: drafts last for the visit.

export type Draft = {
  id: string
  name: string
  facilityName: string | null
  method: string
  step: number
  /** The case's link query, which reproduces it exactly. */
  query: string
  updatedAt: number
}

const KEY = "padua-business-case-drafts-v1"
const MAX = 20

const listeners = new Set<() => void>()
let cachedRaw: string | null | undefined
let cached: Draft[] = []
let memory: Draft[] | null = null

const isDraft = (d: unknown): d is Draft =>
  !!d && typeof d === "object" && typeof (d as Draft).id === "string" && typeof (d as Draft).query === "string" && typeof (d as Draft).updatedAt === "number"

function read(): Draft[] {
  if (memory) return memory
  let raw: string | null
  try {
    raw = window.localStorage.getItem(KEY)
  } catch {
    return cached
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw
    try {
      const parsed = raw ? JSON.parse(raw) : []
      cached = Array.isArray(parsed) ? parsed.filter(isDraft).slice(0, MAX) : []
    } catch {
      cached = []
    }
  }
  return cached
}

function write(next: Draft[]) {
  const list = [...next].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX)
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list))
    memory = null
  } catch {
    memory = list
  }
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  // Another tab saved a draft.
  const onStorage = (e: StorageEvent) => e.key === KEY && l()
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(l)
    window.removeEventListener("storage", onStorage)
  }
}
const EMPTY: Draft[] = []

export const useDrafts = () => useSyncExternalStore(subscribe, read, () => EMPTY)

const newDraftId = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** Saves a draft (a new one when `id` is null) and returns its id and when it was saved. */
export function saveDraft(draft: Omit<Draft, "updatedAt" | "id"> & { id: string | null }) {
  const id = draft.id ?? newDraftId()
  const updatedAt = Date.now()
  write([{ ...draft, id, updatedAt }, ...read().filter((d) => d.id !== id)])
  return { id, updatedAt }
}

export function deleteDraft(id: string) {
  write(read().filter((d) => d.id !== id))
}

export const getDraft = (id: string) => read().find((d) => d.id === id) ?? null
