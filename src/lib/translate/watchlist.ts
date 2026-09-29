"use client"

import { useSyncExternalStore } from "react"

import type { HcaiDatasetId } from "@/lib/data/types"

// Data definitions' two browser-local lists (V7.5): the fields and measures a viewer pinned to their watchlist, and
// their recent searches. Both live in this browser's localStorage only; storage blocked, they last for the visit.

function localList(key: string, max: number) {
  const listeners = new Set<() => void>()
  let cachedRaw: string | null | undefined
  let cached: string[] = []
  let memory: string[] | null = null

  function read(): string[] {
    if (memory) return memory
    let raw: string | null
    try {
      raw = window.localStorage.getItem(key)
    } catch {
      return cached
    }
    if (raw !== cachedRaw) {
      cachedRaw = raw
      try {
        const parsed = raw ? JSON.parse(raw) : []
        cached = Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string").slice(0, max) : []
      } catch {
        cached = []
      }
    }
    return cached
  }

  function write(next: string[]) {
    const list = next.slice(0, max)
    try {
      window.localStorage.setItem(key, JSON.stringify(list))
      memory = null
    } catch {
      memory = list
    }
    listeners.forEach((l) => l())
  }

  const subscribe = (l: () => void) => {
    listeners.add(l)
    return () => listeners.delete(l)
  }
  const EMPTY: string[] = []
  const use = () => useSyncExternalStore(subscribe, read, () => EMPTY)
  return { read, write, use }
}

// Entries are "<dataset>:<field code or metric id>", so one list covers both sources.
const watch = localList("padua-definitions-watch-v1", 60)
const recent = localList("padua-definitions-recent-v1", 6)

export const watchKey = (dataset: HcaiDatasetId, id: string) => `${dataset}:${id}`

export function useWatchlist(dataset: HcaiDatasetId): string[] {
  const all = watch.use()
  const prefix = `${dataset}:`
  return all.filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length))
}

export function toggleWatch(dataset: HcaiDatasetId, id: string) {
  const key = watchKey(dataset, id)
  const list = watch.read()
  watch.write(list.includes(key) ? list.filter((k) => k !== key) : [key, ...list])
}

/** Recent searches, newest first (the same across both sources). */
export const useRecentSearches = recent.use

export function rememberSearch(query: string) {
  const q = query.trim()
  if (q.length < 2) return
  recent.write([q, ...recent.read().filter((r) => r.toLowerCase() !== q.toLowerCase())])
}

export function clearRecentSearches() {
  recent.write([])
}
