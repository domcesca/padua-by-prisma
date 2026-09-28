// Point markers that tell chart series apart by shape as well as color (WCAG 1.4.1): the first hospital a circle,
// then a square, triangle, diamond and cross. The chart's dots and its legend swatch use the same shape.

export const MARKER_SHAPES = ["circle", "square", "triangle", "diamond", "cross"] as const
export type MarkerShape = (typeof MARKER_SHAPES)[number]

export const markerOf = (index: number): MarkerShape => MARKER_SHAPES[index % MARKER_SHAPES.length]

/** One marker centred on (cx, cy), about `r` in radius. */
export function MarkerShapeSvg({
  shape,
  cx,
  cy,
  r,
  fill,
  stroke,
  strokeWidth = 0,
}: {
  shape: MarkerShape
  cx: number
  cy: number
  r: number
  fill: string
  stroke?: string
  strokeWidth?: number
}) {
  const common = { fill, stroke, strokeWidth }
  switch (shape) {
    case "square":
      return <rect x={cx - r * 0.9} y={cy - r * 0.9} width={r * 1.8} height={r * 1.8} rx={0.8} {...common} />
    case "triangle":
      return <polygon points={`${cx},${cy - r * 1.15} ${cx + r * 1.1},${cy + r * 0.85} ${cx - r * 1.1},${cy + r * 0.85}`} {...common} />
    case "diamond":
      return <polygon points={`${cx},${cy - r * 1.25} ${cx + r * 1.1},${cy} ${cx},${cy + r * 1.25} ${cx - r * 1.1},${cy}`} {...common} />
    case "cross": {
      const a = r * 1.1
      const t = r * 0.42
      return (
        <polygon
          points={[
            [cx - t, cy - a], [cx + t, cy - a], [cx + t, cy - t], [cx + a, cy - t], [cx + a, cy + t], [cx + t, cy + t],
            [cx + t, cy + a], [cx - t, cy + a], [cx - t, cy + t], [cx - a, cy + t], [cx - a, cy - t], [cx - t, cy - t],
          ].map((p) => p.join(",")).join(" ")}
          {...common}
        />
      )
    }
    default:
      return <circle cx={cx} cy={cy} r={r} {...common} />
  }
}

/** The legend's swatch: a short line with the series' marker on it. */
export function MarkerSwatch({ shape, color }: { shape: MarkerShape; color: string }) {
  return (
    <svg width="18" height="10" viewBox="0 0 18 10" aria-hidden className="shrink-0 overflow-visible">
      <line x1="0" y1="5" x2="18" y2="5" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <MarkerShapeSvg shape={shape} cx={9} cy={5} r={3.4} fill={color} />
    </svg>
  )
}
