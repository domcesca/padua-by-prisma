import type { Metadata } from "next"

import type { FacilityOption } from "@/components/benchmark/facility-picker"
import { PageHeader } from "@/components/shell/page-header"
import { TranslateView } from "@/components/translate/translate-view"
import { getDictionary, getFacilities, getFacilityFieldValues, getManifest } from "@/lib/data/hafd"

export const metadata: Metadata = { title: "Translate" }

export default async function TranslatePage({ searchParams }: PageProps<"/translate">) {
  const sp = await searchParams
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : null)
  const [dictionary, facilities, manifest] = await Promise.all([getDictionary(), getFacilities(), getManifest()])

  const facilityParam = one(sp.facility)
  const facilityId = facilityParam && facilities.some((f) => f.id === facilityParam) ? facilityParam : null
  const initialFacilityData = facilityId ? await getFacilityFieldValues(facilityId) : null
  const options: FacilityOption[] = facilities.map((f) => ({
    id: f.id,
    name: f.name,
    formerNames: f.formerNames,
    county: f.county,
    city: f.city,
    licensedBeds: f.licensedBeds,
    typeOfCare: f.typeOfCare,
    hospitalType: f.hospitalType,
    lastYear: f.years.at(-1) ?? 0,
  }))

  return (
    <div className="space-y-8">
      <PageHeader
        title="Translate"
        description={
          <>
            Every field in HCAI&apos;s annual financial data, in plain language: what it means, what can make it move,
            and — for any hospital — how it changed year over year.
          </>
        }
      />
      <TranslateView
        dictionary={dictionary}
        facilities={options}
        latestYear={manifest.years.at(-1)!}
        initialFacilityId={initialFacilityData ? facilityId : null}
        initialFacilityData={initialFacilityData}
        initialFocus={one(sp.metric) ?? one(sp.field)?.toUpperCase() ?? null}
      />
      <p className="border-t border-border pt-6 text-xs leading-relaxed text-tertiary-foreground">
        Definitions adapted from HCAI&apos;s Hospital Annual Financial Data Selected File documentation (cross-reference,
        column labels, and glossary). Plain-language wording and drivers are editorial guidance for administrators, not
        HCAI reporting instructions.
      </p>
    </div>
  )
}
