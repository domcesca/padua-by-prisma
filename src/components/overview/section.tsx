import type { LucideIcon } from "lucide-react"
import { ArrowRight } from "lucide-react"
import Link from "next/link"

import { cn } from "@/lib/utils"

// One Overview section: an icon, a title, a line on what it shows, an optional link to the full page, and its body.

export function OverviewSection({
  id,
  icon: Icon,
  title,
  description,
  link,
  busy = false,
  className,
  children,
}: {
  id: string
  icon: LucideIcon
  title: string
  description?: React.ReactNode
  link?: { href: string; label: string } | null
  busy?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={id} aria-busy={busy} className={cn("widget fade-up flex flex-col gap-3 p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden>
            <Icon className="size-4" strokeWidth={2} />
          </span>
          <div className="min-w-0 space-y-0.5">
            <h2 id={id} className="text-[17px] leading-tight font-semibold tracking-tight">
              {title}
            </h2>
            {description && <p className="text-[13px] text-muted-foreground">{description}</p>}
          </div>
        </div>
        {link && (
          <Link
            href={link.href}
            className="inline-flex items-center gap-1 rounded pt-1 text-[13px] font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {link.label}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

/** A section with nothing to show yet: what that means and, where there is one, what to do about it. */
export function SectionEmpty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-black/4 px-4 py-3.5 dark:bg-white/6" role="status">
      <p className="text-[14px] font-medium">{title}</p>
      {children && <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{children}</p>}
    </div>
  )
}

export function SectionError({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
      {message}{" "}
      {retry && (
        <button type="button" onClick={retry} className="rounded font-medium underline outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Try again
        </button>
      )}
    </div>
  )
}

export function SectionLoading({ label, rows = 2 }: { label: string; rows?: number }) {
  return (
    <div className="space-y-2.5" aria-busy="true">
      <p className="sr-only" role="status">
        {label}
      </p>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="space-y-1.5">
          <div className="h-4 w-2/3 animate-pulse rounded bg-black/6 dark:bg-white/8" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-black/5 dark:bg-white/6" />
        </div>
      ))}
    </div>
  )
}
