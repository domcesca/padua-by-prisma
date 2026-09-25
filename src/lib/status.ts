// The status line every metric card carries (components/shell/status-line.tsx): what period the number covers, what
// kind of year that is, when the source published it and when Padua processed it, the audit status where the source
// has one, and a quality flag from one fixed vocabulary.

export type QualityFlag = "stale" | "provisional" | "partial-period" | "matched-record" | "unavailable"

export const QUALITY_FLAGS: Record<QualityFlag, { label: string; meaning: string }> = {
  stale: {
    label: "Stale",
    meaning: "This hospital's latest value is older than the source's latest year: it hasn't reported since.",
  },
  provisional: {
    label: "Provisional",
    meaning: "The source marks this year preliminary; values can change when it's finalized.",
  },
  "partial-period": {
    label: "Partial period",
    meaning: "The hospital reported only part of the year (for example after a change of owner); counts are annualized.",
  },
  "matched-record": {
    label: "Matched record",
    meaning: "The source doesn't key this hospital by its HCAI number; its record was matched, or it's reported together with another hospital.",
  },
  unavailable: {
    label: "Unavailable",
    meaning: "No value for this hospital in the years shown.",
  },
}

/** HCAI's audit status on a financial report, in plain words. */
export function auditLabel(status: string | null | undefined) {
  if (!status) return null
  if (/^audited$/i.test(status)) return "Audited"
  if (/in process/i.test(status)) return "Unaudited (HCAI audit in process)"
  return status
}
