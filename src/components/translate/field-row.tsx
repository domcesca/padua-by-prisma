"use client"

import { AlertTriangle, ChevronRight, ExternalLink, Pin, PinOff } from "lucide-react"
import Link from "next/link"

import { TrendText } from "@/components/shell/standing"
import { CATEGORY_BY_ID, DATASETS } from "@/lib/data/datasets"
import type { DictionaryField, DictionaryMetric, DictionarySection, FieldUnit, HcaiDatasetId, MetricCategory } from "@/lib/data/types"
import { directionOf, trend } from "@/lib/favorability"
import { formatField, formatMetric, formatPercent } from "@/lib/format"
import { BIG_CHANGE } from "@/lib/translate/notable"
import { cn } from "@/lib/utils"

// Data definitions' rows and their detail panel (V7.5). A row leads with the plain-language name and what it means;
// the HCAI field code comes second. Opened, every field and measure answers the same questions in the same order:
// what it means, its value and recent change for the chosen hospital, what moves it, how it's calculated, where it
// comes from, and which pages use it.


const UNIT_LABEL: Record<FieldUnit, string> = {
  usd: "Dollars",
  count: "Count",
  days: "Days",
  hours: "Hours",
  pct: "Percent",
  beds: "Beds",
  fte: "Full-time equivalents",
  minutes: "Minutes",
  text: "Text",
  date: "Date",
  code: "Code",
}

const REPORT_NAME: Record<HcaiDatasetId, string> = {
  "hafd-selected": "Hospital Annual Financial Disclosure report",
  hau: "Annual Utilization Report of Hospitals",
}

export type FieldValues = {
  /** Value shown in the row (selected year, or the uploaded row). */
  current: number | string | null
  /** Prior year value, when comparing years. */
  previous?: number | null
  /** Year-over-year change as a fraction. */
  change?: number | null
  /** Every year, for the detail table. */
  history?: { year: number; value: number | null; annualized: boolean }[]
}

/** The years a row's value and change refer to, and the hospital's name, for the detail panel's wording. */
export type ValueContext = { facilityId: string | null; facilityName: string | null; year: number | null; prevYear: number | null; extract: boolean }

// -- rows ----------------------------------------------------------------------

function DefinitionRow({
  domId,
  title,
  summary,
  technical,
  value,
  change,
  notable,
  pinned,
  onPin,
  expanded,
  onToggle,
  children,
}: {
  domId: string
  title: string
  summary: string
  /** The raw name, shown second: an HCAI field code or "Padua measure". */
  technical: React.ReactNode
  value: React.ReactNode
  change: React.ReactNode
  notable: boolean
  pinned: boolean
  onPin: () => void
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  const panelId = `${domId}-panel`
  return (
    <li id={domId} className="scroll-mt-40 md:scroll-mt-24">
      <div className={cn("flex items-start transition-colors duration-150", expanded && "bg-muted/40")}>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={onToggle}
          className={cn(
            // Phones: the value and change sit under the text so the name keeps the width; wider, they're a right column.
            "grid min-w-0 flex-1 grid-cols-[1fr_auto] items-start gap-x-4 gap-y-1.5 py-3.5 pl-4 text-left sm:grid-cols-[1fr_auto_auto] sm:pl-5",
            "hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
          )}
        >
          <span className="col-start-1 row-start-1 min-w-0">
            <span className="flex flex-wrap items-center gap-x-2">
              <span className="text-[15px] leading-snug font-medium">{title}</span>
              {notable && (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning/12 px-1.5 text-[11px] font-medium text-foreground">
                  <span className="size-1.5 rounded-full bg-warning" aria-hidden />
                  Notable change
                </span>
              )}
            </span>
            <span className="mt-0.5 block text-[13px] leading-relaxed text-muted-foreground">{summary}</span>
            <span className="mt-1 block text-xs text-tertiary-foreground">{technical}</span>
          </span>
          {value != null && (
            <span className="col-start-1 row-start-2 flex min-w-0 flex-wrap items-baseline gap-x-2 sm:col-start-2 sm:row-start-1 sm:block sm:max-w-56 sm:text-right">
              <span className="num block truncate text-[15px] font-medium">{value}</span>
              {change}
            </span>
          )}
          <ChevronRight
            className={cn(
              "col-start-2 row-start-1 mt-1 size-4 shrink-0 text-tertiary-foreground transition-transform duration-200 sm:col-start-3",
              expanded && "rotate-90"
            )}
            aria-hidden
          />
        </button>
        <PinButton pinned={pinned} onPin={onPin} name={title} />
      </div>
      {expanded && (
        <div id={panelId} className="fade-up bg-muted/40 px-4 pt-1 pb-5 sm:px-5">
          {children}
        </div>
      )}
    </li>
  )
}

function PinButton({ pinned, onPin, name }: { pinned: boolean; onPin: () => void; name: string }) {
  const Icon = pinned ? PinOff : Pin
  return (
    <button
      type="button"
      aria-pressed={pinned}
      aria-label={pinned ? `Unpin ${name} from your watchlist` : `Pin ${name} to your watchlist`}
      title={pinned ? "Unpin from watchlist" : "Pin to watchlist"}
      onClick={onPin}
      className={cn(
        "m-2 flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        pinned ? "bg-primary/12 text-primary" : "text-tertiary-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  )
}

function FieldChange({ change }: { change: number | null | undefined }) {
  if (change == null) return null
  const big = Math.abs(change) >= BIG_CHANGE
  return (
    <span className={cn("num mt-0.5 inline-flex items-center gap-1 text-xs", big ? "font-medium text-foreground" : "text-muted-foreground")}>
      {big && <span className="size-1.5 rounded-full bg-warning" aria-hidden />}
      {change > 0 ? "+" : ""}
      {formatPercent(change, 0)}
      <span className="sr-only">{big ? " (a change of 20% or more)" : ""}</span>
    </span>
  )
}

export function FieldRow({
  dataset,
  field,
  section,
  values,
  usedIn,
  notable,
  pinned,
  onPin,
  expanded,
  onToggle,
  context,
}: {
  dataset: HcaiDatasetId
  field: DictionaryField
  section: DictionarySection | undefined
  values: FieldValues | null
  /** Measures whose formula uses this field. */
  usedIn: DictionaryMetric[]
  /** Show the "Notable change" badge (off inside lists that are all notable). */
  notable: boolean
  pinned: boolean
  onPin: () => void
  expanded: boolean
  onToggle: () => void
  context: ValueContext
}) {
  const shown =
    values == null
      ? null
      : typeof values.current === "number" && !["text", "code", "date"].includes(field.unit)
        ? formatField(field.unit, values.current, { compact: true })
        : (values.current ?? "—")
  return (
    <DefinitionRow
      domId={`field-${field.code}`}
      title={field.label}
      summary={field.summary}
      technical={
        <>
          HCAI field <code className="font-mono">{field.code}</code>
        </>
      }
      value={shown}
      change={<FieldChange change={values?.change} />}
      notable={notable}
      pinned={pinned}
      onPin={onPin}
      expanded={expanded}
      onToggle={onToggle}
    >
      <FieldDetail dataset={dataset} field={field} section={section} values={values} usedIn={usedIn} context={context} />
    </DefinitionRow>
  )
}

export type MetricValues = { current: number | null; previous: number | null; history: { year: number; value: number | null }[] }

export function MetricRow({
  dataset,
  metric,
  values,
  inputs,
  pinned,
  onPin,
  expanded,
  onToggle,
  onJump,
  context,
}: {
  dataset: HcaiDatasetId
  metric: DictionaryMetric
  values: MetricValues | null
  inputs: DictionaryField[]
  pinned: boolean
  onPin: () => void
  expanded: boolean
  onToggle: () => void
  /** Open a source field in Browse all fields. */
  onJump: (code: string) => void
  context: ValueContext
}) {
  const t = metricTrend(metric, values)
  return (
    <DefinitionRow
      domId={`field-${metric.id}`}
      title={metric.label}
      summary={metric.summary}
      technical="Padua measure, calculated from HCAI fields"
      value={values ? formatMetric(metric, values.current) : null}
      change={
        t && values?.previous != null && values.current != null ? (
          <TrendText trend={t} rising={values.current > values.previous} className="mt-0.5 justify-end text-xs" />
        ) : null
      }
      notable={false}
      pinned={pinned}
      onPin={onPin}
      expanded={expanded}
      onToggle={onToggle}
    >
      <MetricDetail dataset={dataset} metric={metric} values={values} inputs={inputs} onJump={onJump} context={context} />
    </DefinitionRow>
  )
}

export function metricTrend(metric: DictionaryMetric, values: MetricValues | null) {
  if (!values || values.current == null || values.previous == null) return null
  return trend(directionOf(metric.id), values.previous, values.current, formatMetric(metric, values.previous) === formatMetric(metric, values.current))
}

// -- detail panel ---------------------------------------------------------------

function Block({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <h3 className="text-xs font-semibold tracking-wide text-tertiary-foreground uppercase">{title}</h3>
      {children}
    </div>
  )
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((d) => (
        <li key={d} className="flex gap-2.5 text-[13px] leading-relaxed text-muted-foreground">
          <span className="mt-2 size-1 shrink-0 rounded-full bg-tertiary-foreground" aria-hidden />
          {d}
        </li>
      ))}
    </ul>
  )
}

function Caution({ text }: { text: string }) {
  return (
    <p className="flex gap-2 rounded-lg bg-card px-3 py-2.5 text-[13px] leading-relaxed text-muted-foreground ring-1 ring-border">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
      <span>
        <span className="sr-only">Caution: </span>
        {text}
      </span>
    </p>
  )
}

const noHospital = (context: ValueContext) =>
  context.extract ? "Not in the uploaded file." : "Choose a hospital above to see its value and how it changed."

function FieldDetail({
  dataset,
  field,
  section,
  values,
  usedIn,
  context,
}: {
  dataset: HcaiDatasetId
  field: DictionaryField
  section: DictionarySection | undefined
  values: FieldValues | null
  usedIn: DictionaryMetric[]
  context: ValueContext
}) {
  const drivers = [...(field.drivers ?? []), ...(section?.drivers ?? [])]
  const caution = field.caution ?? section?.caution
  const numeric = typeof values?.current === "number" && !["text", "code", "date"].includes(field.unit)
  const big = values?.change != null && Math.abs(values.change) >= BIG_CHANGE
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4">
        <Block title="What it means">
          <p className="text-[13px] leading-relaxed">{field.summary}</p>
          {caution && <Caution text={caution} />}
        </Block>
        <Block title={context.extract ? "Value in the file" : `Current value${context.year != null ? ` (${context.year})` : ""}`}>
          {values ? (
            <p className="num text-[15px] font-medium">
              {numeric ? formatField(field.unit, values.current as number) : (values.current ?? "—")}
              {context.facilityName && !context.extract && <span className="ml-1.5 text-[13px] font-normal text-muted-foreground">{context.facilityName}</span>}
            </p>
          ) : (
            <p className="text-[13px] text-muted-foreground">{noHospital(context)}</p>
          )}
        </Block>
        {!context.extract && values && (
          <Block title="Recent change">
            {values.change != null && values.previous != null ? (
              <p className="text-[13px] leading-relaxed">
                <span className="num font-medium">
                  {values.change > 0 ? "+" : ""}
                  {formatPercent(values.change, 0)}
                </span>{" "}
                from {formatField(field.unit, values.previous)} in {context.prevYear}
                {big && <span className="text-muted-foreground"> — 20% or more; see what can move it below.</span>}
              </p>
            ) : (
              <p className="text-[13px] text-muted-foreground">No earlier year to compare with.</p>
            )}
            {values.history && values.history.length > 1 && numeric && <HistoryTable unit={field.unit} history={values.history} />}
          </Block>
        )}
        {drivers.length > 0 && (
          <Block title={big ? `Likely drivers of the ${context.prevYear}–${context.year} change` : "Likely drivers"}>
            <Bullets items={drivers} />
          </Block>
        )}
      </div>
      <div className="space-y-4">
        <Block title="Formula">
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            None: the hospital reports this number directly on HCAI&apos;s {REPORT_NAME[dataset]}. Padua shows it as reported.
          </p>
          {usedIn.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[13px]">Used in {usedIn.length === 1 ? "this measure" : "these measures"}:</p>
              {usedIn.map((m) => (
                <p key={m.id} className="rounded-lg bg-card px-3 py-2 text-xs leading-relaxed ring-1 ring-border">
                  <span className="font-medium">{m.label}</span> = <span className="font-mono">{m.formula}</span>
                </p>
              ))}
            </div>
          )}
        </Block>
        <Block title="Source field">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
            <dt className="text-muted-foreground">Field code</dt>
            <dd className="font-mono text-xs leading-5">{field.code}</dd>
            <dt className="text-muted-foreground">HCAI label</dt>
            <dd>{field.hcaiLabel}</dd>
            {section && (
              <>
                <dt className="text-muted-foreground">Section</dt>
                <dd>{section.title}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Unit</dt>
            <dd>{UNIT_LABEL[field.unit]}</dd>
            <dt className="text-muted-foreground">Source</dt>
            <dd>{DATASETS[dataset].label}</dd>
          </dl>
        </Block>
        <Block title="Where it’s used">
          <RelatedLinks metrics={usedIn} facilityId={context.facilityId} fallback="Not used in any Padua measure; it appears only here." />
        </Block>
      </div>
    </div>
  )
}

function MetricDetail({
  dataset,
  metric,
  values,
  inputs,
  onJump,
  context,
}: {
  dataset: HcaiDatasetId
  metric: DictionaryMetric
  values: MetricValues | null
  inputs: DictionaryField[]
  onJump: (code: string) => void
  context: ValueContext
}) {
  const t = metricTrend(metric, values)
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4">
        <Block title="What it means">
          <p className="text-[13px] leading-relaxed">{metric.summary}</p>
          {metric.caution && <Caution text={metric.caution} />}
        </Block>
        <Block title={`Current value${context.year != null ? ` (${context.year})` : ""}`}>
          {values ? (
            <p className="num text-[15px] font-medium">
              {formatMetric(metric, values.current)}
              {context.facilityName && <span className="ml-1.5 text-[13px] font-normal text-muted-foreground">{context.facilityName}</span>}
            </p>
          ) : (
            <p className="text-[13px] text-muted-foreground">{noHospital(context)}</p>
          )}
        </Block>
        {values && (
          <Block title="Recent change">
            {t && values.previous != null && values.current != null ? (
              <TrendText trend={t} rising={values.current > values.previous} className="text-[13px]">
                from {formatMetric(metric, values.previous)} in {context.prevYear}
              </TrendText>
            ) : (
              <p className="text-[13px] text-muted-foreground">No earlier year to compare with.</p>
            )}
          </Block>
        )}
        <Block title="Likely drivers">
          <Bullets items={metric.drivers} />
        </Block>
      </div>
      <div className="space-y-4">
        <Block title="Formula">
          <p className="rounded-lg bg-card px-3 py-2 font-mono text-xs leading-relaxed ring-1 ring-border">{metric.formula}</p>
        </Block>
        <Block title="Source fields">
          {inputs.length ? (
            <ul className="space-y-1">
              {inputs.map((f) => (
                <li key={f.code}>
                  <button
                    type="button"
                    onClick={() => onJump(f.code)}
                    className="text-left text-[13px] text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {f.label} <span className="font-mono text-xs text-muted-foreground">({f.code})</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted-foreground">Calculated from fields documented with the formula above.</p>
          )}
          <p className="text-xs text-muted-foreground">{DATASETS[dataset].label}</p>
        </Block>
        <Block title="Where it’s used">
          <RelatedLinks metrics={[metric]} facilityId={context.facilityId} fallback="Documented here only; not offered on Compare or in Reports." />
        </Block>
      </div>
    </div>
  )
}

/** Compare, Reports and Correlate links for the measures a field or measure feeds. */
function RelatedLinks({ metrics, facilityId, fallback }: { metrics: DictionaryMetric[]; facilityId: string | null; fallback: string }) {
  const offered = metrics.filter((m): m is DictionaryMetric & { category: MetricCategory } => m.category != null && m.unit !== "share")
  if (!offered.length) return <p className="text-[13px] text-muted-foreground">{fallback}</p>
  const q = (params: Record<string, string>) => new URLSearchParams({ ...(facilityId ? { facility: facilityId } : {}), ...params }).toString()
  return (
    <ul className="space-y-2">
      {offered.slice(0, 4).map((m) => {
        const compare = `/compare?${q({ ...(m.category !== "financial" ? { view: m.category } : {}), metrics: m.id, ...(m.lens ? { payer: m.lens } : {}) })}#metric-${m.id}`
        return (
          <li key={m.id} className="text-[13px]">
            {metrics.length > 1 && <span className="font-medium">{m.label}: </span>}
            <span className="inline-flex flex-wrap gap-x-3 gap-y-1">
              <RelatedLink href={compare}>Compare ({CATEGORY_BY_ID[m.category].label})</RelatedLink>
              <RelatedLink href={`/reports/build?${q({ metrics: m.id })}`}>Reports</RelatedLink>
              <RelatedLink href={`/reports/correlate?${q({ y: m.id })}`}>Correlate</RelatedLink>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function RelatedLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
      {children}
      <ExternalLink className="size-3 opacity-60" aria-hidden />
    </Link>
  )
}

function HistoryTable({ unit, history }: { unit: FieldUnit; history: NonNullable<FieldValues["history"]> }) {
  return (
    <table className="num mt-2 w-full max-w-sm text-[13px]">
      <caption className="sr-only">Values by report year</caption>
      <thead>
        <tr className="border-b border-border text-xs text-muted-foreground">
          <th scope="col" className="py-1 text-left font-medium">Year</th>
          <th scope="col" className="py-1 text-right font-medium">Value</th>
          <th scope="col" className="py-1 text-right font-medium">Change</th>
        </tr>
      </thead>
      <tbody>
        {history.map((h, i) => {
          const prev = history[i - 1]?.value
          const change = prev != null && h.value != null && prev !== 0 ? (h.value - prev) / Math.abs(prev) : null
          return (
            <tr key={h.year} className="border-b border-border last:border-0">
              <td className="py-1">
                {h.year}
                {h.annualized && <span title="Annualized from a partial-year report"> *</span>}
              </td>
              <td className="py-1 text-right whitespace-nowrap">{formatField(unit, h.value, { compact: true })}</td>
              <td className="py-1 pl-3 text-right whitespace-nowrap text-muted-foreground">
                {change == null ? "—" : `${change > 0 ? "+" : ""}${formatPercent(change, 0)}`}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
