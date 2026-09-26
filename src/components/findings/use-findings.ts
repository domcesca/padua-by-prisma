"use client"

import { useEffect, useRef, useState } from "react"

import type { FindingsResult } from "@/lib/findings/compute"

// A hospital's key findings from /api/findings, refetched when the hospital or peer group changes. `initial` is the
// server-rendered result for the first query, so the page doesn't fetch what it already has.

export function useFindings(facilityId: string | null, peerQuery: string, initial: FindingsResult | null = null) {
  const key = facilityId ? `${facilityId}?${peerQuery}` : null
  const initialKey = useRef(initial ? key : null)
  const [state, setState] = useState<{ key: string | null; data: FindingsResult | null; error: string | null }>({
    key: initial ? key : null,
    data: initial,
    error: null,
  })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!key || (key === initialKey.current && attempt === 0)) return
    initialKey.current = null
    const controller = new AbortController()
    const params = new URLSearchParams(peerQuery)
    params.set("facility", facilityId!)
    fetch(`/api/findings?${params}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? res.statusText)
        return (await res.json()) as FindingsResult
      })
      .then((data) => setState({ key, data, error: null }))
      .catch((e: Error) => {
        if (e.name !== "AbortError") setState({ key, data: null, error: e.message || "Couldn't load key findings." })
      })
    return () => controller.abort()
  }, [key, facilityId, peerQuery, attempt])

  const current = state.key === key
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: !!key && !current,
    /** The last result while a new one loads (kept on screen, dimmed). */
    stale: !current ? state.data : null,
    retry: () => {
      setState((s) => ({ ...s, key: null }))
      setAttempt((a) => a + 1)
    },
  }
}
