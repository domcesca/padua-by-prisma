import "server-only"

import { getSourceManifest } from "./store"

// What each metric card's status line needs to know about its source, beyond the values themselves: when the source
// published each year, when Padua processed it, and whether this hospital's record was matched rather than keyed
// (lib/favorability's vocabulary; components/shell/status-line.tsx draws it). Read from the manifests the ETL writes.

export type SourceStatus = {
  /** Year -> when the source published that year's data ("Oct 2025"), where the source names it. */
  published: Record<string, string>
  /** When the source last updated its files, where it says (open data portal metadata or release date). */
  sourceUpdated: string | null
  /** When Padua's ETL last processed the source. */
  processed: string
  /** Years the source marks preliminary. */
  provisional: number[]
  /** Why this hospital's record is matched rather than reported under its own ID, if it is. */
  matched: string | null
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

const monthYear = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

const fullDate = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

/** The release date a source file's name carries: "(October 2025)", "(April 2026 Extract)", "(Revised 11/28/2023)". */
function dateInName(name: string) {
  const long = name.match(new RegExp(`\\((?:Revised )?(${LONG_MONTHS.join("|")}) (\\d{4})`))
  if (long) return `${MONTHS[LONG_MONTHS.indexOf(long[1])]} ${long[2]}`
  const numeric = name.match(/\((?:Revised )?(\d{1,2})\/\d{1,2}\/(\d{4})\)/)
  if (numeric) return `${MONTHS[Number(numeric[1]) - 1]} ${numeric[2]}`
  return null
}

/** CMS's download paths carry the release month: …/files/2026-04/…. */
function dateInUrl(url: string | undefined) {
  const m = url?.match(/\/files\/(\d{4})-(\d{2})\//)
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : null
}

type ManifestExtras = {
  package?: { metadata_modified?: string } | Record<string, { metadata_modified?: string }>
  sources: { year?: number; name: string; url?: string; preliminary?: boolean; snapshot?: string }[]
  coverage?: { matchedByNameAndZip?: { hcaiId: string; cmsName: string }[] }
}

/** @param dir a processed source folder: a DatasetId, or a reference source such as "cms-inpatient" */
export async function getSourceStatus(dir: string, facilityId: string | null): Promise<SourceStatus> {
  const manifest = await getSourceManifest(dir)
  const m = manifest as Omit<typeof manifest, "sources"> & ManifestExtras

  const published: Record<string, string> = {}
  for (const s of m.sources) {
    const date = dateInName(s.name) ?? dateInUrl(s.url)
    if (s.year != null && date) published[s.year] = date
  }

  // Portal metadata (one package, or one per file for CDPH), else the newest release snapshot (CMS).
  const modified = m.package
    ? "metadata_modified" in m.package
      ? [m.package.metadata_modified as string | undefined]
      : Object.values(m.package as Record<string, { metadata_modified?: string }>).map((p) => p.metadata_modified)
    : []
  const snapshots = m.sources.map((s) => s.snapshot).filter((s): s is string => !!s)
  const latest = [...modified.filter((d): d is string => !!d), ...snapshots].sort().at(-1)

  let matched: string | null = null
  if (facilityId) {
    const shared = manifest.sharedReporting?.[facilityId]
    const byName = m.coverage?.matchedByNameAndZip?.find((x) => x.hcaiId === facilityId)
    if (shared) matched = `CMS reports this hospital together with ${shared.reportedWithName} under one Medicare number (CCN ${shared.ccn}).`
    else if (byName) matched = `Matched to CMS's record "${byName.cmsName}" by ZIP code and name, because its Medicare number isn't in the state's listing.`
  }

  return {
    published,
    sourceUpdated: latest ? monthYear(latest) : null,
    processed: fullDate(manifest.generatedAt) ?? manifest.generatedAt,
    provisional: m.sources.filter((s) => s.preliminary && s.year != null).map((s) => s.year!),
    matched,
  }
}
