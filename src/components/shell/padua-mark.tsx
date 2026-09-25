import { cn } from "@/lib/utils"

/**
 * The Padua mark: a thin-line figure that takes the text color (currentColor), so one asset works on light and dark.
 * `size` is the rendered size in px; the stroke thickens below ~64px so the lines stay crisp instead of blurring
 * together (9 of 240 units at full size, about 1.5px on screen when small).
 */
export function PaduaMark({ size, className, title }: { size: number; className?: string; title?: string }) {
  const strokeWidth = Math.max(9, (1.6 * 240) / size)
  return (
    <svg
      viewBox="0 0 240 240"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn("shrink-0", className)}
    >
      <path d="M40 190 L200 190" />
      <path d="M40 190 L120 130" />
      <path d="M200 190 L120 130" />
      <path d="M40 190 L120 20" />
      <path d="M200 190 L120 20" />
      <path d="M120 130 L120 20" />
    </svg>
  )
}
