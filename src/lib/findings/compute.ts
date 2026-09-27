import "server-only"

import { metricSeries, type SeriesPoint } from "@/lib/benchmark/compute"
import type { PeerFilters } from "@/lib/benchmark/filters"
import { resolvePeerGroup } from "@/lib/benchmark/peers"
import { DATASETS, type MetricDef } from "@/lib/data/datasets"
import { getSourceStatus, type SourceStatus } from "@/lib/data/freshness"
import { getFacilities, getMetricCatalog, getPenaltyHospitals } from "@/lib/data/store"
import type { DatasetId } from "@/lib/data/types"
import { directionOf, metricStanding, trend } from "@/lib/favorability"
import { formatMetric, formatUsd } from "@/lib/format"
import { MODULE_DATA } from "@/lib/propose/module-data"
import { HAC_MEASURES, HRRP_CONDITIONS, hrrpCounts, type PenaltyData } from "@/lib/propose/penalty"
import { auditLabel, type QualityFlag } from "@/lib/status"
import { FAMILIES, HRRP_METRIC, PROGRAM_LABEL, type Family } from "./families"
import {
  confidenceLevel,
  confidenceOf,
  FLAG_FACTOR,
  freshnessFactor,
  HAC_SEVERITY,
  hrrpSeverity,
  MIN_PRIMARY_SCORE,
  MIN_SCORED_PEERS,
  peerSeverity,
  peersFactor,
  persistence,
  PROGRAM_PERSISTENCE,
  sampleFactor,
  scoreOf,
  selectFindings,
  significanceFactor,
  SMALL_SAMPLE,
  UNAUDITED_FACTOR,
  type Candidate,
  type EvidencePoint,
  type Factor,
  type Finding,
  type ProgramItem,
  type Selection,
  type StatusInfo,
} from "./score"

// The Opportunity Finder, server side: scans one hospital's metrics in every finding family (families.ts) against its
// peer group, plus its CMS penalties, scores each candidate (score.ts), and folds candidates into one finding per
// family. Reads only what Benchmark and Propose already read; changes no calculation.

export type FindingsResult = Selection & {
  facility: { id: string; name: string }
  peerGroup: { description: string; note: string | null; count: number }
  /** Families with no candidate: shown so an empty list reads as "checked", not "missing". */
  clear: string[]
  minPrimary: number
}

/** "Jul 2021–Jun 2024" -> months spanned, or null. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
function spanMonths(period: string | undefined) {
  const m = period?.match(/^(\w{3}) (\d{4})–(\w{3}) (\d{4})$/)
  if (!m) return null
  return (Number(m[4]) - Number(m[2])) * 12 + MONTHS.indexOf(m[3]) - MONTHS.indexOf(m[1]) + 1
}

/** A point's period for use mid-sentence, as the metric cards word it. */
function periodOf(p: SeriesPoint) {
  const period = p.detail?.period
  if (!period) return String(p.year)
  const release = period.match(/^Published (.+)$/)
  return release ? `the ${release[1]} release` : period
}

function comparedText(metric: MetricDef, compared: "better" | "same" | "worse" | undefined) {
  if (!compared || !metric.comparedTo) return null
  if (metric.comparedTo === "predicted") {
    return { better: "Fewer infections than predicted", same: "No different from predicted", worse: "More infections than predicted" }[compared]
  }
  return `${{ better: "Better than", same: "No different from", worse: "Worse than" }[compared]} ${metric.comparedTo}`
}

/** The hospital's latest published value of a metric and where it stands, or null. */
function latestOf(points: SeriesPoint[]) {
  const lastPublished = points.findLastIndex((p) => p.published)
  const shown = lastPublished >= 0 ? points.slice(0, lastPublished + 1) : []
  const withValue = shown.filter((p) => p.value != null)
  const latest = withValue.at(-1)
  if (!latest) return null
  const sourceYear = shown.at(-1)!.year
  const behind = shown.filter((p) => p.year > latest.year && p.published).length
  return { latest, withValue, sourceYear, behind }
}

function evidenceOf(metric: MetricDef, points: SeriesPoint[]): EvidencePoint | null {
  const l = latestOf(points)
  if (!l) return null
  const { latest, withValue } = l
  const prior = withValue.at(-2)
  const t =
    prior?.value != null
      ? trend(directionOf(metric.id), prior.value, latest.value!, formatMetric(metric, prior.value) === formatMetric(metric, latest.value))
      : null
  return {
    metric: metric.id,
    label: metric.label,
    value: latest.value!,
    period: periodOf(latest),
    median: latest.median,
    p25: latest.p25,
    p75: latest.p75,
    n: latest.n,
    percentile: latest.percentile,
    standing: metricStanding(metric.id, latest.percentile, latest.n),
    trend: t,
    compared: comparedText(metric, latest.detail?.compared),
    text: {
      value: formatMetric(metric, latest.value),
      median: latest.median != null ? formatMetric(metric, latest.median) : null,
      p25: latest.p25 != null ? formatMetric(metric, latest.p25) : null,
      p75: latest.p75 != null ? formatMetric(metric, latest.p75) : null,
    },
    prior: prior?.value != null ? { text: formatMetric(metric, prior.value), period: periodOf(prior), rising: latest.value! > prior.value } : null,
  }
}

function statusOf(metric: MetricDef, latest: SeriesPoint, sourceYear: number, behind: number, source: SourceStatus | undefined): StatusInfo {
  const flags: QualityFlag[] = []
  if (behind > 0) flags.push("stale")
  if (source?.provisional.includes(latest.year)) flags.push("provisional")
  if (latest.annualized) flags.push("partial-period")
  if (source?.matched) flags.push("matched-record")
  const publishedOn = source?.published[latest.year]
  return {
    through: periodOf(latest),
    periodType: DATASETS[metric.dataset].periodType,
    published: publishedOn ? `Published ${publishedOn}` : source?.sourceUpdated ? `Source updated ${source.sourceUpdated}` : null,
    processed: source ? `Processed ${source.processed}` : null,
    audit: metric.dataset === "hafd-selected" ? auditLabel(latest.status) : null,
    flags,
    flagDetail: {
      ...(behind > 0 ? { stale: `The latest value here is from ${latest.year}; the source has data through ${sourceYear}.` } : {}),
      ...(source?.matched ? { "matched-record": source.matched } : {}),
    },
  }
}

/** A metric's candidate, if it stands unfavorable against peers or the source rates it worse than its benchmark. */
function metricCandidate(metric: MetricDef, weight: number, points: SeriesPoint[], source: SourceStatus | undefined): Candidate | null {
  const direction = directionOf(metric.id)
  if (direction === "context") return null
  const l = latestOf(points)
  if (!l) return null
  const { latest, withValue, sourceYear, behind } = l
  if (behind >= 2 || latest.n < MIN_SCORED_PEERS || latest.percentile == null) return null
  if (latest.median == null || latest.p25 == null || latest.p75 == null) return null
  const standing = metricStanding(metric.id, latest.percentile, latest.n)
  const compared = latest.detail?.compared
  const kind = standing === "unfavorable" ? "peer" : compared === "worse" ? "verdict" : null
  if (!kind) return null

  const evidence = evidenceOf(metric, points)!
  const severity = peerSeverity(direction, latest.percentile, latest.value!, latest.median, latest.p25, latest.p75)
  const span = spanMonths(latest.detail?.period)
  const history = withValue.slice(-3).map((p) => metricStanding(metric.id, p.percentile, p.n) === "unfavorable")
  const pers = persistence(history, evidence.trend, span != null && span > 13)

  const status = statusOf(metric, latest, sourceYear, behind, source)
  const factors: Factor[] = [peersFactor(latest.n), freshnessFactor(behind, latest.year, sourceYear)]
  if (status.flags.includes("provisional")) factors.push({ label: "Provisional", value: FLAG_FACTOR.provisional!, rule: "The source marks this year preliminary (×0.85)." })
  if (status.flags.includes("partial-period")) factors.push({ label: "Partial period", value: FLAG_FACTOR["partial-period"]!, rule: "Part-year report, annualized (×0.85)." })
  if (status.flags.includes("matched-record")) factors.push({ label: "Matched record", value: FLAG_FACTOR["matched-record"]!, rule: "The source doesn't key this hospital by its HCAI number (×0.9)." })
  if (metric.dataset === "hafd-selected" && latest.status && auditLabel(latest.status) !== "Audited") {
    factors.push({ label: "Unaudited", value: UNAUDITED_FACTOR, rule: `HCAI audit status: ${auditLabel(latest.status)} (×0.95).` })
  }
  if (compared && metric.comparedTo) factors.push(significanceFactor(compared, metric.comparedTo))
  if (latest.detail?.n != null && latest.detail.n < SMALL_SAMPLE) factors.push(sampleFactor(latest.detail.n))
  const confidence = confidenceOf(factors)

  return {
    kind,
    id: metric.id,
    label: metric.label,
    severity,
    persistence: pers,
    weight,
    confidence,
    factors,
    score: scoreOf(severity.value, pers.value, weight, confidence),
    evidence,
    dollars: null,
    status,
  }
}

function programStatus(source: SourceStatus, fiscalYear: number, period: string, matched: string | null): StatusInfo {
  return {
    through: period,
    periodType: `CMS performance period (FY ${fiscalYear} penalty)`,
    published: source.sourceUpdated ? `Source updated ${source.sourceUpdated}` : null,
    processed: `Processed ${source.processed}`,
    audit: null,
    flags: matched ? ["matched-record"] : [],
    flagDetail: matched ? { "matched-record": `CMS reports this hospital together with ${matched}.` } : {},
  }
}

const monthYear = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}
const periodText = (p: { start: string; end: string }) => `${monthYear(p.start)}–${monthYear(p.end)}`

function programFactors(matched: string | null): Factor[] {
  const factors: Factor[] = [{ label: "Freshness", value: 1, rule: "The program's current payment year." }]
  if (matched) factors.push({ label: "Matched record", value: FLAG_FACTOR["matched-record"]!, rule: `CMS reports this hospital together with ${matched} (×0.9).` })
  return factors
}

function hrrpCandidate(data: PenaltyData, source: SourceStatus, weight: number): Candidate | null {
  const h = data.hrrp.hospital
  if (!h || !(h.reduction > 0)) return null
  const items: ProgramItem[] = []
  for (const { key, label } of HRRP_CONDITIONS) {
    const c = h.conditions[key]
    if (!c || !hrrpCounts(c, data.hrrp.minDischarges) || !(c.err > c.peerMedian!)) continue
    // Readmission-rate points that bring the ERR to the peer-group median, as the penalty module models a cut; rounded
    // up to a tenth so the prefill reaches the median rather than stopping just short of it.
    const gap = c.predicted ? Math.ceil(c.predicted * (1 - c.peerMedian! / c.err) * 10 - 1e-9) / 10 : null
    items.push({
      key,
      label,
      detail: `Excess readmission ratio ${c.err.toFixed(3)} vs CMS peer-group median ${c.peerMedian!.toFixed(3)} (${c.discharges} discharges)`,
      gapToMedian: gap && gap > 0 ? gap : null,
    })
  }
  const factors = programFactors(data.reportedWithName)
  const confidence = confidenceOf(factors)
  const severity = hrrpSeverity(h.reduction, data.hrrp.cap)
  const pay = data.payments.hospital
  return {
    kind: "program",
    id: "hrrp",
    program: "hrrp",
    label: PROGRAM_LABEL.hrrp,
    severity,
    persistence: PROGRAM_PERSISTENCE,
    weight,
    confidence,
    factors,
    score: scoreOf(severity.value, PROGRAM_PERSISTENCE.value, weight, confidence),
    evidence: null,
    dollars: pay
      ? {
          amount: h.reduction * pay.baseOperating,
          basis: `${(h.reduction * 100).toFixed(2)}% of an estimated ${formatUsd(pay.baseOperating, { compact: true })} in base Medicare operating payments (FY ${data.payments.fiscalYear} estimate)`,
        }
      : null,
    items,
    status: programStatus(source, data.hrrp.fiscalYear, periodText(data.hrrp.period), data.reportedWithName),
  }
}

function hacCandidate(data: PenaltyData, source: SourceStatus, weight: number, peerMedians: Partial<Record<string, number>>): Candidate | null {
  const h = data.hac.hospital
  if (!h?.penalized) return null
  const items: ProgramItem[] = []
  for (const { key, label } of [...HAC_MEASURES, { key: "psi90" as const, label: "Patient safety composite (PSI 90)" }]) {
    const m = h.measures[key]
    if (!m || m.value == null || !(m.z > 0)) continue
    const median = peerMedians[key]
    const gap = key !== "psi90" && median != null && m.value > median ? Math.min(100, Math.ceil((1 - median / m.value) * 100 - 1e-9)) : null
    items.push({
      key,
      label,
      detail: `${key === "psi90" ? "Value" : "SIR"} ${m.value.toFixed(3)}, ${m.z.toFixed(2)} standard deviations worse than the national mean${median != null ? `; peer median ${median.toFixed(3)}` : ""}`,
      gapToMedian: gap && gap > 0 ? gap : null,
    })
  }
  const factors = programFactors(data.reportedWithName)
  const confidence = confidenceOf(factors)
  const pay = data.payments.hospital
  return {
    kind: "program",
    id: "hac",
    program: "hac",
    label: PROGRAM_LABEL.hac,
    severity: HAC_SEVERITY,
    persistence: PROGRAM_PERSISTENCE,
    weight,
    confidence,
    factors,
    score: scoreOf(HAC_SEVERITY.value, PROGRAM_PERSISTENCE.value, weight, confidence),
    evidence: null,
    dollars: pay
      ? {
          amount: data.hac.reduction * pay.operating,
          basis: `${(data.hac.reduction * 100).toFixed(0)}% of an estimated ${formatUsd(pay.operating, { compact: true })} in Medicare operating payments (FY ${data.payments.fiscalYear} estimate)`,
        }
      : null,
    items,
    status: programStatus(source, data.hac.fiscalYear, `${periodText(data.hac.periods.hai)} (infections), ${periodText(data.hac.periods.psi90)} (PSI 90)`, data.reportedWithName),
  }
}

const STARTING_POINT = "a starting point, not a target"

function proposeLink(family: Family, facilityId: string, candidates: Candidate[]): Finding["propose"] {
  const params = new URLSearchParams({ facility: facilityId })
  if (family.propose === "penalty-readm" || family.propose === "penalty-hai") {
    const program = candidates.find((c) => c.program === (family.propose === "penalty-readm" ? "hrrp" : "hac"))
    // Without a penalty there's nothing for the avoided-penalty module to avoid.
    if (!program) return null
    const gaps = (program.items ?? []).filter((i) => i.gapToMedian != null)
    const readm = family.propose === "penalty-readm"
    params.set("module", "penalty")
    params.set("pick", "manual")
    params.set("name", readm ? `Readmission reduction: ${gaps.map((g) => g.label).join(", ") || "penalized conditions"}` : "Infection reduction: HAC penalty")
    params.set(
      "desc",
      readm
        ? `From Padua's key findings. Each condition is prefilled with its readmission-rate gap to the CMS peer-group median, in percentage points: ${STARTING_POINT}.`
        : `From Padua's key findings. Each infection is prefilled with the cut that would bring it to the peer median, in percent: ${STARTING_POINT}.`
    )
    if (gaps.length) params.set(readm ? "readm" : "hai", gaps.map((g) => `${g.key}:${g.gapToMedian}`).join(","))
    return { href: `/propose?${params}`, module: "Avoided penalties", prefilled: gaps.length > 0 }
  }
  if (family.propose === "savings") {
    const lead = candidates[0].evidence
    params.set("module", "savings")
    params.set("pick", "manual")
    params.set("name", `${family.label}: savings initiative`)
    params.set(
      "desc",
      lead && lead.median != null
        ? `From Padua's key findings: ${lead.label.toLowerCase()} ${lead.period} vs the peer median. No savings amounts are prefilled; enter the initiative's own estimates.`
        : "From Padua's key findings. No savings amounts are prefilled; enter the initiative's own estimates."
    )
    return { href: `/propose?${params}`, module: "Cost savings", prefilled: false }
  }
  return null
}

export async function computeFindings({
  facilityId,
  filters,
  minPrimary = MIN_PRIMARY_SCORE,
}: {
  facilityId: string
  filters: PeerFilters
  minPrimary?: number
}): Promise<FindingsResult | null> {
  const [facilities, catalog] = await Promise.all([getFacilities(), getMetricCatalog()])
  const facility = facilities.find((f) => f.id === facilityId)
  if (!facility) return null
  const group = resolvePeerGroup(facility, facilities, filters)
  const peerIds = group.peers.map((p) => p.id)

  const defs = new Map<string, MetricDef>()
  for (const f of FAMILIES) for (const m of f.members) {
    const def = catalog.find((c) => c.id === m.metric)
    if (def) defs.set(m.metric, def)
  }
  const datasets = [...new Set([...defs.values()].map((d) => d.dataset))] as DatasetId[]
  const [series, sources, penalty, penaltySource, penaltyHospitals] = await Promise.all([
    Promise.all([...defs.values()].map(async (d) => [d.id, await metricSeries(d, facility.id, peerIds)] as const)).then((e) => new Map(e)),
    Promise.all(datasets.map(async (d) => [d, await getSourceStatus(d, facility.id)] as const)).then((e) => new Map(e)),
    MODULE_DATA.penalty(facility.id) as Promise<PenaltyData>,
    getSourceStatus("cms-penalties", facility.id),
    getPenaltyHospitals(),
  ])

  // Peer medians of the HAC measures, from the same CMS file, for the infection-cut prefill.
  const hacPeerMedians: Partial<Record<string, number>> = {}
  for (const key of [...HAC_MEASURES.map((m) => m.key), "psi90"]) {
    const values = peerIds
      .map((id) => penaltyHospitals[id]?.hac?.measures?.[key]?.value)
      .filter((v): v is number => typeof v === "number")
      .sort((a, b) => a - b)
    if (values.length >= MIN_SCORED_PEERS) {
      const mid = (values.length - 1) / 2
      hacPeerMedians[key] = (values[Math.floor(mid)] + values[Math.ceil(mid)]) / 2
    }
  }

  const findings: Finding[] = []
  const clear: string[] = []
  for (const family of FAMILIES) {
    const candidates: Candidate[] = []
    const context: EvidencePoint[] = []
    for (const m of family.members) {
      const def = defs.get(m.metric)
      const points = series.get(m.metric)
      if (!def || !points) continue
      const c = m.evidenceOnly ? null : metricCandidate(def, m.weight, points, sources.get(def.dataset))
      if (c) candidates.push(c)
      else {
        const e = evidenceOf(def, points)
        if (e) context.push(e)
      }
    }
    for (const p of family.programs ?? []) {
      const c = p.id === "hrrp" ? hrrpCandidate(penalty, penaltySource, p.weight) : hacCandidate(penalty, penaltySource, p.weight, hacPeerMedians)
      if (c) candidates.push(c)
    }
    if (!candidates.length) {
      clear.push(family.label)
      continue
    }
    candidates.sort((a, b) => b.score - a.score || b.confidence - a.confidence)
    const lead = candidates[0]
    const dollars = candidates.find((c) => c.dollars)?.dollars ?? null
    // Readmission conditions the penalty names, when a Care Compare rate isn't already a candidate.
    if (family.id === "readmissions") {
      const hrrp = candidates.find((c) => c.program === "hrrp")
      for (const item of hrrp?.items ?? []) {
        const metric = HRRP_METRIC[item.key]
        if (metric && !candidates.some((c) => c.id === metric) && !context.some((e) => e.metric === metric)) {
          const def = defs.get(metric)
          const e = def && evidenceOf(def, series.get(metric) ?? [])
          if (e) context.push(e)
        }
      }
    }
    findings.push({
      id: `${facility.id}:${family.id}`,
      family: family.id,
      label: family.label,
      type: family.type,
      score: lead.score,
      confidence: lead.confidence,
      level: confidenceLevel(lead.confidence),
      lead,
      candidates,
      context,
      dollars,
      nextAction: family.nextAction,
      propose: proposeLink(family, facility.id, candidates),
    })
  }

  return {
    ...selectFindings(findings, minPrimary),
    facility: { id: facility.id, name: facility.name },
    peerGroup: { description: group.description, note: group.note, count: peerIds.length },
    clear,
    minPrimary,
  }
}
