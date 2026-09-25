"use client"

import { Info } from "lucide-react"
import Link from "next/link"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DATASETS, isHcaiDataset, translateHref } from "@/lib/data/datasets"
import type { DatasetId, DictionaryMetric } from "@/lib/data/types"

/** Small ⓘ button that explains a metric in plain language. */
export function MetricInfo({ metric }: { metric: DictionaryMetric & { dataset?: DatasetId } }) {
  const dataset = metric.dataset ?? "hafd-selected"
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`About ${metric.label}`}
        className="rounded-full text-tertiary-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Info className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-[70vh] w-80 gap-3 overflow-y-auto p-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">{metric.label}</p>
          <p className="text-sm leading-relaxed text-muted-foreground">{metric.summary}</p>
        </div>
        <p className="rounded-lg bg-muted px-2.5 py-2 font-mono text-xs leading-relaxed text-muted-foreground">
          {metric.formula}
        </p>
        {metric.caution && (
          <div className="rounded-lg bg-black/4 px-2.5 py-2 dark:bg-white/6">
            <p className="text-xs font-medium text-foreground">
              {metric.estimate ? "Estimate — read before comparing" : "Read before comparing"}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{metric.caution}</p>
          </div>
        )}
        {isHcaiDataset(dataset) ? (
          <Link href={translateHref(dataset, { metric: metric.id })} className="text-xs font-medium text-primary hover:underline">
            Why this number moves →
          </Link>
        ) : (
          <>
            {metric.drivers.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-foreground">Why it moves</p>
                <ul className="list-disc space-y-0.5 pl-4 text-xs leading-relaxed text-muted-foreground">
                  {metric.drivers.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </div>
            )}
            <a
              href={DATASETS[dataset].sourcePage}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-primary hover:underline"
            >
              Source: {DATASETS[dataset].shortLabel} →
            </a>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
