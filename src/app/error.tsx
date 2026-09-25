"use client"

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <p className="text-lg font-semibold tracking-tight">Something went wrong loading this page.</p>
      <p className="mt-2 text-sm text-muted-foreground">
        The data may be temporarily unavailable. Try again, or pick a different tab.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        Try again
      </button>
    </div>
  )
}
