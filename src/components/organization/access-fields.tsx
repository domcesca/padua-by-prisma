"use client"

import { Lock } from "lucide-react"

import { RANK, ROLE_TEXT, ROLES, type Access, type Role, type ScopeKind } from "@/lib/org/permissions"
import type { OrgFacility } from "@/lib/server/org"
import { cn } from "@/lib/utils"

// Role and facility access, as form fields (V7.6.5b), shared by the invite and edit dialogs. Real radio buttons and
// checkboxes (named role, scope, facility), so the form posts exactly what's shown. Anything the signed-in admin can't
// grant is shown but disabled, with the reason, rather than hidden: an administrator should see why an option is off.

export type Grant = { role: Role; scope: ScopeKind; facilities: string[] }

export function accessSummary(a: { scope: ScopeKind; facilities: string[] }, facilities: OrgFacility[]) {
  if (a.scope === "organization") return "Whole organization"
  const names = a.facilities.map((id) => facilities.find((f) => f.id === id)?.name ?? "A removed facility")
  if (names.length <= 2) return names.join(" and ")
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`
}

const cardClass = (on: boolean, disabled: boolean) =>
  cn(
    "flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
    on ? "border-primary/50 bg-primary/5" : "border-border hover:bg-black/3 dark:hover:bg-white/5",
    disabled && "cursor-not-allowed opacity-60 hover:bg-transparent"
  )

export function AccessFields({
  idPrefix,
  actor,
  facilities,
  value,
  onChange,
}: {
  idPrefix: string
  actor: Access
  facilities: OrgFacility[]
  value: Grant
  onChange: (g: Grant) => void
}) {
  const orgWideAllowed = actor.scope === "organization"
  const facilityAllowed = (id: string) => actor.scope === "organization" || actor.facilities.includes(id)
  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-[14px] font-semibold">Role</legend>
        {ROLES.map((role) => {
          const disabled = RANK[role] > RANK[actor.role]
          const id = `${idPrefix}-role-${role}`
          return (
            <label key={role} htmlFor={id} className={cardClass(value.role === role, disabled)}>
              <input
                id={id}
                type="radio"
                name="role"
                value={role}
                checked={value.role === role}
                disabled={disabled}
                onChange={() => onChange({ ...value, role })}
                aria-describedby={`${id}-body`}
                className="mt-1 accent-[var(--primary-fill)]"
              />
              <span className="min-w-0">
                <span className="block text-[14px] font-medium">{ROLE_TEXT[role].label}</span>
                <span id={`${id}-body`} className="block text-[13px] leading-snug text-muted-foreground">
                  {ROLE_TEXT[role].body}
                  {disabled && " Only an owner can give this role."}
                </span>
              </span>
            </label>
          )
        })}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-[14px] font-semibold">Facility access</legend>
        <p className="mb-2 text-[13px] text-muted-foreground">Which hospitals&apos; organization data they can see. Padua&apos;s public data is open to everyone either way.</p>
        <label htmlFor={`${idPrefix}-scope-org`} className={cardClass(value.scope === "organization", !orgWideAllowed)}>
          <input
            id={`${idPrefix}-scope-org`}
            type="radio"
            name="scope"
            value="organization"
            checked={value.scope === "organization"}
            disabled={!orgWideAllowed}
            onChange={() => onChange({ ...value, scope: "organization", facilities: [] })}
            aria-describedby={`${idPrefix}-scope-org-body`}
            className="mt-1 accent-[var(--primary-fill)]"
          />
          <span>
            <span className="block text-[14px] font-medium">Whole organization</span>
            <span id={`${idPrefix}-scope-org-body`} className="block text-[13px] text-muted-foreground">
              Every facility, including any added later.{!orgWideAllowed && " You can only give access to the facilities you see yourself."}
            </span>
          </span>
        </label>
        <label htmlFor={`${idPrefix}-scope-fac`} className={cardClass(value.scope === "facilities", false)}>
          <input
            id={`${idPrefix}-scope-fac`}
            type="radio"
            name="scope"
            value="facilities"
            checked={value.scope === "facilities"}
            onChange={() => onChange({ ...value, scope: "facilities" })}
            className="mt-1 accent-[var(--primary-fill)]"
          />
          <span className="block text-[14px] font-medium">Specific facilities</span>
        </label>
        {value.scope === "facilities" && (
          <div role="group" aria-label="Facilities" className="ml-7 space-y-1.5 pt-1">
            {facilities.map((f) => {
              const allowed = facilityAllowed(f.id)
              const id = `${idPrefix}-fac-${f.id}`
              return (
                <label key={f.id} htmlFor={id} className={cn("flex items-center gap-2.5 text-[14px]", !allowed && "text-muted-foreground")}>
                  <input
                    id={id}
                    type="checkbox"
                    name="facility"
                    value={f.id}
                    checked={value.facilities.includes(f.id)}
                    disabled={!allowed}
                    onChange={(e) =>
                      onChange({ ...value, facilities: e.target.checked ? [...value.facilities, f.id].sort() : value.facilities.filter((x) => x !== f.id) })
                    }
                    className="size-4 accent-[var(--primary-fill)]"
                  />
                  {f.name}
                  {!allowed && (
                    <span className="inline-flex items-center gap-1 text-xs">
                      <Lock className="size-3" aria-hidden /> outside your access
                    </span>
                  )}
                </label>
              )
            })}
          </div>
        )}
      </fieldset>
    </div>
  )
}
