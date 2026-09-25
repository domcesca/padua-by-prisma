import type { Metadata } from "next"

import { ProposeView } from "@/components/propose/propose-view"
import { AboutTool } from "@/components/shell/about-tool"
import { PageHeader } from "@/components/shell/page-header"
import { getFacilityOptions, getLatestYear } from "@/lib/data/store"

export const metadata: Metadata = { title: "Propose" }

export default async function ProposePage({ searchParams }: PageProps<"/propose">) {
  const sp = await searchParams
  const search = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))).toString()
  const [facilities, latestYear] = await Promise.all([getFacilityOptions(), getLatestYear()])

  return (
    <div className="space-y-8">
      <PageHeader
        title="Propose"
        actions={<AboutTool id="propose" />}
        description="Build the financial case for a new technology, service, or piece of equipment: what it costs, what it brings in, and when it pays back."
        className="print:hidden"
      />
      <ProposeView facilities={facilities} latestYear={latestYear} search={search} />
    </div>
  )
}
