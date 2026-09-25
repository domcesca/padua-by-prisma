"use client";

import { formatUsd } from "@/lib/format";
import type { Sensitivity, SensitivityBar } from "@/lib/propose/analysis";
import { cn } from "@/lib/utils";

// Tornado chart: one row per input, ranked by how far a ±swing moves the outcome. Bars grow left (outcome falls) or
// right (outcome rises) from the base case at the center line; color says which end of the input produced it
// (lowered or raised), so a cost bar and a volume bar can point opposite ways and still read correctly.

export const LOWERED = "var(--series-2)";
export const RAISED = "var(--series-1)";

const signed = (n: number, outcome: Sensitivity["outcome"]) =>
  outcome === "roi"
    ? `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n * 100).toFixed(1)} pts`
    : `${n > 0 ? "+" : n < 0 ? "" : "±"}${formatUsd(n, { compact: true })}`;

export const formatOutcome = (n: number, outcome: Sensitivity["outcome"]) =>
  outcome === "roi"
    ? `${(n * 100).toFixed(1)}%`
    : formatUsd(n, { compact: true });

export function SensitivityChart({ result }: { result: Sensitivity }) {
  const { bars, base, outcome, swing } = result;
  const max = Math.max(
    ...bars.flatMap((b) => [Math.abs(b.low - base), Math.abs(b.high - base)]),
    1e-9,
  );
  return (
    <div>
      <div
        className="flex flex-wrap gap-x-4 gap-y-1 pb-3 text-xs text-muted-foreground"
        aria-hidden
      >
        <span className="inline-flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-sm"
            style={{ background: LOWERED }}
          />{" "}
          Input lowered {swing}%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-sm"
            style={{ background: RAISED }}
          />{" "}
          Input raised {swing}%
        </span>
      </div>
      <ul className="space-y-2.5" aria-hidden>
        {bars.map((b) => (
          <Row
            key={b.id}
            bar={b}
            base={base}
            max={max}
            outcome={outcome}
            swing={swing}
          />
        ))}
      </ul>
      <div
        className="mt-1 grid grid-cols-[minmax(0,11rem)_1fr] gap-3 max-sm:grid-cols-1"
        aria-hidden
      >
        <span className="max-sm:hidden" />
        <p className="text-center text-[11px] text-muted-foreground">
          Center line: {outcome === "roi" ? "ROI" : "NPV"} as entered,{" "}
          {formatOutcome(base, outcome)}
        </p>
      </div>
      {/* The same numbers as a table, for screen readers. */}
      <div className="sr-only">
        <table>
          <caption>
            {outcome === "roi" ? "ROI" : "NPV"} with each input lowered and
            raised {swing}%, largest effect first. As entered:{" "}
            {formatOutcome(base, outcome)}.
          </caption>
          <thead>
            <tr>
              <th scope="col">Input</th>
              <th scope="col">Lowered {swing}%</th>
              <th scope="col">Raised {swing}%</th>
            </tr>
          </thead>
          <tbody>
            {bars.map((b) => (
              <tr key={b.id}>
                <th scope="row">{b.label}</th>
                <td>{formatOutcome(b.low, outcome)}</td>
                <td>{formatOutcome(b.high, outcome)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({
  bar,
  base,
  max,
  outcome,
  swing,
}: {
  bar: SensitivityBar;
  base: number;
  max: number;
  outcome: Sensitivity["outcome"];
  swing: number;
}) {
  const ends = [
    {
      key: "low",
      delta: bar.low - base,
      value: bar.low,
      color: LOWERED,
      text: bar.lowText ?? `−${swing}%`,
    },
    {
      key: "high",
      delta: bar.high - base,
      value: bar.high,
      color: RAISED,
      text: bar.highText ?? `+${swing}%`,
    },
  ];
  // Draw the longer bar first so a shorter one on the same side sits on top of it.
  const drawn = [...ends].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return (
    <li className="grid grid-cols-[minmax(0,11rem)_1fr] items-center gap-3 max-sm:grid-cols-1 max-sm:gap-1">
      <p className="min-w-0 text-[13px] leading-tight">
        {bar.label}
        {bar.lowText && (
          <span className="num block text-[11px] text-muted-foreground">
            {bar.lowText} vs {bar.highText}
          </span>
        )}
      </p>
      <div className="relative h-7">
        <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
        {drawn.map((e) => {
          const width = (Math.abs(e.delta) / max) * 50;
          const left = e.delta < 0;
          return (
            <span
              key={e.key}
              tabIndex={0}
              className={cn(
                "group absolute top-1/2 h-4 -translate-y-1/2 ring-2 ring-background outline-none focus-visible:ring-ring print:ring-0",
                left ? "rounded-l" : "rounded-r",
              )}
              style={{
                background: e.color,
                width: `${Math.max(width, 0.4)}%`,
                ...(left ? { right: "50%" } : { left: "50%" }),
              }}
            >
              <span
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 rounded-lg bg-popover px-2.5 py-1.5 text-[12px] whitespace-nowrap text-popover-foreground shadow-lg ring-1 ring-border group-hover:block group-focus-visible:block"
              >
                {bar.label} {e.text}:{" "}
                <span className="num font-medium">
                  {formatOutcome(e.value, outcome)}
                </span>{" "}
                ({signed(e.delta, outcome)})
              </span>
            </span>
          );
        })}
        {ends.map((e) => {
          if (Math.abs(e.delta) < 1e-9) return null;
          const width = (Math.abs(e.delta) / max) * 50;
          const left = e.delta < 0;
          // The change, just past the end of its bar (inside it when the bar is long enough to crowd the edge).
          const inside = width > 38;
          const pos = inside
            ? 50 + (left ? -1 : 1) * (width - 1)
            : 50 + (left ? -1 : 1) * (width + 1);
          const sameSide = ends.filter(
            (x) => Math.sign(x.delta) === Math.sign(e.delta),
          );
          // Two ends on the same side: label only the longer one.
          if (
            sameSide.length > 1 &&
            Math.abs(e.delta) <
              Math.max(...sameSide.map((x) => Math.abs(x.delta)))
          )
            return null;
          return (
            <span
              key={e.key}
              className={cn(
                "num absolute top-1/2 -translate-y-1/2 text-[11px] whitespace-nowrap",
                inside ? "font-medium text-white" : "text-muted-foreground",
                left !== inside ? "-translate-x-full" : "",
              )}
              style={{ left: `${pos}%` }}
            >
              {signed(e.delta, outcome)}
            </span>
          );
        })}
      </div>
    </li>
  );
}
