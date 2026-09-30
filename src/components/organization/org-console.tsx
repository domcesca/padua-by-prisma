"use client"

import { Building2, Lock, Mail, Plus, UserPlus, Users } from "lucide-react"
import { useActionState, useState } from "react"

import { revokeInviteAction } from "@/app/organization/actions"
import type { FacilityOption } from "@/components/benchmark/facility-picker"
import { Segmented } from "@/components/shell/segmented"
import { canAddFacility, canManage, canRevokeInvite, REFUSAL_TEXT, ROLE_TEXT, type Person } from "@/lib/org/permissions"
import type { Organization, OrgPerson, PendingInvite } from "@/lib/server/org"
import { cn } from "@/lib/utils"
import { accessSummary } from "./access-fields"
import { AddFacilityDialog, EditPersonDialog, InviteDialog, primaryButton, secondaryButton } from "./dialogs"

// The organization console (V7.6.5b): the organization as a tree, by facility or by reporting line, and every change an
// owner or admin makes to it: invite, change role and access, set who reports to whom, remove, add a facility. Written
// for a hospital administrator, not an engineer: every control says what it does, and anything they can't do says why.

const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })

const roleBadge = (role: OrgPerson["role"]) =>
  cn(
    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
    role === "owner" ? "bg-primary/10 text-primary" : role === "admin" ? "bg-favorable/10 text-favorable" : "bg-black/5 text-muted-foreground dark:bg-white/8"
  )

export function OrgConsole({ org, hospitals, latestYear }: { org: Organization; hospitals: FacilityOption[]; latestYear: number }) {
  const actor = org.people.find((p) => p.id === org.actorId)! as Person
  const [view, setView] = useState<"facility" | "reporting">("facility")
  const [editing, setEditing] = useState<string | null>(null)
  const [inviting, setInviting] = useState<{ key: number; preset?: PendingInvite } | null>(null)
  const [addingFacility, setAddingFacility] = useState(false)
  const [status, setStatus] = useState("")
  const byId = new Map(org.people.map((p) => [p.id, p]))
  const editingPerson = editing ? byId.get(editing) : undefined
  const facilityRefusal = canAddFacility(actor)
  const inOrg = new Set(org.facilities.map((f) => f.hcaiFacilityId))

  const finished = (message: string) => {
    setEditing(null)
    setAddingFacility(false)
    setStatus(message)
  }

  const personRow = (p: OrgPerson, opts: { showAccess?: boolean } = {}) => {
    const refusal = canManage(actor, p)
    const manager = p.managerId ? byId.get(p.managerId) : undefined
    const reports = org.people.filter((x) => x.managerId === p.id).length
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium">
            {p.name}
            {p.id === actor.id && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
            <span className={roleBadge(p.role)}>{ROLE_TEXT[p.role].label}</span>
          </p>
          <p className="text-[13px] text-muted-foreground">
            {[
              p.email,
              opts.showAccess ? accessSummary(p, org.facilities) : null,
              manager ? `Reports to ${manager.name}` : null,
              reports ? `${reports} direct ${reports === 1 ? "report" : "reports"}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {refusal ? (
          <span className="inline-flex items-center gap-1 text-xs text-tertiary-foreground" title={REFUSAL_TEXT[refusal]}>
            <Lock className="size-3" aria-hidden />
            <span className="sr-only">You can&apos;t change {p.name}: </span>
            {refusal === "target-outranks" ? "Owner changes only" : "Outside your access"}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => {
              setStatus("")
              setEditing(p.id)
            }}
            className="h-8 rounded-full px-3 text-[13px] font-medium text-primary hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Edit<span className="sr-only"> {p.name}</span>
          </button>
        )}
      </div>
    )
  }

  // Reporting lines: people with no manager (or a manager since removed) at the top, each with their reports beneath.
  const roots = org.people.filter((p) => !p.managerId || !byId.has(p.managerId))
  const renderBranch = (p: OrgPerson, seen: Set<string>): React.ReactNode => {
    const reports = org.people.filter((x) => x.managerId === p.id && !seen.has(x.id))
    const next = new Set([...seen, p.id])
    return (
      <li key={p.id}>
        {personRow(p, { showAccess: true })}
        {reports.length > 0 && <ul className="ml-3 border-l border-border pl-4 sm:ml-4 sm:pl-5">{reports.map((r) => renderBranch(r, next))}</ul>}
      </li>
    )
  }

  const orgWide = org.people.filter((p) => p.scope === "organization")
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setStatus("")
            setInviting({ key: Date.now() })
          }}
          className={primaryButton}
        >
          <UserPlus className="size-4" aria-hidden />
          Invite someone
        </button>
        <button
          type="button"
          onClick={() => {
            setStatus("")
            setAddingFacility(true)
          }}
          disabled={!!facilityRefusal}
          aria-describedby={facilityRefusal ? "add-facility-why" : undefined}
          className={secondaryButton}
        >
          <Plus className="size-4" aria-hidden />
          Add a facility
        </button>
        {facilityRefusal && (
          <span id="add-facility-why" className="text-[13px] text-muted-foreground">
            {REFUSAL_TEXT[facilityRefusal]}
          </span>
        )}
      </div>
      <p role="status" aria-live="polite" className={cn("rounded-xl bg-favorable/10 px-3 py-2 text-[14px] text-favorable", !status && "sr-only")}>
        {status}
      </p>

      <section aria-labelledby="people-title" className="widget p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="people-title" className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
            <Users className="size-4 text-primary" aria-hidden />
            People
            <span className="text-[14px] font-normal text-muted-foreground">
              {org.people.length} · {org.facilities.length} {org.facilities.length === 1 ? "facility" : "facilities"}
            </span>
          </h2>
          <Segmented
            label="Show people"
            value={view}
            onChange={setView}
            size="sm"
            options={[
              { value: "facility", label: "By facility" },
              { value: "reporting", label: "Reporting lines" },
            ]}
          />
        </div>

        {view === "facility" ? (
          <div className="mt-4 space-y-5">
            <div>
              <h3 className="text-[14px] font-semibold">Whole organization</h3>
              <p className="text-[13px] text-muted-foreground">Can see every facility, including any added later.</p>
              {orgWide.length ? (
                <ul className="mt-1 divide-y divide-border/60">
                  {orgWide.map((p) => (
                    <li key={p.id}>{personRow(p)}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[14px] text-muted-foreground">No one.</p>
              )}
            </div>
            {org.facilities.map((f) => {
              const here = org.people.filter((p) => p.scope === "facilities" && p.facilities.includes(f.id))
              return (
                <div key={f.id}>
                  <h3 className="flex items-center gap-2 text-[14px] font-semibold">
                    <Building2 className="size-3.5 text-tertiary-foreground" aria-hidden />
                    {f.name}
                  </h3>
                  <p className="text-[13px] text-muted-foreground">
                    {here.length ? "Also seen by everyone with whole-organization access." : "Only people with whole-organization access see this facility."}
                  </p>
                  {here.length > 0 && (
                    <ul className="mt-1 divide-y divide-border/60">
                      {here.map((p) => (
                        <li key={p.id}>{personRow(p)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-[13px] text-muted-foreground">
              Who reports to whom. A manager sees their reports&apos; work all the way down the chain, on top of their own facility access, and can hand it
              on, but not change it. Edit someone to set who they report to.
            </p>
            <ul className="mt-2">{roots.map((p) => renderBranch(p, new Set()))}</ul>
          </div>
        )}
      </section>

      <section aria-labelledby="invites-title" className="widget p-5">
        <h2 id="invites-title" className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
          <Mail className="size-4 text-primary" aria-hidden />
          Pending invites
        </h2>
        {org.invites.length ? (
          <ul className="mt-2 divide-y divide-border/60">
            {org.invites.map((i) => (
              <InviteRow
                key={i.id}
                invite={i}
                facilitiesText={accessSummary(i, org.facilities)}
                refusal={canRevokeInvite(actor, i)}
                onResend={() => {
                  setStatus("")
                  setInviting({ key: Date.now(), preset: i })
                }}
                onRevoked={setStatus}
              />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[14px] text-muted-foreground">None. Invites you send show here until they&apos;re accepted.</p>
        )}
      </section>

      {inviting && (
        <InviteDialog
          key={inviting.key}
          open
          onOpenChange={(o) => !o && setInviting(null)}
          actor={actor}
          facilities={org.facilities}
          preset={inviting.preset && { email: inviting.preset.email, role: inviting.preset.role, scope: inviting.preset.scope, facilities: inviting.preset.facilities }}
        />
      )}
      {editingPerson && (
        <EditPersonDialog
          key={editingPerson.id}
          open
          onOpenChange={(o) => !o && setEditing(null)}
          actor={actor}
          person={editingPerson}
          people={org.people}
          facilities={org.facilities}
          onDone={finished}
        />
      )}
      {addingFacility && (
        <AddFacilityDialog
          open
          onOpenChange={setAddingFacility}
          hospitals={hospitals.filter((h) => !inOrg.has(h.id))}
          latestYear={latestYear}
          onDone={finished}
        />
      )}
    </div>
  )
}

function InviteRow({
  invite,
  facilitiesText,
  refusal,
  onResend,
  onRevoked,
}: {
  invite: PendingInvite
  facilitiesText: string
  refusal: ReturnType<typeof canRevokeInvite>
  onResend: () => void
  onRevoked: (message: string) => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [state, action, pending] = useActionState(async (prev: Parameters<typeof revokeInviteAction>[0], fd: FormData) => {
    const result = await revokeInviteAction(prev, fd)
    if (result?.ok) onRevoked(`Invite for ${invite.email} withdrawn. The link no longer works.`)
    return result
  }, null)
  return (
    <li className="flex flex-col gap-x-3 gap-y-1.5 py-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium">
          {invite.email}
          <span className={roleBadge(invite.role)}>{ROLE_TEXT[invite.role].label}</span>
          {invite.expired && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-semibold">Expired</span>}
        </p>
        <p className="text-[13px] text-muted-foreground">
          {facilitiesText} · invited by {invite.invitedBy ?? "someone no longer here"} on {date(invite.createdAt)} ·{" "}
          {invite.expired ? "expired" : "expires"} {date(invite.expiresAt)}
        </p>
        {state && !state.ok && <p className="text-[13px] font-medium text-destructive">{state.message}</p>}
      </div>
      {refusal ? (
        <span className="inline-flex items-center gap-1 text-xs text-tertiary-foreground" title={REFUSAL_TEXT[refusal]}>
          <Lock className="size-3" aria-hidden />
          {refusal === "target-outranks" ? "Owner changes only" : "Outside your access"}
        </span>
      ) : confirming ? (
        <form action={action} className="flex items-center gap-2">
          <input type="hidden" name="id" value={invite.id} />
          <span className="text-[13px]">Withdraw this invite?</span>
          <button type="submit" disabled={pending} className="h-8 rounded-full bg-destructive/10 px-3 text-[13px] font-medium text-destructive hover:bg-destructive/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            {pending ? "Withdrawing…" : "Withdraw"}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="h-8 rounded-full px-3 text-[13px] font-medium hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:hover:bg-white/10">
            Keep
          </button>
        </form>
      ) : (
        <div className="-ml-3 flex items-center gap-1 sm:ml-0">
          <button type="button" onClick={onResend} className="h-8 rounded-full px-3 text-[13px] font-medium text-primary hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            New link<span className="sr-only"> for {invite.email}</span>
          </button>
          <button type="button" onClick={() => setConfirming(true)} className="h-8 rounded-full px-3 text-[13px] font-medium text-destructive hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            Withdraw<span className="sr-only"> invite for {invite.email}</span>
          </button>
        </div>
      )}
    </li>
  )
}
