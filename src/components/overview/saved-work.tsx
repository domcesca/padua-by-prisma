"use client"

import { Loader2, NotebookPen } from "lucide-react"
import Link from "next/link"

import { PIN_TONE, pinStatus } from "@/components/briefing/briefing-view"
import { useFindings } from "@/components/findings/use-findings"
import { usePins, type Pin } from "@/lib/findings/briefing"
import type { FindingsResult } from "@/lib/findings/compute"
import { cn } from "@/lib/utils"
import { OverviewSection, SectionEmpty } from "./section"

// Saved work: the priorities pinned for this hospital (Saved briefings), each with how it stands now, the check
// Saved briefings itself makes. Pins against the Overview's own peer group reuse its findings; others fetch their own.

const SHOWN = 4

type FindingsState = { data: FindingsResult | null; error: string | null; loading: boolean }

export function SavedWork({
  facilityId,
  facilityName,
  peerQuery,
  findings,
}: {
  facilityId: string
  facilityName: string
  peerQuery: string
  /** The Overview's findings, for pins against the same peer group. */
  findings: FindingsState
}) {
  const allPins = usePins()
  const pins = allPins.filter((p) => p.facilityId === facilityId)
  const elsewhere = new Set(allPins.filter((p) => p.facilityId !== facilityId).map((p) => p.facilityId)).size
  const shown = pins.slice(0, SHOWN)
  const compareHref = `/compare?${new URLSearchParams([...new URLSearchParams(peerQuery), ["facility", facilityId]])}#key-findings`

  return (
    <OverviewSection
      id="saved-work"
      icon={NotebookPen}
      title="Saved work"
      description={pins.length ? `${pins.length} priorit${pins.length === 1 ? "y" : "ies"} pinned for ${facilityName}, checked against the latest data.` : "Priorities you pin, checked against the latest data."}
      link={allPins.length ? { href: "/briefings", label: `Saved briefings${allPins.length > pins.length ? ` (${allPins.length})` : ""}` } : null}
    >
      {pins.length === 0 ? (
        <SectionEmpty title={`Nothing saved for ${facilityName} yet`}>
          Use <span className="font-medium text-foreground">Pin to briefing</span> on any priority in Needs attention above, or in
          Compare&apos;s{" "}
          <Link href={compareHref} className="font-medium text-primary hover:underline">
            Hospital priorities
          </Link>
          . Pinned items collect here and in Saved briefings, where you can print them; each is re-checked against the latest
          data. Pins are saved in this browser only.
          {elsewhere > 0 && ` You have pins for ${elsewhere} other hospital${elsewhere === 1 ? "" : "s"}.`}
        </SectionEmpty>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {shown.map((pin) =>
              pin.peerQuery === peerQuery ? (
                <PinRow key={pin.id} pin={pin} findings={findings} />
              ) : (
                <OtherGroupPinRow key={pin.id} pin={pin} />
              )
            )}
          </ul>
          {pins.length > SHOWN && (
            <Link href="/briefings" className="self-start rounded text-[13px] font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
              {pins.length - SHOWN} more in Saved briefings
            </Link>
          )}
        </>
      )}
    </OverviewSection>
  )
}

/** A pin against another peer group: it's checked against that group, as Saved briefings does. */
function OtherGroupPinRow({ pin }: { pin: Pin }) {
  const findings = useFindings(pin.facilityId, pin.peerQuery)
  return <PinRow pin={pin} findings={findings} otherGroup />
}

function PinRow({ pin, findings, otherGroup = false }: { pin: Pin; findings: FindingsState; otherGroup?: boolean }) {
  const status = pinStatus(pin, findings.data, findings.loading, findings.error)
  return (
    <li className="space-y-1 py-2.5 first:pt-0.5 last:pb-0.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", PIN_TONE[status.tone])}>
          {status.tone === "pending" && status.label === "Checking…" && <Loader2 className="mr-1 size-3 animate-spin" aria-hidden />}
          {status.label}
        </span>
        <p className="text-[14px] font-medium">
          {pin.snapshot.label}
          {pin.snapshot.lead !== pin.snapshot.label && <span className="font-normal text-muted-foreground"> · {pin.snapshot.lead}</span>}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        {status.detail}
        {otherGroup && ` Against ${pin.snapshot.peerGroup.charAt(0).toLowerCase() + pin.snapshot.peerGroup.slice(1)}, as pinned.`}
      </p>
    </li>
  )
}
