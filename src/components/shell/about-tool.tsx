"use client"

import { Compass, Info, X } from "lucide-react"
import { useState } from "react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ABOUT, type AboutId } from "@/lib/about"
import { cn } from "@/lib/utils"
import { startWalkthrough } from "./tour"

/**
 * "About this tool" beside a tab's title: two or three plain sentences in a popup styled like the glossary's, plus a
 * step-by-step walkthrough for the tabs that have one.
 */
export function AboutTool({ id, className }: { id: AboutId; className?: string }) {
  const [open, setOpen] = useState(false)
  const about = ABOUT[id]
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        data-tour="about"
        className={cn(
          "glass-subtle inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground print:hidden",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[popup-open]:text-foreground",
          className
        )}
      >
        <Info className="size-3.5" /> About this tool
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[24rem] max-w-[calc(100vw-2rem)] gap-0 p-0" aria-label={`About ${about.title}`}>
        <div className="flex items-start justify-between gap-2 px-4 pt-3.5 pb-2">
          <p className="text-[15px] font-semibold tracking-tight">About {about.title}</p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="-mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-2 px-4 pb-3.5 text-[13px] leading-relaxed text-muted-foreground">
          {about.body.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
        {about.walkthrough && (
          <div className="border-t border-border px-4 py-2.5 text-[13px]">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                startWalkthrough(about.walkthrough!)
              }}
              className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Compass className="size-3.5" /> Show me how this works
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
