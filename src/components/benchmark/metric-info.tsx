"use client"

import { Info } from "lucide-react"
import Link from "next/link"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { translateHref } from "@/lib/data/datasets"
import type { DatasetId, DictionaryMetric } from "@/lib/data/types"

/** Small ⓘ button that explains a metric in plain language. */
export function MetricInfo({ metric }: { metric: DictionaryMetric & { dataset?: DatasetId } }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`About ${metric.label}`}
        className="rounded-full text-tertiary-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Info className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-3 p-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">{metric.label}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">{metric.summary}</p>
        </div>
        <p className="rounded-lg bg-muted px-2.5 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {metric.formula}
        </p>
        {metric.caution && <p className="text-xs leading-relaxed text-muted-foreground">{metric.caution}</p>}
        <Link href={translateHref(metric.dataset ?? "hafd-selected", { metric: metric.id })} className="text-xs font-medium text-primary hover:underline">
          Why this number moves →
        </Link>
      </PopoverContent>
    </Popover>
  )
}
