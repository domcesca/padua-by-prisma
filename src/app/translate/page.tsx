import type { Metadata } from "next"

import { AboutTool } from "@/components/shell/about-tool"
import { PageHeader } from "@/components/shell/page-header"
import { TranslateView } from "@/components/translate/translate-view"
import { DATASET_SLUG, parseDatasetSlug } from "@/lib/data/datasets"
import { getSourceStatus } from "@/lib/data/freshness"
import { getDictionary, getFacilities, getFacilityFieldValues, getLatestYear, getManifest, toFacilityOption } from "@/lib/data/store"

export const metadata: Metadata = { title: "Translate" }

const INTRO = {
  "hafd-selected": "Every field in HCAI’s annual financial data, in plain language",
  hau: "Every field in HCAI’s annual utilization report — beds, patient days, ED visits, surgeries — in plain language",
} as const

const CREDIT = {
  "hafd-selected":
    "Definitions adapted from HCAI’s Hospital Annual Financial Data Selected File documentation (cross-reference, column labels, and glossary).",
  hau: "Definitions adapted from HCAI’s Instructions for Completing the Annual Utilization Report of Hospitals (11/01/2024) and the reporting form; report page and line numbers refer to that form.",
} as const

export default async function TranslatePage({ searchParams }: PageProps<"/translate">) {
  const sp = await searchParams
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : null)
  const dataset = parseDatasetSlug(one(sp.source))
  const otherDataset = dataset === "hau" ? "hafd-selected" : "hau"
  const [dictionary, otherDictionary, facilities, latestYear, source, manifest] = await Promise.all([
    getDictionary(dataset),
    getDictionary(otherDataset),
    getFacilities(),
    getLatestYear(),
    getSourceStatus(dataset, null),
    getManifest(dataset),
  ])

  const facilityParam = one(sp.facility)
  const facilityId = facilityParam && facilities.some((f) => f.id === facilityParam) ? facilityParam : null
  const initialFacilityData = facilityId ? await getFacilityFieldValues(dataset, facilityId) : null

  return (
    <div className="space-y-8">
      <PageHeader
        title="Translate"
        actions={<AboutTool id="translate" />}
        description={
          <>
            {INTRO[dataset]}: what it means, what can make it move, and — for any hospital — how it changed year over
            year.
          </>
        }
      />
      <TranslateView
        key={dataset}
        dataset={dataset}
        dictionary={dictionary}
        otherSource={{ slug: DATASET_SLUG[otherDataset], codes: otherDictionary.fields.map((f) => f.code) }}
        facilities={facilities.map(toFacilityOption)}
        latestYear={latestYear}
        sourceStatus={source}
        sourceLatestYear={manifest.years.at(-1)!}
        initialFacilityId={facilityId}
        initialFacilityData={facilityId ? (initialFacilityData ?? { values: {}, meta: {} }) : null}
        initialFocus={one(sp.metric) ?? one(sp.field)?.toUpperCase() ?? null}
      />
      <p className="border-t border-border pt-6 text-xs leading-relaxed text-tertiary-foreground">
        {CREDIT[dataset]} Plain-language wording and drivers are editorial guidance for administrators, not HCAI
        reporting instructions.
      </p>
    </div>
  )
}
