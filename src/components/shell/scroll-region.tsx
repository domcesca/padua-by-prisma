import { cn } from "@/lib/utils"

// A box that scrolls (a long table): focusable and named, so a keyboard user can tab to it and scroll it with the
// arrow keys, and a screen reader says what it is (WCAG 2.1.1). With `scroll={false}` it's a plain wrapper, for the
// screen-reader copies of a chart's table, which never scroll and shouldn't add a tab stop.
export function ScrollRegion({
  label,
  scroll = true,
  className,
  children,
}: {
  label: string
  scroll?: boolean
  className?: string
  children: React.ReactNode
}) {
  if (!scroll) return <div>{children}</div>
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn("rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
    >
      {children}
    </div>
  )
}
