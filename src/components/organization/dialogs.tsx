"use client"

import { Check, Copy, TriangleAlert } from "lucide-react"
import { useActionState, useEffect, useId, useState } from "react"

import { addFacilityAction, inviteAction, removePersonAction, updatePersonAction } from "@/app/organization/actions"
import { FacilityPicker, type FacilityOption } from "@/components/benchmark/facility-picker"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import {
  canGrant,
  canRemove,
  canSetAccess,
  canSetManager,
  REFUSAL_TEXT,
  ROLE_TEXT,
  subtree,
  type Access,
  type Person,
} from "@/lib/org/permissions"
import type { OrgFacility, OrgPerson } from "@/lib/server/org"
import { cn } from "@/lib/utils"
import { AccessFields, type Grant } from "./access-fields"

// The console's dialogs (V7.6.5b): invite, edit a person, add a facility. Each posts to a server action; the database
// has the final say, and its refusal (in plain words) shows in the dialog. The rules in lib/org/permissions.ts are
// used here only to explain beforehand what can't be done.

export const primaryButton =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-primary-fill px-5 text-[14px] font-medium text-primary-foreground hover:bg-primary-fill/85 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
export const secondaryButton =
  "glass-subtle inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-5 text-[14px] font-medium hover:bg-white/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:hover:bg-white/10"
const inputClass =
  "h-11 w-full rounded-xl border border-input bg-white/70 px-3 text-[15px] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring aria-invalid:border-destructive dark:bg-white/5"

function Shell({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string; children: React.ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] gap-5 overflow-y-auto p-5 sm:max-w-lg sm:p-6">
        <div className="space-y-1.5 pr-8">
          <DialogTitle className="text-[19px] font-semibold tracking-tight">{title}</DialogTitle>
          <DialogDescription className="text-[14px] leading-relaxed">{description}</DialogDescription>
        </div>
        {children}
      </DialogContent>
    </Dialog>
  )
}

function Problem({ text }: { text: string | null | undefined }) {
  return (
    <p role="alert" className={cn("flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-[14px] text-destructive", !text && "sr-only")}>
      {text && <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
      {text}
    </p>
  )
}

// -------------------------------------------------------------------------------------------------------------- invite

export function InviteDialog({
  open,
  onOpenChange,
  actor,
  facilities,
  preset,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  actor: Access
  facilities: OrgFacility[]
  /** A pending invite to send again with a fresh link (the old one stops working). */
  preset?: { email: string } & Grant
}) {
  const [state, action, pending] = useActionState(inviteAction, null)
  const [grant, setGrant] = useState<Grant>(preset ?? { role: "member", scope: actor.scope, facilities: actor.scope === "facilities" ? actor.facilities.slice(0, 1) : [] })
  const [copied, setCopied] = useState(false)
  const id = useId()
  const refusal = canGrant(actor, { ...grant })
  const sent = state?.ok && state.link

  return (
    <Shell
      open={open}
      onOpenChange={onOpenChange}
      title={sent ? "Invite ready" : preset ? "Send a new invite link" : "Invite someone"}
      description={
        sent
          ? "Send this link to them yourself: Padua doesn't email invites yet."
          : preset
            ? `A new link for ${preset.email}. The old link stops working.`
            : "They'll get a link to set their password and join your organization with the role and access you choose here."
      }
    >
      {sent ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor={`${id}-link`} className="block text-[14px] font-medium">
              Invite link for {state.email}
            </label>
            <div className="flex gap-2">
              <input id={`${id}-link`} readOnly value={state.link} onFocus={(e) => e.currentTarget.select()} className={cn(inputClass, "font-mono text-[13px]")} />
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(state.link!).catch(() => {})
                  setCopied(true)
                }}
                className={cn(secondaryButton, "h-11 shrink-0 px-4")}
              >
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="text-[13px] text-muted-foreground" aria-live="polite">
              {copied ? "Copied. " : ""}It works once, for {state.email} only, and expires in 7 days. This is the only time Padua shows it; if it&apos;s lost,
              send a new link from Pending invites.
            </p>
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={() => onOpenChange(false)} className={primaryButton}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <form action={action} className="space-y-5">
          {preset ? (
            <input type="hidden" name="email" value={preset.email} />
          ) : (
            <div className="space-y-1.5">
              <label htmlFor={`${id}-email`} className="block text-[14px] font-semibold">
                Their work email
              </label>
              <input
                id={`${id}-email`}
                name="email"
                type="email"
                autoComplete="off"
                required
                aria-invalid={state?.field === "email"}
                className={inputClass}
              />
            </div>
          )}
          <AccessFields idPrefix={`${id}-access`} actor={actor} facilities={facilities} value={grant} onChange={setGrant} />
          {refusal && refusal !== "not-a-manager" && <p className="text-[13px] text-muted-foreground">{REFUSAL_TEXT[refusal]}</p>}
          <Problem text={state && !state.ok ? state.message : null} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => onOpenChange(false)} className={secondaryButton}>
              Cancel
            </button>
            <button type="submit" disabled={pending || !!refusal} className={primaryButton}>
              {pending ? "Creating link…" : preset ? "Create new link" : "Create invite link"}
            </button>
          </div>
        </form>
      )}
    </Shell>
  )
}

// ---------------------------------------------------------------------------------------------------------------- edit

export function EditPersonDialog({
  open,
  onOpenChange,
  actor,
  person,
  people,
  facilities,
  onDone,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  actor: Person
  person: OrgPerson
  people: OrgPerson[]
  facilities: OrgFacility[]
  onDone: (message: string) => void
}) {
  const [state, action, pending] = useActionState(updatePersonAction, null)
  const [removeState, removeAction, removing] = useActionState(removePersonAction, null)
  const [grant, setGrant] = useState<Grant>({ role: person.role, scope: person.scope, facilities: person.facilities })
  const [manager, setManager] = useState(person.managerId ?? "")
  const [confirmRemove, setConfirmRemove] = useState(false)
  const id = useId()
  const self = actor.id === person.id
  const owners = people.filter((p) => p.role === "owner").length
  const below = subtree(people, person.id)

  useEffect(() => {
    if (state?.ok) onDone(`${person.name}: saved.`)
    else if (removeState?.ok) onDone(`${person.name} was removed. They're signed out and can no longer see your organization.`)
  }, [state, removeState, onDone, person.name])

  const accessChanged = grant.role !== person.role || grant.scope !== person.scope || grant.facilities.join() !== person.facilities.join()
  const managerChanged = manager !== (person.managerId ?? "")
  const accessRefusal = accessChanged ? canSetAccess(actor, person, grant, owners) : null
  // A new manager is checked against the person as they'd be after the access change.
  const after = people.map((p) => (p.id === person.id ? { ...p, ...grant } : p))
  const managerRefusal = managerChanged ? canSetManager(actor, after, person.id, manager || null) : null
  const removeRefusal = canRemove(actor, person, owners)
  const direct = people.filter((p) => p.managerId === person.id).length
  const theirManager = people.find((p) => p.id === person.managerId)?.name

  return (
    <Shell
      open={open}
      onOpenChange={onOpenChange}
      title={self ? "Your role and access" : `Edit ${person.name}`}
      description={self ? "You can narrow your own access or step down, but not give yourself more." : `${person.email} · currently ${ROLE_TEXT[person.role].label.toLowerCase()}`}
    >
      {confirmRemove ? (
        <form action={removeAction} className="space-y-4">
          <input type="hidden" name="id" value={person.id} />
          <p className="text-[15px] leading-relaxed">
            Remove <strong>{person.name}</strong> from the organization? They&apos;ll be signed out at once and lose access to its data.
            {direct > 0 && ` The ${direct === 1 ? "person" : `${direct} people`} reporting directly to them will report to ${theirManager ?? "no one"} instead.`}
          </p>
          <Problem text={removeState && !removeState.ok ? removeState.message : null} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setConfirmRemove(false)} className={secondaryButton}>
              Keep {person.name.split(" ")[0]}
            </button>
            <button
              type="submit"
              disabled={removing}
              className="inline-flex h-10 items-center justify-center rounded-full bg-destructive/12 px-5 text-[14px] font-semibold text-destructive hover:bg-destructive/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
            >
              {removing ? "Removing…" : "Remove from organization"}
            </button>
          </div>
        </form>
      ) : (
        <form action={action} className="space-y-6">
          <input type="hidden" name="id" value={person.id} />
          {/* Only what changed is sent: re-saving an unchanged reporting line would re-check it, and could refuse a
              role change over a chain the actor didn't touch. */}
          {accessChanged && <input type="hidden" name="accessChanged" value="1" />}
          {managerChanged && <input type="hidden" name="managerChanged" value="1" />}
          <AccessFields idPrefix={`${id}-access`} actor={actor} facilities={facilities} value={grant} onChange={setGrant} />
          {accessRefusal && <p className="text-[13px] font-medium text-destructive">{REFUSAL_TEXT[accessRefusal]}</p>}

          <div className="space-y-1.5">
            <label htmlFor={`${id}-manager`} className="block text-[14px] font-semibold">
              Reports to
            </label>
            <select
              id={`${id}-manager`}
              name="manager"
              value={manager}
              onChange={(e) => setManager(e.target.value)}
              aria-describedby={`${id}-manager-hint`}
              className={cn(inputClass, "pr-8")}
            >
              <option value="">No one</option>
              {people
                .filter((p) => p.id !== person.id)
                .map((p) => (
                  <option key={p.id} value={p.id} disabled={below.has(p.id)}>
                    {p.name}
                    {below.has(p.id) ? " (reports to them)" : ""}
                  </option>
                ))}
            </select>
            <p id={`${id}-manager-hint`} className="text-[13px] text-muted-foreground">
              Managers can see their reports&apos; work, all the way down the chain, and hand it on. They can&apos;t change it.
            </p>
            {managerRefusal && <p className="text-[13px] font-medium text-destructive">{REFUSAL_TEXT[managerRefusal]}</p>}
          </div>

          <Problem text={state && !state.ok ? state.message : null} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            {!self && (
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                disabled={!!removeRefusal}
                title={removeRefusal ? REFUSAL_TEXT[removeRefusal] : undefined}
                className="h-10 rounded-full px-4 text-[14px] font-medium text-destructive hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:mr-auto"
              >
                Remove from organization…
              </button>
            )}
            <button type="button" onClick={() => onOpenChange(false)} className={secondaryButton}>
              Cancel
            </button>
            <button type="submit" disabled={pending || !!accessRefusal || !!managerRefusal || (!accessChanged && !managerChanged)} className={primaryButton}>
              {pending ? "Saving…" : "Save changes"}
            </button>
          </div>
          {!self && removeRefusal && removeRefusal !== "self-remove" && <p className="text-[13px] text-muted-foreground">Can&apos;t remove: {REFUSAL_TEXT[removeRefusal]}</p>}
        </form>
      )}
    </Shell>
  )
}

// -------------------------------------------------------------------------------------------------------- add facility

export function AddFacilityDialog({
  open,
  onOpenChange,
  hospitals,
  latestYear,
  onDone,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** California hospitals not already in the organization. */
  hospitals: FacilityOption[]
  latestYear: number
  onDone: (message: string) => void
}) {
  const [state, action, pending] = useActionState(addFacilityAction, null)
  const [hcai, setHcai] = useState<string | null>(null)
  useEffect(() => {
    if (state?.ok && state.message) onDone(state.message)
  }, [state, onDone])
  return (
    <Shell
      open={open}
      onOpenChange={onOpenChange}
      title="Add a facility"
      description="Another hospital in your organization. Everyone with whole-organization access sees it straight away; add it to others' access by editing them."
    >
      <form action={action} className="space-y-5">
        <div className="space-y-1.5">
          <p id="add-facility-label" className="text-[14px] font-semibold">
            Hospital
          </p>
          <div role="group" aria-labelledby="add-facility-label">
            <FacilityPicker facilities={hospitals} value={hcai} onChange={setHcai} latestYear={latestYear} placeholder="Search California hospitals" />
          </div>
          <input type="hidden" name="hcai" value={hcai ?? ""} />
        </div>
        <Problem text={state && !state.ok ? state.message : null} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => onOpenChange(false)} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" disabled={pending || !hcai} className={primaryButton}>
            {pending ? "Adding…" : "Add facility"}
          </button>
        </div>
      </form>
    </Shell>
  )
}
