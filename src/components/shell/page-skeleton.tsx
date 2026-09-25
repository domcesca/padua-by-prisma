/** Quiet placeholder shown while a tab's server data loads. */
export function PageSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="space-y-8" aria-busy aria-label="Loading">
      <div className="space-y-3">
        <div className="h-9 w-48 animate-pulse rounded-lg bg-black/5 dark:bg-white/10" />
        <div className="h-5 w-full max-w-lg animate-pulse rounded-lg bg-black/5 dark:bg-white/10" />
      </div>
      <div className="h-11 w-full animate-pulse rounded-xl bg-card shadow-card" />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="h-72 animate-pulse rounded-2xl bg-card shadow-card" />
        ))}
      </div>
    </div>
  )
}
