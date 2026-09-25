"use client"

import { X } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { useMediaQuery } from "@/lib/use-media-query"
import { cn } from "@/lib/utils"

// A short first-visit orientation on the home page: it spotlights each step of the flow in turn.
// It plays once (remembered in this browser only) and can be replayed from the help panel.
// Each step points at an element marked data-tour="<target>"; a step whose target isn't on
// screen is skipped.

const STEPS = [
  {
    target: "hospital",
    title: "Start with your hospital",
    body: "Search by name, city, or county. Your choice follows you to the other tabs.",
  },
  {
    target: "topic",
    title: "Then choose what to look at",
    body: "Financials, utilization, or quality. Utilization can also be narrowed to a single unit, such as the ICU.",
  },
  {
    target: "compare",
    title: "Compare with similar hospitals",
    body: "This opens Benchmark: your hospital next to peers matched on county, size, and ownership. You can fine-tune the peers there.",
  },
  {
    target: "nav-correlate",
    title: "See how two measures relate",
    body: "Correlate plots any two measures across the peer group. For example, are costs high, or are patients just sicker?",
  },
  {
    target: "help",
    title: "Look up any term",
    body: "Open this, or press ?, to search every metric and HCAI field definition. You can replay this tour from here too.",
  },
]

const DONE_KEY = "hcai-tour-v1"
const PENDING_KEY = "hcai-tour-pending"
const START_EVENT = "hcai:start-tour"
const PAD = 6
const CARD_WIDTH = 320

function read(storage: () => Storage, key: string) {
  try {
    return storage().getItem(key)
  } catch {
    return null
  }
}
function write(storage: () => Storage, key: string, value: string | null) {
  try {
    if (value == null) storage().removeItem(key)
    else storage().setItem(key, value)
  } catch {
    // Storage blocked (private mode): the tour may play again next visit, which is harmless.
  }
}

/** Replay the tour: on the home page right away, anywhere else after going home. */
export function useStartTour() {
  const pathname = usePathname()
  const router = useRouter()
  return () => {
    if (pathname === "/") window.dispatchEvent(new Event(START_EVENT))
    else {
      write(() => sessionStorage, PENDING_KEY, "1")
      router.push("/")
    }
  }
}

function visibleTarget(name: string) {
  return [...document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)].find((el) => el.getClientRects().length > 0) ?? null
}

/** Skipping, closing, and finishing all count: the tour doesn't play again on its own. */
function markDone() {
  write(() => localStorage, DONE_KEY, "done")
}

export function Tour() {
  const pathname = usePathname()
  const [step, setStep] = useState<number | null>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const card = useRef<HTMLDivElement>(null)
  const active = useRef(false)
  const wide = useMediaQuery("(min-width: 768px)")

  // Start on the home page: on the first visit, or when replay was asked for from another page.
  useEffect(() => {
    if (pathname !== "/") return
    const start = () => setStep(0)
    window.addEventListener(START_EVENT, start)
    let timer: ReturnType<typeof setTimeout> | undefined
    if (read(() => sessionStorage, PENDING_KEY) || !read(() => localStorage, DONE_KEY)) {
      write(() => sessionStorage, PENDING_KEY, null)
      timer = setTimeout(start, 500)
    }
    return () => {
      window.removeEventListener(START_EVENT, start)
      clearTimeout(timer)
      // Leaving the home page ends the tour; it doesn't come back uninvited.
      if (active.current) write(() => localStorage, DONE_KEY, "done")
      setStep(null)
    }
  }, [pathname])

  useEffect(() => {
    active.current = step != null
  }, [step])

  // Bring the step's target into view and keep the spotlight on it.
  useEffect(() => {
    if (step == null) return
    const el = visibleTarget(STEPS[step].target)
    if (!el) {
      const frame = requestAnimationFrame(() => {
        if (step + 1 >= STEPS.length) markDone()
        setStep(step + 1 < STEPS.length ? step + 1 : null)
      })
      return () => cancelAnimationFrame(frame)
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    // A target taller than most of the screen (the topic cards on a phone) is shown from its top.
    const tall = el.offsetHeight > window.innerHeight * 0.6
    el.scrollIntoView({ block: tall ? "start" : "center", behavior: reduce ? "auto" : "smooth" })
    const measure = () => setRect(el.getBoundingClientRect())
    const frame = requestAnimationFrame(measure)
    window.addEventListener("scroll", measure, true)
    window.addEventListener("resize", measure)
    card.current?.focus({ preventScroll: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("scroll", measure, true)
      window.removeEventListener("resize", measure)
    }
  }, [step])

  useEffect(() => {
    if (step == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      markDone()
      setStep(null)
      setRect(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [step])

  if (step == null) return null
  const end = () => {
    markDone()
    setStep(null)
    setRect(null)
  }
  const current = STEPS[step]
  const last = step === STEPS.length - 1

  // Desktop: the card sits beside the target (below, else above). Phones: docked to whichever
  // edge the target isn't near.
  let cardStyle: React.CSSProperties = {}
  if (rect) {
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (wide) {
      const left = Math.min(Math.max(16, rect.left), vw - CARD_WIDTH - 16)
      cardStyle =
        vh - rect.bottom > 230
          ? { top: rect.bottom + PAD + 12, left }
          : { bottom: vh - rect.top + PAD + 12, left }
    } else {
      const nearBottom = rect.height < vh * 0.5 && rect.top + rect.height / 2 > vh / 2
      cardStyle = nearBottom ? { top: 64, left: 16, right: 16 } : { bottom: 88, left: 16, right: 16 }
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* Dimmed page with a cutout around the target; clicks outside the card do nothing. */}
      {rect ? (
        <div
          aria-hidden
          className="ring-accent pointer-events-none fixed rounded-2xl transition-all duration-300 ease-out motion-reduce:transition-none"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.45), 0 0 24px 4px color-mix(in oklab, var(--primary) 35%, transparent)",
          }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 bg-black/45" />
      )}
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        className={cn(
          "glass-strong fixed rounded-2xl p-4 shadow-xl outline-none",
          rect ? "fade-up" : "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
          wide && "w-80"
        )}
        style={cardStyle}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-medium tracking-wide text-tertiary-foreground uppercase">
            Quick tour · {step + 1} of {STEPS.length}
          </p>
          <button
            type="button"
            onClick={end}
            aria-label="Close tour"
            className="-mt-1 -mr-1 flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <X className="size-4" />
          </button>
        </div>
        <p id="tour-title" className="mt-1 text-[17px] font-semibold tracking-tight">
          {current.title}
        </p>
        <p id="tour-body" className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          {current.body}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          {last ? (
            <span />
          ) : (
            <button
              type="button"
              onClick={end}
              className="text-[13px] font-medium text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Skip tour
            </button>
          )}
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="glass-subtle h-8 rounded-full px-3.5 text-[13px] font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? end() : setStep(step + 1))}
              autoFocus
              className="btn-accent h-8 rounded-full px-4 text-[13px] font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              {last ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
