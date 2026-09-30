// "About this tool": two or three plain sentences per tab, for a reader who wants to glance and move on. If a tab needs
// more than that, the tab is doing too much; leave the detail to the page itself. Business cases and Correlate also offer a
// step-by-step walkthrough (components/shell/tour.tsx), since misreading them has consequences.

export type AboutId = "home" | "benchmark" | "build" | "report" | "correlate" | "propose" | "translate" | "deadlines"

export const ABOUT: Record<AboutId, { title: string; body: string[]; walkthrough?: "propose" | "correlate" }> = {
  home: {
    title: "Overview",
    body: [
      "Your hospital's annual report, written from its own HCAI financial and utilization filings: how it did, where its money came from and went, its staff, patients and services, with CMS and CDPH quality as a labeled addendum. It compares the hospital with no one.",
      "Above the report, a strip shows the next HCAI filing and what needs attention against similar California hospitals, the page's only peer comparison. Saved work and shortcuts sit beside the report (below it on a phone).",
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
      "Two ways to make your own view of the data: a report (a chart or table of the measures you pick) or, as advanced analysis, a correlation (whether two measures move together across hospitals).",
    ],
  },
  report: {
    title: "Build a report",
    body: [
      "Pick a hospital, start from a template or choose a few measures, then what to compare them with and over what years. It draws a chart or table, with a one-line summary each, that you can print, save as PDF, or download.",
      "Every number comes from public data: HCAI's financial and utilization reports and case mix index, CMS Care Compare, and CDPH's infection reports.",
    ],
  },
  correlate: {
    title: "Correlate (advanced analysis)",
    body: [
      "Plots two measures for a group of hospitals, one dot per hospital, to show whether they rise and fall together.",
      "A pattern is not proof that one causes the other, and with few hospitals it can be chance. It checks whether one extreme hospital is driving the pattern and suggests other measures, from the same peer group, that may explain both.",
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
