import { FlaskConical } from "lucide-react"

/** Marks a test hospital (V7.6.5c): made-up data, private to the organization. */
export function TestBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold">
      <FlaskConical className="size-3" aria-hidden />
      Test hospital
    </span>
  )
}
