"use client"

import { X } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { useMediaQuery } from "@/lib/use-media-query"
import { cn } from "@/lib/utils"

// Guided tours: a spotlight on one element at a time with a short card beside it. Three tours share this engine:
//   * welcome: a first-visit orientation on the home page (the nav, the hospital picker, and where help lives). It plays
//     once (remembered in this browser only) and can be replayed from the glossary.
//   * propose, correlate: step-by-step walkthroughs, started from those tabs' "About this tool" panels, never on their
//     own; they're the tools where a misread has consequences.
// Each step points at an element marked data-tour="<target>"; a step whose target isn't on screen is skipped.

type Step = { target: string; title: string; body: string }
export type TourId = "welcome" | "propose" | "correlate"

const TOURS: Record<TourId, { label: string; steps: Step[] }> = {
  welcome: {
    label: "Quick tour",
    steps: [
      {
        target: "nav",
        title: "Every tool is here",
        body: "Benchmark compares a hospital with its peers, Build makes charts and correlations, Propose builds a business case, and Translate explains HCAI's fields.",
      },
      {
        target: "hospital",
        title: "Start with your hospital",
        body: "Search by name, city, or county. Your choice follows you to the other tabs.",
      },
      {
        target: "about",
        title: "Help on every tab",
        body: "Each tab has an About this tool button with a quick explanation, and the ? in the corner looks up any term. You can replay this tour from there.",
      },
    ],
  },
  propose: {
    label: "Propose walkthrough",
    steps: [
      {
        target: "propose-method",
        title: "1. Say what you're proposing",
        body: "Describe it and Padua suggests how to estimate the benefit, or pick a method yourself. Each method counts something different: new revenue, savings, or avoided penalties.",
      },
      {
        target: "propose-benefit",
        title: "2. Enter the benefit",
        body: "Tags mark what comes from public data and what's your assumption. The estimate is only as good as those assumptions, so be ready to defend them.",
      },
      {
        target: "propose-costs",
        title: "3. Enter the costs",
        body: "Up-front costs (equipment, implementation) are paid at the start; running costs every year of the useful life.",
      },
      {
        target: "propose-scenarios",
        title: "4. Read the three scenarios",
        body: "Each scenario scales the benefit (70%, 100%, 130% by default) while costs stay the same. Payback is when cumulative cash turns positive; ROI and NPV cover the whole useful life. If only the optimistic case pays back, that's the real story.",
      },
      {
        target: "propose-chart",
        title: "5. See when it pays back",
        body: "Each line is a scenario's cumulative cash. Where a line crosses zero is its payback; a line that never crosses doesn't pay back within the useful life.",
      },
      {
        target: "propose-notes",
        title: "6. Read the fine print",
        body: "These notes say what the estimate leaves out: most use national Medicare rates, not your contracts, and count revenue rather than margin unless you set a cost of care. Share them with the numbers.",
      },
      {
        target: "propose-print",
        title: "7. Share it",
        body: "Choose Board summary or Finance committee, then print or save a PDF. The whole proposal lives in the link, so Copy link saves it too.",
      },
    ],
  },
  correlate: {
    label: "Correlate walkthrough",
    steps: [
      {
        target: "correlate-hospital",
        title: "1. Pick a hospital",
        body: "It's highlighted on the chart, and its similar hospitals become the other dots.",
      },
      {
        target: "correlate-measures",
        title: "2. Choose two measures",
        body: "One runs across, one up. The arrows swap them; that doesn't change the correlation, only the picture.",
      },
      {
        target: "correlate-peers",
        title: "3. Choose the group",
        body: "Similar hospitals or all of California. More hospitals give a steadier answer; a handful can show a pattern by chance.",
      },
      {
        target: "correlate-r",
        title: "4. Read r carefully",
        body: "r runs from −1 to 1: near 0 means no straight-line pattern, and the sign says whether they rise together or move opposite. It measures strength, not certainty; heed the small-sample warning when it shows.",
      },
      {
        target: "correlate-chart",
        title: "5. Look at the dots",
        body: "One dot per hospital. A dot or two far from the rest can create or hide a pattern; if r and the rank correlation (ρ) disagree, outliers are driving r.",
      },
      {
        target: "correlate-notes",
        title: "6. Together is not because",
        body: "Hospitals differ in size, services, and patients all at once, so two measures can move together without one causing the other. Use it to ask better questions, not to settle them.",
      },
    ],
  },
}

const DONE_KEY = "hcai-tour-v1"
const PENDING_KEY = "hcai-tour-pending"
const START_EVENT = "hcai:start-tour"
const WALKTHROUGH_EVENT = "padua:walkthrough"
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

/** Start a tab's walkthrough (Propose, Correlate) on the current page. */
export function startWalkthrough(id: Exclude<TourId, "welcome">) {
  window.dispatchEvent(new CustomEvent(WALKTHROUGH_EVENT, { detail: id }))
}

/** Replay the welcome tour: on the home page right away, anywhere else after going home. */
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

/** Skipping, closing, and finishing the welcome tour all count: it doesn't play again on its own. */
function markDone(id: TourId) {
  if (id === "welcome") write(() => localStorage, DONE_KEY, "done")
}

export function Tour() {
  const pathname = usePathname()
  const [tourId, setTourId] = useState<TourId>("welcome")
  const [step, setStep] = useState<number | null>(null)
  const STEPS = TOURS[tourId].steps
  const [rect, setRect] = useState<DOMRect | null>(null)
  const card = useRef<HTMLDivElement>(null)
  const active = useRef<TourId | null>(null)
  const wide = useMediaQuery("(min-width: 768px)")

  // Walkthroughs start when asked for, on whatever page asked; leaving the page ends them.
  useEffect(() => {
    const start = (e: Event) => {
      const id = (e as CustomEvent<TourId>).detail
      if (!TOURS[id]) return
      setTourId(id)
      setStep(0)
    }
    window.addEventListener(WALKTHROUGH_EVENT, start)
    return () => {
      window.removeEventListener(WALKTHROUGH_EVENT, start)
      setStep(null)
    }
  }, [pathname])

  // The welcome tour starts on the home page: on the first visit, or when replay was asked for from another page.
  useEffect(() => {
    if (pathname !== "/") return
    const start = () => {
      setTourId("welcome")
      setStep(0)
    }
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
      if (active.current === "welcome") write(() => localStorage, DONE_KEY, "done")
      setStep(null)
    }
  }, [pathname])

  useEffect(() => {
    active.current = step != null ? tourId : null
  }, [step, tourId])

  // Bring the step's target into view and keep the spotlight on it.
  useEffect(() => {
    if (step == null) return
    const el = visibleTarget(STEPS[step].target)
    if (!el) {
      const frame = requestAnimationFrame(() => {
        if (step + 1 >= STEPS.length) markDone(tourId)
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
  }, [step, STEPS, tourId])

  useEffect(() => {
    if (step == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      markDone(tourId)
      setStep(null)
      setRect(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [step, tourId])

  if (step == null) return null
  const end = () => {
    markDone(tourId)
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
            {TOURS[tourId].label} · {step + 1} of {STEPS.length}
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
              {tourId === "welcome" ? "Skip tour" : "Close"}
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
