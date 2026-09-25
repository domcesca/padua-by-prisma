import { STANDING_LABEL } from "@/lib/favorability"
import { QUALITY_FLAGS } from "@/lib/status"

// Padua's shared vocabulary: one term per concept in every tool. The help panel's glossary lists these first.
// When a tool needs one of these ideas, it uses this word, not a synonym.

export const TERMS: { term: string; definition: string }[] = [
  {
    term: "Hospital",
    definition:
      "A licensed hospital, identified by its HCAI facility number. Campuses reporting under the same license are combined. (\"Facility\" appears only in source names, such as HCAI's Licensed Healthcare Facility Listing.)",
  },
  {
    term: "Peer group",
    definition:
      "The hospitals a hospital is compared with. \"Similar hospitals\" (same county, size band, and ownership, widened to at least 5) or \"All of California\". Its members are its peers; the peer median is their middle value.",
  },
  {
    term: "Unit",
    definition:
      "A hospital's beds in one of HCAI's bed classifications (Intensive Care, Perinatal, Skilled Nursing, …), with its own licensed beds, patient days, and discharges.",
  },
  {
    term: "Service line",
    definition: "Units grouped the way administrators think of them (Critical Care, Maternity & Newborn, …). Every unit is in exactly one line.",
  },
  {
    term: "Report year",
    definition: "HCAI financial data: a report year holds the reports for hospital fiscal years that ended in that calendar year.",
  },
  { term: "Calendar year", definition: "January through December: HCAI utilization data and CDPH infection data." },
  { term: "Federal fiscal year", definition: "October through September, named for the year it ends: the case mix index and CMS payment programs." },
  {
    term: "Measurement period",
    definition: "CMS Care Compare: the one to three years a quality measure covers, filed under the year the period ends.",
  },
  ...Object.entries(STANDING_LABEL).map(([key, label]) => ({
    term: label,
    definition: {
      favorable: "Outside the middle half of the peer group, on the favorable side for this measure (above the 75th percentile where higher is better, below the 25th where lower is better).",
      unfavorable: "Outside the middle half of the peer group, on the unfavorable side for this measure.",
      similar: "Within the middle half of the peer group (25th to 75th percentile), the band the trend charts shade.",
      depends: "A measure where higher isn't better or worse in itself (volumes, length of stay, occupancy, case mix index, payer mix): where it should be depends on the hospital's strategy.",
      fewPeers: "Fewer than 3 peers reported the measure, too few to call it favorable or not.",
    }[key]!,
  })),
  { term: "Improving / Worsening", definition: "A change from the hospital's previous value in the favorable or unfavorable direction. For a measure that depends on strategy, just Up or Down." },
  ...Object.values(QUALITY_FLAGS).map((f) => ({ term: f.label, definition: f.meaning })),
]
