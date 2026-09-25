/**
 * A polite screen-reader announcement that stays mounted, so changes to its text are read out: what's loading, then
 * what came back ("Showing 4 metrics for Cedars-Sinai Medical Center against 22 peers").
 */
export function LiveStatus({ message }: { message: string }) {
  return (
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </p>
  )
}
