import Link from "next/link"

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <p className="text-lg font-semibold tracking-tight">This page doesn’t exist.</p>
      <p className="mt-2 text-sm text-muted-foreground">It may have moved, or the link may be mistyped.</p>
      <Link
        href="/benchmark"
        className="mt-6 inline-block btn-accent rounded-full px-4 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        Go to Benchmark
      </Link>
    </div>
  )
}
