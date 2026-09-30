// Who may change what in an organization (V7.6.5b). The database enforces these rules itself, in the functions of
// db/migrations/0002_people.sql, which are the only way the app can change roles, scopes, managers, membership or
// invites. This file is the same rules in TypeScript, for the console (which options to offer, and why one isn't) and
// for scripts/check-permissions.mts, which runs every combination against the database and requires both to give the
// same answer, reason included. Change one, change the other.
//
// No imports: the check script runs this file directly under Node.

export type Role = "owner" | "admin" | "member"
export type ScopeKind = "organization" | "facilities"
/** What someone can see: the whole organization, or a list of its facilities. */
export type Scope = { scope: ScopeKind; facilities: string[] }
export type Access = Scope & { role: Role }
export type Person = Access & { id: string; managerId: string | null }

export const RANK: Record<Role, number> = { owner: 3, admin: 2, member: 1 }
export const ROLES: Role[] = ["owner", "admin", "member"]

/** Why something is refused; the database raises the same codes (as "padua:<code>"). */
export type Refusal =
  | "not-a-manager"
  | "target-outranks"
  | "target-outside-scope"
  | "role-too-high"
  | "scope-too-broad"
  | "no-facilities"
  | "last-owner"
  | "self-remove"
  | "cycle"
  | "reports-outside-scope"
  | "needs-organization-scope"

/** Owners and admins manage the organization and its people; members don't. */
export const managesPeople = (a: Access) => a.role !== "member"

/** Does `a`'s scope include everything scope `s` covers? Organization scope includes every scope. */
export function covers(a: Scope, s: Scope) {
  if (a.scope === "organization") return true
  return s.scope === "facilities" && s.facilities.length > 0 && s.facilities.every((f) => a.facilities.includes(f))
}

/** May `actor` manage `target` at all: not outranked by them, and their whole scope within the actor's? */
export function canManage(actor: Access, target: Access): Refusal | null {
  if (!managesPeople(actor)) return "not-a-manager"
  if (RANK[target.role] > RANK[actor.role]) return "target-outranks"
  if (!covers(actor, target)) return "target-outside-scope"
  return null
}

/** May `actor` give someone this role and scope? Never more than the actor has: the privilege-escalation guard. */
export function canGrant(actor: Access, grant: Access): Refusal | null {
  if (!managesPeople(actor)) return "not-a-manager"
  if (RANK[grant.role] > RANK[actor.role]) return "role-too-high"
  if (grant.scope === "facilities" && grant.facilities.length === 0) return "no-facilities"
  if (!covers(actor, grant)) return "scope-too-broad"
  return null
}

export function canInvite(actor: Access, grant: Access) {
  return canGrant(actor, grant)
}

/** Revoking an invite is managing the person it would create. */
export function canRevokeInvite(actor: Access, invite: Access) {
  return canManage(actor, invite)
}

/**
 * Change `target`'s role and scope (target may be the actor: then this can only narrow, never widen). `owners` is how
 * many owners the organization has now.
 */
export function canSetAccess(actor: Access, target: Access, next: Access, owners: number): Refusal | null {
  return canManage(actor, target) ?? canGrant(actor, next) ?? (target.role === "owner" && next.role !== "owner" && owners <= 1 ? "last-owner" : null)
}

export function canRemove(actor: Person, target: Person, owners: number): Refusal | null {
  if (actor.id === target.id) return "self-remove"
  return canManage(actor, target) ?? (target.role === "owner" && owners <= 1 ? "last-owner" : null)
}

/** Everyone who reports to `id`, directly or down the chain, and `id` itself. Terminates on a (corrupt) cycle. */
export function subtree(people: Person[], id: string): Set<string> {
  const byManager = new Map<string, string[]>()
  for (const p of people) if (p.managerId) byManager.set(p.managerId, [...(byManager.get(p.managerId) ?? []), p.id])
  const seen = new Set<string>([id])
  const queue = [id]
  while (queue.length) {
    for (const r of byManager.get(queue.shift()!) ?? []) {
      if (seen.has(r)) continue
      seen.add(r)
      queue.push(r)
    }
  }
  return seen
}

/**
 * Set (or clear, with null) who `target` reports to. A manager gains view of their reports' data down the chain, so
 * the actor must be able to manage everyone who'd come under the new manager: otherwise an admin could make
 * themselves (or anyone) the manager of people outside their own reach. And no one can end up above themselves.
 */
export function canSetManager(actor: Access, people: Person[], targetId: string, managerId: string | null): Refusal | null {
  const target = people.find((p) => p.id === targetId)!
  const refused = canManage(actor, target)
  if (refused) return refused
  if (managerId === null) return null
  const below = subtree(people, targetId)
  if (below.has(managerId)) return "cycle"
  for (const id of below) if (canManage(actor, people.find((p) => p.id === id)!)) return "reports-outside-scope"
  return null
}

/** A new facility is outside every facility-scoped list, so only someone who sees the whole organization adds one. */
export function canAddFacility(actor: Access): Refusal | null {
  if (!managesPeople(actor)) return "not-a-manager"
  return actor.scope === "organization" ? null : "needs-organization-scope"
}

/** Plain-language reasons, for the console and for errors the database returns. */
export const REFUSAL_TEXT: Record<Refusal, string> = {
  "not-a-manager": "Only owners and admins can manage people.",
  "target-outranks": "They have a higher role than you, so only an owner can change this.",
  "target-outside-scope": "They can see facilities you can't, so someone with wider access has to change this.",
  "role-too-high": "You can't give a role higher than your own.",
  "scope-too-broad": "You can only give access to facilities you can see yourself.",
  "no-facilities": "Choose at least one facility.",
  "last-owner": "Every organization needs at least one owner. Make someone else an owner first.",
  "self-remove": "You can't remove yourself. Ask another owner or admin.",
  cycle: "That would put them above their own manager. Reporting lines can't loop.",
  "reports-outside-scope": "Some of the people who report to them are outside your access, so someone with wider access has to change this.",
  "needs-organization-scope": "Only someone who sees the whole organization can add a facility.",
}

export const ROLE_TEXT: Record<Role, { label: string; body: string }> = {
  owner: { label: "Owner", body: "Manages the organization and its people, including other owners." },
  admin: { label: "Admin", body: "Manages the organization and its people, up to admin." },
  member: { label: "Member", body: "Views and contributes within their facility access." },
}

/** Refusals that aren't about rank or scope: lookups, invite states, bad input. */
const OTHER_TEXT: Record<string, string> = {
  "not-found": "That person, invite or facility isn't in your organization (it may have just been removed).",
  "not-signed-in": "Your session has ended. Sign in again.",
  "already-member": "Someone with that email is already in your organization.",
  "invite-not-pending": "That invite was already accepted or revoked.",
  "facility-exists": "That hospital is already one of your organization's facilities.",
  "bad-request": "Something in that request wasn't valid. Reload the page and try again.",
  "invite-invalid": "This invite link isn't valid. Check you copied all of it, or ask for a new one.",
  "invite-accepted": "This invite has already been used. If it was you, sign in instead.",
  "invite-revoked": "This invite was withdrawn. Ask the person who sent it for a new one.",
  "invite-expired": "This invite has expired. Ask the person who sent it for a new one.",
  "invite-inviter-changed": "The person who sent this invite can no longer grant this access. Ask for a new invite.",
  "email-taken": "This email already has a Padua account, and an account belongs to one organization. Use a different email, or ask Padua support to move it.",
}

export function refusalText(code: string) {
  return (REFUSAL_TEXT as Record<string, string>)[code] ?? OTHER_TEXT[code] ?? "That change couldn't be made."
}
