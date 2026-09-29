// Fill patterns for bars, so the groups in a grouped bar chart differ by pattern as well as color and position (WCAG
// 1.4.1), as lines already differ by marker shape (series-marker.tsx) and scenarios by dashing. One vocabulary for
// every bar in the app: the selected hospital is solid, the peer figure is dotted, and further hospitals take
// diagonal, cross-hatched, horizontal and reverse-diagonal lines in turn (vertical lines were tried and vanish in a narrow bar). The marks are drawn in the card color, so they read
// in light, dark and print alike.
//
// SVG charts (Recharts) put <PatternDefs> inside the chart and fill with patternUrl(); HTML bars use patternStyle().

export type FillPattern = "solid" | "dots" | "diagonal" | "cross" | "horizontal" | "backslash"

/** Patterns for the hospitals in a chart, in order: the selected one first. */
export const HOSPITAL_PATTERNS: FillPattern[] = ["solid", "diagonal", "cross", "horizontal", "backslash"]
/** The peer group's figure (median or average). */
export const PEER_PATTERN: FillPattern = "dots"

export const hospitalPattern = (index: number) => HOSPITAL_PATTERNS[Math.min(Math.max(index, 0), HOSPITAL_PATTERNS.length - 1)]

const TILE = 5
const MARK = "var(--card)"

/** The <defs> a Recharts chart needs for its patterned fills; `id` must be unique on the page (useId). */
export function PatternDefs({ id, fills }: { id: string; fills: { key: string; color: string; pattern: FillPattern; opacity?: number }[] }) {
  return (
    <defs>
      {fills
        .filter((f) => f.pattern !== "solid")
        .map((f) => (
          <pattern
            key={f.key}
            id={patternId(id, f.key)}
            width={TILE}
            height={TILE}
            patternUnits="userSpaceOnUse"
            patternTransform={f.pattern === "diagonal" || f.pattern === "cross" ? "rotate(45)" : f.pattern === "backslash" ? "rotate(-45)" : undefined}
          >
            <rect width={TILE} height={TILE} fill={f.color} fillOpacity={f.opacity ?? 1} />
            {f.pattern === "dots" && <circle cx={TILE / 2} cy={TILE / 2} r={1.1} fill={MARK} />}
            {(f.pattern === "diagonal" || f.pattern === "cross" || f.pattern === "backslash") && (
              <line x1={TILE / 2} y1={0} x2={TILE / 2} y2={TILE} stroke={MARK} strokeWidth={1.5} />
            )}
            {(f.pattern === "cross" || f.pattern === "horizontal") && (
              <line x1={0} y1={TILE / 2} x2={TILE} y2={TILE / 2} stroke={MARK} strokeWidth={1.5} />
            )}
          </pattern>
        ))}
    </defs>
  )
}

const patternId = (id: string, key: string) => `${id.replace(/[^\w-]/g, "")}-fill-${key.replace(/[^\w-]/g, "")}`

/** The fill for a bar: the plain color when solid, otherwise its pattern from PatternDefs. */
export const patternUrl = (id: string, key: string, pattern: FillPattern, color: string) =>
  pattern === "solid" ? color : `url(#${patternId(id, key)})`

/** The same pattern for an HTML bar or a legend swatch, as a CSS background. */
export function patternStyle(pattern: FillPattern, color: string): React.CSSProperties {
  const line = (angle: number) => `repeating-linear-gradient(${angle}deg, transparent 0 ${TILE / 2 - 0.75}px, ${MARK} ${TILE / 2 - 0.75}px ${TILE / 2 + 0.75}px, transparent ${TILE / 2 + 0.75}px ${TILE}px)`
  switch (pattern) {
    case "solid":
      return { backgroundColor: color }
    case "dots":
      return { backgroundColor: color, backgroundImage: `radial-gradient(circle, ${MARK} 1px, transparent 1.4px)`, backgroundSize: `${TILE}px ${TILE}px` }
    // CSS stripes run across the gradient's direction: −45deg draws "/", like the SVG's rotate(45); 45deg draws "\".
    case "diagonal":
      return { backgroundColor: color, backgroundImage: line(-45) }
    case "cross":
      return { backgroundColor: color, backgroundImage: `${line(45)}, ${line(-45)}` }
    case "horizontal":
      return { backgroundColor: color, backgroundImage: line(0) }
    case "backslash":
      return { backgroundColor: color, backgroundImage: line(45) }
  }
}

/** A legend swatch in a bar's color and pattern. */
export function PatternSwatch({ pattern, color, className }: { pattern: FillPattern; color: string; className?: string }) {
  return <span aria-hidden className={className ?? "size-3 shrink-0 rounded-[3px]"} style={patternStyle(pattern, color)} />
}
