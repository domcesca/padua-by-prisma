// Flags for hospitals whose figures shouldn't be read as current, shown wherever a hospital is picked or summarized.
//   * Closed: HCAI's Licensed Healthcare Facility Listing shows the hospital's license in Suspense (not operating) or
//     Closed, now or when it dropped off the listing (etl hcai-facility-status). Dropping off while Open isn't
//     counted: a new license number looks the same.
//   * Outdated: its newest report is more than STALE_YEARS behind the newest year any hospital has.

/** Closure evidence from the state's license listing. */
export type FacilityClosure = {
  /** Effective date of the Suspense/Closed status (ISO), when the listing gives one. */
  asOf: string | null
  /** "status": on the current listing as Suspense/Closed; "status-then-unlisted": so when it dropped off. */
  basis: "status" | "status-then-unlisted"
  /** The listing's status: "Suspense" (license suspended, not operating) or "Closed". */
  status: string
  /** For "status-then-unlisted": the first listing without it (ISO). */
  unlistedBy?: string | null
}

export const STALE_YEARS = 2

export type FacilityFlag = {
  kind: "closed" | "outdated"
  /** Short label for badges ("Closed?", "Outdated"). */
  badge: string
  title: string
  detail: string
}

const longDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
const monthYear = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })

export function facilityFlag(f: { lastYear: number; closure: FacilityClosure | null }, latestYear: number): FacilityFlag | null {
  const behind = latestYear - f.lastYear
  const stale = behind > STALE_YEARS
  const reports = `Its most recent report on file is from ${f.lastYear}${behind > 0 ? `, ${behind} ${behind === 1 ? "year" : "years"} behind the newest data (${latestYear})` : ""}.`
  if (f.closure) {
    const c = f.closure
    // The title carries the date; the detail says what it's the date of.
    const since = c.asOf ? " from that date" : ""
    const state = c.status === "Closed" ? "closed" : "suspended (not operating)"
    const listing =
      c.basis === "status"
        ? `The state’s licensed facility listing shows its license ${state}${since}.`
        : `The state’s licensed facility listing showed its license ${state}${since}, and it has been off the listing${c.unlistedBy ? ` since ${monthYear(c.unlistedBy)}` : ""}.`
    return {
      kind: "closed",
      badge: "Closed?",
      title: c.asOf ? `This hospital appears to be closed as of ${longDate(c.asOf)}.` : "This hospital appears to be closed.",
      detail: `${listing} ${reports} Source: HCAI Licensed Healthcare Facility Listing.`,
    }
  }
  if (stale)
    return {
      kind: "outdated",
      badge: "Outdated",
      title: "This hospital’s data may be outdated: no recent reports on file.",
      detail: `${reports} It may have closed, merged, or begun reporting under another hospital.`,
    }
  return null
}
