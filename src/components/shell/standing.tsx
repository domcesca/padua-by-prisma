import { ArrowDownRight, ArrowRight, ArrowUpRight, CircleAlert, CircleCheck, Equal, Scale, Users } from "lucide-react"

import { STANDING_LABEL, STANDING_SHORT, toneOf, TREND_LABEL, type Standing, type Tone, type Trend } from "@/lib/favorability"
import { cn } from "@/lib/utils"

// Padua's comparison vocabulary on screen (lib/favorability). Every label is words plus an icon; color only
// reinforces it, and favorable / unfavorable use the same two colors in every tool.

const TONE_TEXT: Record<Tone, string> = {
  favorable: "text-favorable",
  unfavorable: "text-unfavorable",
  neutral: "text-muted-foreground",
}
const TONE_FILL: Record<Tone, string> = {
  favorable: "bg-favorable/10 text-favorable",
  unfavorable: "bg-unfavorable/10 text-unfavorable",
  neutral: "bg-black/5 text-muted-foreground dark:bg-white/8",
}

const STANDING_ICON = {
  favorable: CircleCheck,
  unfavorable: CircleAlert,
  similar: Equal,
  depends: Scale,
  fewPeers: Users,
} satisfies Record<Standing, unknown>

/** "Favorable", "Similar to peers", … as a small pill. */
export function StandingBadge({
  standing,
  short = false,
  title,
  className,
}: {
  standing: Standing
  /** The short wording, for table cells. */
  short?: boolean
  /** Why (e.g. why a context metric isn't judged); shown on hover and read by screen readers. */
  title?: string
  className?: string
}) {
  const Icon = STANDING_ICON[standing]
  const tone = toneOf(standing)
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs leading-tight font-medium whitespace-nowrap",
        TONE_FILL[tone],
        className
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {short ? STANDING_SHORT[standing] : STANDING_LABEL[standing]}
      {title && <span className="sr-only">. {title}</span>}
    </span>
  )
}

const TREND_ICON = {
  improving: null,
  worsening: null,
  unchanged: ArrowRight,
  up: ArrowUpRight,
  down: ArrowDownRight,
} satisfies Record<Trend, unknown>

/** An arrow and a word: "↗ Improving", "↘ Worsening", "↗ Up" (context metrics), "→ Unchanged". */
export function TrendText({
  trend,
  rising,
  children,
  className,
}: {
  trend: Trend
  /** Whether the value went up (sets the arrow for improving / worsening). */
  rising: boolean
  /** What changed, after the word: "from 4.1 in 2023". */
  children?: React.ReactNode
  className?: string
}) {
  const Icon = TREND_ICON[trend] ?? (rising ? ArrowUpRight : ArrowDownRight)
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1 text-xs", className)}>
      <span className={cn("inline-flex items-center gap-0.5 font-medium", TONE_TEXT[toneOf(trend)])}>
        <Icon className="size-3.5 shrink-0" aria-hidden />
        {TREND_LABEL[trend]}
      </span>
      {children && <span className="text-muted-foreground">{children}</span>}
    </span>
  )
}

/** Text color for a favorable / unfavorable number, for places that already say which it is in words. */
export const toneText = (tone: Tone) => TONE_TEXT[tone]
