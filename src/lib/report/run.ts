import "server-only"

import { metricValue, quantile } from "@/lib/benchmark/compute"
import { DEFAULT_FILTERS } from "@/lib/benchmark/filters"
import { milesBetween, resolvePeerGroup } from "@/lib/benchmark/peers"
import { isTrendMetric, type MetricDef } from "@/lib/data/datasets"
import { getFacilities, getManifest, getMetricCatalog, getMetrics } from "@/lib/data/store"
import type { Facility } from "@/lib/data/types"
import { MAX_PEER_BARS, type ReportPanel, type ReportResult, type ReportSpec } from "./spec"

type RunError = { error: string; status: number }

const median = (values: number[]) => quantile([...values].sort((a, b) => a - b), 0.5)

export async function runReport(spec: ReportSpec): Promise<ReportResult | RunError> {
  const [facilities, catalog] = await Promise.all([getFacilities(), getMetricCatalog()])
  const focus = facilities.find((f) => f.id === spec.facilityId)
  if (!focus) return { error: "Choose a hospital.", status: 400 }
  const metrics = spec.metrics
    .map((id) => catalog.find((m) => m.id === id))
    .filter((m): m is MetricDef => !!m && isTrendMetric(m))
  if (!metrics.length) return { error: "Choose at least one metric.", status: 400 }

  const byId = new Map(facilities.map((f) => [f.id, f]))
  const compare = spec.compare.map((id) => byId.get(id)).filter((f): f is Facility => !!f && f.id !== focus.id)
  const peerMode = spec.peers === "statewide" ? "statewide" : "similar"
  const group = resolvePeerGroup(focus, facilities, { ...DEFAULT_FILTERS, mode: peerMode })
  const state = resolvePeerGroup(focus, facilities, { ...DEFAULT_FILTERS, mode: "statewide" })
  const usesPeers = spec.groupBy === "peerGroup" || (spec.groupBy === "facility" && spec.hospitals === "peers") || spec.groupBy === "year"

  const panels = await Promise.all(
    metrics.map(async (metric): Promise<ReportPanel> => {
      const [file, manifest] = await Promise.all([getMetrics(metric.dataset), getManifest(metric.dataset)])
      const years = manifest.years
      const value = (id: string, year: number) => metricValue(file, id, year, metric.id)
      const peerValues = (ids: string[], year: number) =>
        ids.map((id) => value(id, year)).filter((v): v is number => v != null)
      const peerIds = group.peers.map((p) => p.id)
      const stateIds = state.peers.map((p) => p.id)
      const snapshotYear =
        spec.year != null && years.includes(spec.year)
          ? spec.year
          : ([...years].reverse().find((y) => value(focus.id, y) != null) ?? years.at(-1)!)

      if (spec.groupBy === "year") {
        const hospitals = [focus, ...compare]
        return {
          metricId: metric.id,
          rowKind: "year",
          year: null,
          note: null,
          series: [
            ...hospitals.map((h, i) => ({ key: h.id, label: h.name, role: i === 0 ? ("focus" as const) : ("compare" as const), facilityId: h.id })),
            { key: "peerMedian", label: "Peer median", role: "peer" as const },
          ],
          rows: years.map((y) => ({
            key: String(y),
            label: String(y),
            ...Object.fromEntries(hospitals.map((h) => [h.id, value(h.id, y)])),
            peerMedian: median(peerValues(peerIds, y)),
          })),
        }
      }

      if (spec.groupBy === "facility") {
        let others = spec.hospitals === "picked" ? compare : group.peers
        let note: string | null = null
        if (others.length > MAX_PEER_BARS) {
          // Keep the chart readable: the nearest hospitals (or largest, without coordinates).
          const ranked = [...others].sort((a, b) => {
            const da = milesBetween(focus, a)
            const db = milesBetween(focus, b)
            if (da != null && db != null) return da - db
            return (b.licensedBeds ?? 0) - (a.licensedBeds ?? 0)
          })
          note = `Showing the ${MAX_PEER_BARS} nearest of ${others.length} hospitals in the group.`
          others = ranked.slice(0, MAX_PEER_BARS)
        }
        const rows = [focus, ...others]
          .map((h) => ({ key: h.id, label: h.name, role: h.id === focus.id ? ("focus" as const) : ("peer" as const), value: value(h.id, snapshotYear) }))
          .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))
        const missing = rows.filter((r) => r.value == null).length
        if (missing) note = [note, `${missing} hospital${missing === 1 ? "" : "s"} didn’t report this for ${snapshotYear}.`].filter(Boolean).join(" ")
        return {
          metricId: metric.id,
          rowKind: "facility",
          year: snapshotYear,
          note,
          series: [{ key: "value", label: metric.label, role: "focus" }],
          rows,
        }
      }

      // groupBy "peerGroup"
      if (spec.chart === "bar") {
        const peers = [...peerValues(peerIds, snapshotYear)].sort((a, b) => a - b)
        return {
          metricId: metric.id,
          rowKind: "stat",
          year: snapshotYear,
          note: `${peers.length} peer${peers.length === 1 ? "" : "s"} reported for ${snapshotYear}.`,
          series: [{ key: "value", label: metric.label, role: "focus" }],
          rows: [
            { key: "focus", label: focus.name, role: "focus", value: value(focus.id, snapshotYear) },
            { key: "p75", label: "Peer 75th percentile", role: "peer", value: quantile(peers, 0.75) },
            { key: "median", label: "Peer median", role: "peer", value: quantile(peers, 0.5) },
            { key: "p25", label: "Peer 25th percentile", role: "peer", value: quantile(peers, 0.25) },
            { key: "state", label: "California median", role: "state", value: median(peerValues(stateIds, snapshotYear)) },
          ],
        }
      }
      return {
        metricId: metric.id,
        rowKind: "year",
        year: null,
        note: null,
        series: [
          { key: focus.id, label: focus.name, role: "focus", facilityId: focus.id },
          { key: "median", label: "Peer median", role: "peer" },
          { key: "state", label: "California median", role: "state" },
        ],
        rows: years.map((y) => {
          const peers = [...peerValues(peerIds, y)].sort((a, b) => a - b)
          return {
            key: String(y),
            label: String(y),
            [focus.id]: value(focus.id, y),
            median: quantile(peers, 0.5),
            p25: quantile(peers, 0.25),
            p75: quantile(peers, 0.75),
            state: median(peerValues(stateIds, y)),
            n: peers.length,
          }
        }),
      }
    })
  )

  const groupLabel = { year: "by year", facility: "by hospital", peerGroup: "vs. peer group" }[spec.groupBy]
  // "Occupancy rate and operating margin" — lower-case later labels unless they start with an acronym (ED).
  const metricLabels = metrics.map((m, i) => (i > 0 && /^[A-Z][a-z]/.test(m.label) ? m.label.charAt(0).toLowerCase() + m.label.slice(1) : m.label))
  const title = `${metricLabels.length > 2 ? `${metricLabels.length} metrics` : metricLabels.join(" and ")} ${groupLabel}`
  const subtitle =
    spec.groupBy === "year" && compare.length
      ? `${focus.name} and ${compare.length} other hospital${compare.length === 1 ? "" : "s"}`
      : spec.groupBy === "facility" && spec.hospitals === "picked"
        ? `${focus.name} and ${compare.length} chosen hospital${compare.length === 1 ? "" : "s"}`
        : focus.name

  return {
    spec,
    title: title.charAt(0).toUpperCase() + title.slice(1),
    subtitle,
    panels,
    peerGroup: usesPeers ? { description: group.description, count: group.peers.length } : null,
  }
}
