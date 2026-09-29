import { cn } from "@/lib/utils"

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  className,
}: {
  title: string
  /** A small label above the title, e.g. "Advanced analysis". */
  eyebrow?: string
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="space-y-1.5">
        {eyebrow && <p className="text-xs font-semibold tracking-wide text-tertiary-foreground uppercase">{eyebrow}</p>}
        <h1 className="text-[28px] leading-tight font-semibold tracking-tight sm:text-[32px]">{title}</h1>
        {description && (
          <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
