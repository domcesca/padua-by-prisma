// "About this tool": two or three plain sentences per tab, for a reader who wants to glance and move on. If a tab needs
// more than that, the tab is doing too much; leave the detail to the page itself. Business cases and Correlate also offer a
// step-by-step walkthrough (components/shell/tour.tsx), since misreading them has consequences.

export type AboutId = "home" | "benchmark" | "build" | "report" | "correlate" | "propose" | "translate" | "deadlines"

export const ABOUT: Record<AboutId, { title: string; body: string[]; walkthrough?: "propose" | "correlate" }> = {
  home: {
    title: "Overview",
    body: [
      "Your hospital at a glance: what needs attention against similar California hospitals, what changed since the previous period, the next HCAI filings, and the priorities you've pinned.",
      "Padua remembers the hospital in this browser and opens here on it; change the hospital or the peer group in the bar at the top, and they follow you to every other tab.",
    ],
  },
  benchmark: {
    title: "Compare",
    body: [
      "Shows where a hospital stands against similar hospitals, with the peer group set by the filters at the top. Hospital priorities, first, are its top findings across every area and stay the same whichever topic tab is open; the topic details below show one card per measure for that tab.",
      "Each card shows the hospital's value, where it falls among its peers, and the peer median; higher isn't always better (a higher cost per discharge is worse).",
      "On the Quality view, measures come from CMS and CDPH and usually trail the financial data by a year or more.",
      "Under Utilization, the unit picker also groups units (HCAI's bed classifications) into service lines (Critical Care, Maternity & Newborn, Behavioral Health, Long-Term Care, …): every line side by side with its classifications listed underneath, or one line's combined trend against peers.",
      "Under Utilization, Medicare specialty breaks a hospital's traditional Medicare inpatient cases down by CMS's diagnostic categories (cardiac, orthopedics, neuro, …) against its peers. It counts only Original Medicare patients, not the hospital's total volume.",
    ],
  },
  build: {
    title: "Reports",
    body: [
      "Two ways to make your own view of the data: a report (a chart or table of the measures you pick) or a correlation (whether two measures move together across hospitals).",
    ],
  },
  report: {
    title: "Build a report",
    body: [
      "Pick a hospital, a few measures, and how to group them, and it draws a chart or table you can copy or download.",
      "Every number comes from the hospitals' public HCAI reports.",
    ],
  },
  correlate: {
    title: "Correlate",
    body: [
      "Plots two measures for a group of hospitals, one dot per hospital, to show whether they rise and fall together.",
      "A pattern is not proof that one causes the other, and with few hospitals it can be chance.",
    ],
    walkthrough: "correlate",
  },
  propose: {
    title: "Business cases",
    body: [
      "Estimates whether an initiative pays for itself: enter its costs, pick how its benefit is estimated, and read payback, ROI, and NPV under three scenarios.",
      "Results are estimates built on public national rates and your own assumptions, and each input says which it is.",
    ],
    walkthrough: "propose",
  },
  translate: {
    title: "Data definitions",
    body: [
      "A plain-language guide to the fields in HCAI's hospital reports: what each one counts, what moves it, and how it changed for a hospital you pick.",
    ],
  },
  deadlines: {
    title: "Filing calendar",
    body: ["HCAI's filing due dates for a hospital's fiscal year, with extension limits and what's coming up next."],
  },
}
