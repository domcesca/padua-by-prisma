import { cn } from "@/lib/utils"

/** Marks an input as public-data-backed or the proposer's own assumption, so nobody mistakes one for the other. */
export function SourceTag({ kind, children, className }: { kind: "data" | "assumption"; children?: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs leading-none font-medium whitespace-nowrap",
        kind === "data" ? "bg-primary/10 text-primary" : "bg-black/5 text-muted-foreground dark:bg-white/8",
        className
      )}
    >
      {children ?? (kind === "data" ? "Public data" : "Your assumption")}
    </span>
  )
}
