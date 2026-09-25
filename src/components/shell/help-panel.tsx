"use client"

import { ArrowUpRight, BookOpenText, ChevronDown, CircleHelp, Compass, Loader2, Search, X } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { GlossaryEntry } from "@/lib/glossary"
import { cn } from "@/lib/utils"
import { useStartTour } from "./tour"

// The floating "?" on every page: a lookup over every metric and report field definition, from the
// same dictionaries Translate shows (see lib/glossary.ts). A search box and a list; no questions
// answered, nothing generated. Opens over the page, so nothing the reader was looking at is lost.

/** Results shown at once; typing narrows the rest. */
const LIMIT = 60

let glossary: Promise<GlossaryEntry[]> | null = null
function loadGlossary() {
  glossary ??= fetch("/api/glossary").then((res) => {
    if (!res.ok) throw new Error(res.statusText)
    return res.json() as Promise<GlossaryEntry[]>
  })
  glossary.catch(() => (glossary = null))
  return glossary
}

// Name and code matches first, then HCAI's label, then anything in the definition or context.
function score(e: GlossaryEntry, terms: string[]) {
  const term = e.term.toLowerCase()
  const code = e.code?.toLowerCase() ?? ""
  const hay = [term, code, e.hcaiLabel ?? "", e.definition, e.context].join(" ").toLowerCase()
  if (!terms.every((t) => hay.includes(t))) return 0
  const kind = e.kind === "term" ? 0.75 : e.kind === "metric" ? 0.5 : 0
  if (terms.every((t) => term.includes(t) || code.includes(t))) return (term.startsWith(terms[0]) || code.startsWith(terms[0]) ? 4 : 3) + kind
  if (e.hcaiLabel && terms.every((t) => e.hcaiLabel!.toLowerCase().includes(t))) return 2 + kind
  return 1 + kind
}

export function HelpPanel() {
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<GlossaryEntry[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState("")
  const [expanded, setExpanded] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const startTour = useStartTour()

  function openChange(next: boolean) {
    setOpen(next)
    if (next && !entries) {
      setFailed(false)
      loadGlossary().then(setEntries, () => setFailed(true))
    }
  }

  // "?" opens the glossary from anywhere, unless the reader is typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (e.key !== "?" || e.metaKey || e.ctrlKey || e.altKey) return
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      e.preventDefault()
      openChange(true)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const results = !entries
    ? []
    : terms.length
      ? entries
          .map((e) => ({ e, s: score(e, terms) }))
          .filter((r) => r.s > 0)
          .sort((a, b) => b.s - a.s)
          .map((r) => r.e)
      : entries.filter((e) => e.kind === "term" || e.kind === "metric")
  const fieldCount = entries?.filter((e) => e.kind === "field").length ?? 0

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger
        data-tour="help"
        aria-label="Help and glossary"
        className={cn(
          "glass-strong fixed right-4 z-40 flex size-11 print:hidden items-center justify-center rounded-full text-muted-foreground shadow-lg transition-[color,box-shadow] duration-200",
          "bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:right-6 md:bottom-6",
          "hover:glow-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[popup-open]:glow-soft data-[popup-open]:text-foreground"
        )}
      >
        <CircleHelp className="size-5" strokeWidth={1.75} />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={10}
        initialFocus={input}
        className="w-[26rem] max-w-[calc(100vw-2rem)] gap-0 p-0"
        aria-label="Glossary"
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-2">
          <div>
            <p className="text-[15px] font-semibold tracking-tight">Glossary</p>
            <p className="text-xs text-muted-foreground">
              Padua&apos;s terms, and what a metric or HCAI field means, from the same definitions as Translate.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close glossary"
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="px-3 pb-2">
          <label className="flex h-9 items-center gap-2 rounded-lg bg-input/30 px-2.5 focus-within:ring-2 focus-within:ring-ring">
            <Search className="size-4 shrink-0 opacity-50" />
            <input
              ref={input}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setExpanded(null)
              }}
              placeholder="Search terms, e.g. occupancy or GAC_…"
              aria-label="Search the glossary"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="text-muted-foreground hover:text-foreground">
                <X className="size-3.5" />
              </button>
            )}
          </label>
        </div>

        <div className="max-h-[min(26rem,55dvh)] overflow-y-auto border-t border-border px-2 py-2" aria-live="polite">
          {failed ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">Couldn&apos;t load the glossary. Close and try again.</p>
          ) : !entries ? (
            <p className="flex items-center justify-center gap-2 px-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading definitions…
            </p>
          ) : results.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nothing matches “{query}”.</p>
          ) : (
            <>
              {!terms.length && (
                <p className="px-2 pb-1.5 text-xs font-medium tracking-wide text-tertiary-foreground uppercase">
                  Padua&apos;s terms, then metrics · type to search {fieldCount} report fields too
                </p>
              )}
              <ul className="space-y-0.5">
                {results.slice(0, LIMIT).map((e) => (
                  <GlossaryRow
                    key={e.key}
                    entry={e}
                    open={expanded === e.key}
                    onToggle={() => setExpanded(expanded === e.key ? null : e.key)}
                    onNavigate={() => setOpen(false)}
                  />
                ))}
              </ul>
              {results.length > LIMIT && (
                <p className="px-2 pt-2 text-xs text-muted-foreground">
                  Showing {LIMIT} of {results.length}. Keep typing to narrow it down.
                </p>
              )}
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2.5 text-[13px]">
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              startTour()
            }}
            className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Compass className="size-3.5" /> Take the tour
          </button>
          <Link
            href="/translate"
            onClick={() => setOpen(false)}
            className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <BookOpenText className="size-3.5" /> Every field, in Translate
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function GlossaryRow({
  entry: e,
  open,
  onToggle,
  onNavigate,
}: {
  entry: GlossaryEntry
  open: boolean
  onToggle: () => void
  onNavigate: () => void
}) {
  const detail = e.formula || e.caution || e.hcaiLabel || e.href
  return (
    <li className={cn("rounded-lg", open && "bg-muted/60")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        disabled={!detail}
        className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:hover:bg-transparent"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-medium">{e.term}</span>
            {e.code && <code className="font-mono text-xs text-muted-foreground">{e.code}</code>}
          </span>
          <span className={cn("mt-0.5 block text-[13px] leading-snug text-muted-foreground", !open && "line-clamp-2")}>
            {e.definition}
          </span>
          <span className="mt-0.5 block text-xs text-tertiary-foreground">{e.context}</span>
        </span>
        {detail && (
          <ChevronDown className={cn("mt-1 size-3.5 shrink-0 text-tertiary-foreground transition-transform", open && "rotate-180")} />
        )}
      </button>
      {open && (
        <div className="space-y-1.5 px-2 pb-2.5 text-[12px] leading-relaxed">
          {e.hcaiLabel && (
            <p>
              <span className="text-muted-foreground">HCAI label: </span>
              {e.hcaiLabel}
            </p>
          )}
          {e.formula && (
            <p>
              <span className="text-muted-foreground">Formula: </span>
              <code className="font-mono text-xs break-words">{e.formula}</code>
            </p>
          )}
          {e.caution && <p className="text-warning">{e.caution}</p>}
          {e.href && (
            <Link
              href={e.href}
              onClick={onNavigate}
              className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Full entry in Translate <ArrowUpRight className="size-3" />
            </Link>
          )}
        </div>
      )}
    </li>
  )
}
