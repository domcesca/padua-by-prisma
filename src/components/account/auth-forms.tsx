"use client"

import Link from "next/link"
import { useActionState, useEffect, useRef, useState } from "react"

import { acceptInviteAction, signIn, signUp, type FormState } from "@/app/account/actions"
import { FacilityPicker, type FacilityOption } from "@/components/benchmark/facility-picker"
import { cn } from "@/lib/utils"

// Sign-up and sign-in forms (V7.6.5a). Plain forms posting to server actions: they work before the page's scripts
// load, and every error comes back from the server, tied to its field.

const inputClass =
  "h-11 w-full rounded-xl border border-input bg-white/70 px-3 text-[15px] outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring aria-invalid:border-destructive dark:bg-white/5"
const submitClass =
  "inline-flex h-11 w-full items-center justify-center rounded-full bg-primary-fill px-5 text-[15px] font-medium text-primary-foreground hover:bg-primary-fill/85 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  children: (describedBy: string | undefined) => React.ReactNode
}) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[14px] font-medium">
        {label}
      </label>
      {children(describedBy)}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-[13px] font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

function FormMessage({ state }: { state: FormState }) {
  return (
    <p role="alert" className={cn("text-[14px] font-medium text-destructive", !state?.message && "sr-only")}>
      {state?.message ?? (state?.errors && Object.keys(state.errors).length ? "Check the fields marked below." : "")}
    </p>
  )
}

/** After a failed submit, focus the first field with an error, so a keyboard or screen reader lands on it. */
function useFocusFirstError(state: FormState) {
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (!state?.errors) return
    const first = ref.current?.querySelector<HTMLElement>("[aria-invalid=true], [data-invalid] button")
    first?.focus()
  }, [state])
  return ref
}

export function SignUpForm({ facilities, latestYear }: { facilities: FacilityOption[]; latestYear: number }) {
  const [state, action, pending] = useActionState(signUp, null)
  const formRef = useFocusFirstError(state)
  const [facility, setFacility] = useState<string | null>(null)
  const v = state?.values ?? {}
  const e = state?.errors ?? {}
  const facilityValue = facility ?? v.facility ?? null
  return (
    <form ref={formRef} action={action} noValidate className="space-y-5">
      <Field id="name" label="Your name" error={e.name}>
        {(d) => <input id="name" name="name" autoComplete="name" required defaultValue={v.name} aria-invalid={!!e.name} aria-describedby={d} className={inputClass} />}
      </Field>
      <Field id="email" label="Work email" error={e.email}>
        {(d) => (
          <input id="email" name="email" type="email" autoComplete="email" required defaultValue={v.email} aria-invalid={!!e.email} aria-describedby={d} className={inputClass} />
        )}
      </Field>
      <Field id="password" label="Password" hint="At least 12 characters. A short phrase is easier to remember than symbols." error={e.password}>
        {(d) => (
          <input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} aria-invalid={!!e.password} aria-describedby={d} className={inputClass} />
        )}
      </Field>
      <Field id="organization" label="Organization" hint="Your hospital, or the health system it belongs to." error={e.organization}>
        {(d) => (
          <input
            id="organization"
            name="organization"
            autoComplete="organization"
            required
            defaultValue={v.organization}
            aria-invalid={!!e.organization}
            aria-describedby={d}
            className={inputClass}
          />
        )}
      </Field>
      <div className="space-y-1.5">
        <p id="facility-label" className="text-[14px] font-medium">
          Your hospital
        </p>
        <div role="group" aria-labelledby="facility-label" aria-describedby={e.facility ? "facility-hint facility-error" : "facility-hint"} data-invalid={e.facility ? "" : undefined}>
          <FacilityPicker facilities={facilities} value={facilityValue} onChange={setFacility} latestYear={latestYear} placeholder="Search California hospitals" />
        </div>
        <input type="hidden" name="facility" value={facilityValue ?? ""} />
        <p id="facility-hint" className="text-xs text-muted-foreground">
          The first facility in your organization. Health systems will be able to add their other hospitals later.
        </p>
        {e.facility && (
          <p id="facility-error" className="text-[13px] font-medium text-destructive">
            {e.facility}
          </p>
        )}
      </div>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className={submitClass}>
        {pending ? "Creating your account…" : "Create account"}
      </button>
      <p className="text-center text-[14px] text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  )
}

export function SignInForm({ next, notice }: { next: string; notice: string | null }) {
  const [state, action, pending] = useActionState(signIn, null)
  return (
    <form action={action} noValidate className="space-y-5">
      {notice && !state && (
        <p role="status" className="rounded-xl bg-favorable/10 px-3 py-2 text-[14px] text-favorable">
          {notice}
        </p>
      )}
      <input type="hidden" name="next" value={next} />
      <Field id="email" label="Work email">
        {(d) => <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state?.values?.email} aria-describedby={d} className={inputClass} />}
      </Field>
      <Field id="password" label="Password">
        {(d) => <input id="password" name="password" type="password" autoComplete="current-password" required aria-describedby={d} className={inputClass} />}
      </Field>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className={submitClass}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-[14px] text-muted-foreground">
        New to Padua?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  )
}

export function AcceptInviteForm({ token, email, expiresAt }: { token: string; email: string; expiresAt: string }) {
  const [state, action, pending] = useActionState(acceptInviteAction, null)
  const formRef = useFocusFirstError(state)
  const e = state?.errors ?? {}
  return (
    <form ref={formRef} action={action} noValidate className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <div className="space-y-1.5">
        <p className="text-[14px] font-medium">Email</p>
        <p className="text-[15px]">{email}</p>
        <p className="text-xs text-muted-foreground">The invite is for this address. You&apos;ll sign in with it.</p>
      </div>
      <Field id="name" label="Your name" error={e.name}>
        {(d) => <input id="name" name="name" autoComplete="name" required defaultValue={state?.values?.name} aria-invalid={!!e.name} aria-describedby={d} className={inputClass} />}
      </Field>
      <Field id="password" label="Choose a password" hint="At least 12 characters. A short phrase is easier to remember than symbols." error={e.password}>
        {(d) => (
          <input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} aria-invalid={!!e.password} aria-describedby={d} className={inputClass} />
        )}
      </Field>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className={submitClass}>
        {pending ? "Joining…" : "Join organization"}
      </button>
      <p className="text-center text-xs text-muted-foreground">
        This invite expires {new Date(expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric" })} and works once.
      </p>
    </form>
  )
}
