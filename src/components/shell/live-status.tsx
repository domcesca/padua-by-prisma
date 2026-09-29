"use client"

import { useEffect, useState } from "react"

/**
 * A polite screen-reader announcement that stays mounted, so changes to its text are read out: what's loading, then
 * what came back ("Showing 4 metrics for Cedars-Sinai Medical Center against 22 peers").
 */
export function LiveStatus({ message }: { message: string }) {
  return (
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </p>
  )
}

// One app-wide polite region for brief confirmations that don't belong to a page's own status (a pin saved or
// removed): announce() from anywhere, and the Announcer mounted once in the layout reads it out.
const ANNOUNCE_EVENT = "padua:announce"

export function announce(message: string) {
  window.dispatchEvent(new CustomEvent(ANNOUNCE_EVENT, { detail: message }))
}

export function Announcer() {
  const [message, setMessage] = useState("")
  useEffect(() => {
    let clear: ReturnType<typeof setTimeout> | undefined
    const on = (e: Event) => {
      // Clear first so the same message twice in a row is still read.
      setMessage("")
      clearTimeout(clear)
      clear = setTimeout(() => setMessage((e as CustomEvent<string>).detail), 60)
    }
    window.addEventListener(ANNOUNCE_EVENT, on)
    return () => {
      window.removeEventListener(ANNOUNCE_EVENT, on)
      clearTimeout(clear)
    }
  }, [])
  return <LiveStatus message={message} />
}
