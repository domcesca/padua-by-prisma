# Accounts and organization isolation: security review note (V7.6.5a, V7.6.5b)

This note covers how accounts, sessions, the organization boundary, people management and the management hierarchy
work, what was checked, and what a real audit should check before Padua holds client data. Today, nothing
organization-owned exists beyond the account records themselves. V7.6.5a built the boundary that later data (BYOD
uploads, saved briefings, filing-calendar entries, Initiatives) will sit behind. V7.6.5b added invites, managing
people, the reporting hierarchy and the console on top of it.

## What is and isn't behind the boundary

- **Behind it (organization-owned):** organizations, facilities, admins, facility scopes, sessions, invites, and the
  ownership-transfer log. Later, every table of client data.
- **Not behind it:** Padua's public benchmarking data (HCAI, CMS, CDPH). It isn't in the database at all. It's read from
  `data/processed` on disk, and no existing page or API route reads the session. Those pages and routes behave exactly
  as before, signed in or not (see "Regression" below).
- **Still in the browser, as before:** business-case drafts, pinned briefings, the remembered hospital, the tour. Nothing
  was migrated.

## How isolation is enforced

The organization boundary is enforced in the database, so a query that forgets to filter by organization still can't
cross it. The UI only reflects what the database returns. Four layers:

1. **Row-level security (Postgres).** Every organization-owned table has RLS enabled, with one policy: rows are visible
   and writable only where `organization_id = padua_current_org()` (for `organizations`, `id = …`). The policy
   applies to the `padua_app` role. It is `NOLOGIN` and `NOBYPASSRLS`, and has only the privileges the app uses. It
   cannot delete organizations or admins, and cannot read `admins.password_hash`.
2. **Every app query runs as `padua_app`.** `src/lib/server/db.ts` is the only module that imports `pg`. It opens a
   transaction, runs `SET LOCAL ROLE padua_app`, and sets `padua.organization_id` (and `padua.admin_id`) with
   `set_config(…, true)`. Both are transaction-local, so a pooled connection can't carry one organization's setting
   into another request. With no organization set, `padua_app` sees no rows at all.
3. **The organization comes only from a verified session.** `withTenant` takes a `TenantContext`. The auth module
   builds one in only two places:
   - `resolveSession`: a cookie token is hashed and looked up, and must be unexpired.
   - `createAccount`: the organization id is generated server-side for the organization being created.
   - `acceptInvite` (V7.6.5b): the invite token is hashed and matched, and the database returns the new admin's ids.

   No route, action or form accepts an organization id, admin id or facility id from the client as an authority.
   (Sign-up takes an HCAI hospital id, checks it against the public data, and takes the facility's name from there.)
4. **Composite foreign keys.** Sessions, facility scopes and the management chain reference `(organization_id, id)`.
   Even the database owner can't create a row that points at another organization's admin or facility.

Only two reads cross organizations, because they happen before anyone is known. Both are narrow `SECURITY DEFINER`
functions with a pinned `search_path`, executable only by `padua_app`:

- `padua_login_lookup(email)` returns one admin's ids and password hash, for sign-in.
- `padua_session_lookup(token_hash)` returns one unexpired session's admin and organization ids.

**Facility scope** (which hospitals an admin sees) is a separate axis from role. `padua_in_scope(facility_id)` answers it
for the signed-in admin, and only for a facility of the current organization. Future facility-level tables should
use this policy:
`using (organization_id = padua_current_org() and padua_in_scope(facility_id))`.
The isolation check exercises exactly that pattern on a stand-in table. Since V7.6.5b, owners and admins set each
person's scope from the console. Scope limits what an admin can manage (below); no organization data is gated by it
yet, because none exists.

## People, roles and invites (V7.6.5b)

### The privilege-escalation guard lives in the database

From migration `0002_people.sql` on, the app role can't write any of these directly: roles, scopes, managers,
membership, facilities or invites. `UPDATE`, `INSERT` and `DELETE` on those tables and columns are revoked from
`padua_app`. The check confirms each is "permission denied", even when acting as an owner. The only way to change them
is through nine `SECURITY DEFINER` functions:

- `padua_sign_up`
- `padua_create_invite`
- `padua_revoke_invite`
- `padua_accept_invite`
- `padua_set_access`
- `padua_set_manager`
- `padua_remove_admin`
- `padua_add_facility`
- `padua_invite_lookup` (read-only)

Each function works the same way:

- It takes the actor from `padua.admin_id`, which is set from the verified session, never from the request.
- It re-reads the actor and target rows itself.
- It applies the rules below and raises `padua:<rule>` on a refusal.

The same rules exist in `src/lib/org/permissions.ts`, which the console uses to explain what's off and why. The
database is the authority.

The rules:

- **Roles rank owner > admin > member. Members manage nothing.**
- **You can't grant beyond yourself.** You can't give any role above your own, or any access beyond your own. Access
  goes to the whole organization only if you have it; otherwise only to facilities in your own list. This applies to
  invites, and to changes to anyone, yourself included, so you can narrow your own access but never widen it.
- **You can only manage people within your reach.** You can't change, remove or revoke an invite for someone who
  outranks you or who sees anything you don't.
- **Setting a reporting line requires reach over the whole line.** You can set who someone reports to only if you can
  manage everyone who would come under the new manager: the person and their whole chain below. Otherwise an admin
  could make themselves (or anyone) the manager of people outside their reach, and gain view of their work.
- **Adding a facility needs whole-organization access.** A new facility is outside every facility list.
- **No self-removal.** Another owner or admin has to remove you. **The last owner can't step down or be removed.**

### Backstops

Two triggers hold these rules whatever writes the row, even the database owner:

- no reporting-line loop;
- never an organization with no owner.

Every people-changing function also takes a per-organization advisory lock. So two concurrent edits that are each fine
alone can't together break a rule, for example by closing a loop or demoting the last two owners at once. Both
functions and triggers read the latest committed state.

### Invite links

- **The token:** 32 random bytes (base64url) in the link path. Only its SHA-256 is stored, and `token_hash` isn't
  readable by the app role. The link is shown once, to the inviter. If it's lost, "New link" issues a fresh one and
  revokes the old.
- **Expiry and single use:**
  - Links expire after 7 days; the database refuses anything outside 1–30 days.
  - Accepting locks the invite row (`FOR UPDATE`), so a link works exactly once, even with two tabs racing.
  - Revoked, expired and used links are refused, and say which.
  - Inviting the same email again revokes the older pending link, but only if the actor could have revoked it
    themselves (an admin can't replace an owner's invite).
- **Checked again at acceptance:** the inviter's authority. If the inviter has since been removed, demoted or narrowed
  so they could no longer send this invite, it can't be accepted. So a stronger invite can't outlive the person who
  sent it.
- **Bound to one email:** the account is created with the invited email. There's no way to change it on the accept
  page.
- **One person, one organization:** an email that already has an account anywhere can't accept.
- **It's a bearer link:** whoever holds it can accept as that email. Padua doesn't send email yet: the inviter copies
  the link and sends it themselves, and nothing verifies that the person accepting controls the address. That's
  acceptable while inviters hand links to colleagues they know. It should change before self-serve use: send the link
  by email, from a configured base URL rather than the request's host, and verify the address.
- **The accept page:** it sends no `Referer` (`referrer: no-referrer`), so the token doesn't leak to linked sites, and
  it isn't indexed. To the holder of the link it shows the organization's name, the inviter's name, the email, the role
  and the facility names.
- **Invite rows are kept after use or revocation** (who, what, when, by whom), as a record.
- **Changes take effect at once.** Sessions store only ids, and role and scope are read fresh on every request, so a
  change applies on the person's next page load. Removal deletes their sessions (cascade), which signs them out
  immediately (checked).

### The management hierarchy

`admins.manager_id` is live. A manager's access comes on top of facility scope, never replacing it:

- They see their reports' data, transitively (a CSO sees their directors' reports too).
- They can hand it to someone in their own part of the chain.
- They can't edit it.

The pieces, for future tables of owned data:

- **`padua_subtree(admin)`, `padua_managers_of(admin)`, `padua_manages(manager, report)`:** recursive walks with
  `UNION`, which drops rows already seen. So they end even if a loop were ever stored behind the trigger's back
  (checked, by storing one with the trigger off).
- **`padua_visible_owners()`, `padua_scope_facilities()`:** arrays for policies, written so they run once per statement:
  `owner_admin_id = any ((select padua_visible_owners())::uuid[])`.
- **`padua_owned_row_guard()`:** attach it `BEFORE UPDATE`. The owner edits. A manager above them may change only
  `owner_admin_id`, only to someone in the manager's own chain, and every hand-off is written to `ownership_transfers`
  (from, to, by). Anything else raises: `manager-cannot-edit`, `reassign-outside-reports`, `not-owner`. The
  recommended pattern is a `SELECT` policy of scope or chain, and an `UPDATE` policy of chain only. That way facility
  scope alone is view-only.
- **Removing someone:** their direct reports move up to the removed person's manager, so the chain above keeps its view.
  Future owned tables should reference the owner without `ON DELETE CASCADE`. Then removal is refused until the
  person's items are handed on. The check shows this, rather than silently deleting their work.

## Test hospitals (V7.6.5c)

A test hospital is a made-up hospital an organization can use to try Padua. Every tool works with it: Overview,
Compare, Reports, Correlate, Business cases, the Filing calendar and Data definitions.

It's the first thing to live under the organization boundary that also reaches Padua's public data. So it's built so
the public side can't tell it exists.

**What it is.**
- A facility of the organization, with a row in `sandbox_hospitals`: its public id (`999` + 6 digits, a range HCAI
  doesn't use), the real hospital it's made from, and a random seed.
- Its data is never stored. `src/lib/data/sandbox.ts` regenerates it from the source hospital's public filings each
  time:
  - amounts are scaled by one factor, 10–20% up or down;
  - volumes (days, discharges, visits, beds, hours) by another factor;
  - both get a drift of up to ±3% by year;
  - rates, ratios and quality measures are kept.

  So every total, subtotal and derived figure stays consistent. Margins and rates match the source hospital; per-unit
  costs and every amount and volume differ.
- The source is picked at random from mid-size general acute hospitals that are still reporting, mostly acute care,
  and have data in every source Padua uses.

**Who can see it.**
- Only signed-in people of its organization, within their facility scope. `getSandbox()` reads it from the database
  under the organization's row-level security, per request. Another organization, or a signed-out visitor, asking for
  its id gets "not found": the same as for any unknown hospital.
- Creating one follows the add-facility rule: an owner or admin with whole-organization access. At sign-up, it's
  created by the new owner, through `padua_sign_up_with_test_hospital`.
- Creating test hospitals is offered only where `PADUA_TEST_HOSPITALS=on`.

**How it stays out of everyone else's numbers.**
1. **Caches never hold it.**
   - The data store's shared caches are always built from the real data alone (`runWithoutSandbox`), even when the
     first request to need them has a test hospital.
   - A test hospital's rows are layered onto the store's per-hospital files per request, in a separate cache keyed by
     that organization's set of test hospitals.
   - The two derived caches (unit and service-line sources) are keyed the same way.
2. **It's never in a population.** `getFacilities()`, the list every peer group, median, ranking and correlation is
   drawn from, never includes a test hospital. A test hospital can be the hospital being looked at, or a hospital
   compared alongside one. Lookups for those go through `getFacility()` and `getFacilityDirectory()`, which do include
   the viewer's own.
3. **It's never publicly cached.** The API routes are CDN-cached for a day, and the CDN doesn't key on cookies. So any
   response for a viewer with a test hospital, or for an address naming a `999` id, is sent `private, no-store`.
   Otherwise one person's response could be served to another, or a cached "not found" served to the owner.

**Checked.**
- With a tester signed in, the full API sweep for real hospitals was identical to the signed-out responses: 13,108
  responses, including the test hospital's source, plus 287 unit, service-line, specialty and peer views.
  - One of the 287 unit-view responses differed on the first request after a restart. The content was identical; only
    the order of keys within one object differed, because they're computed in parallel. Main behaves the same way.
- The tester sweep was run first, to fill the caches. Then the signed-out responses from the same server matched main:
  13,079 identical.
- Signed-out page renders are identical to main (66).
- Every API endpoint for the test hospital returns its data to the tester (18). For a signed-out visitor they return
  "not found", or Propose's generic data, and all are `private, no-store`.
- In the browser:
  - every page opens the test hospital for the tester;
  - for another organization's owner and a signed-out visitor, no page, picker or API reveals it;
  - adding a second one from the console works.
- `check:isolation` covers `sandbox_hospitals`:
  - another organization's test hospital isn't found by its public id;
  - direct inserts are refused;
  - the guarded function writes only to the actor's organization.
- `check:permissions` covers adding one under the add-facility rule (12 combinations), a reused public id, and a blank
  name.

**For an audit.**
- **Anyone who learns a test hospital's id** learns nothing: it isn't secret, and it resolves only inside its own
  organization.
- **What the test hospital's owner can learn:** it is derived from one real hospital's public filings. Its margins and
  rates match that hospital's, and its county and hospital type are the same, so the owner could probably work out
  which hospital it is. The data is public either way.
- **When organization data arrives:** once tables of organization data exist, their rows about a test hospital should
  be treated like any other facility's (facility scope, `padua_in_scope`).

## Authentication and sessions

- **Passwords:**
  - scrypt (N=2¹⁵, r=8, p=1, 16-byte salt), from Node's built-in crypto. The stored hash is self-describing, so the
    cost can be raised later.
  - 12–200 characters, with no composition rules (per NIST 800-63B).
  - An unknown email is checked against a decoy hash, so it's rejected in the same time and with the same message as a
    wrong password.
- **Throttling:** 10 failed sign-ins per email in 15 minutes, after which that email is refused until the window passes,
  even with the right password. Failures are stored under a SHA-256 of the email, not the email.
- **Sessions:**
  - 32 random bytes in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production).
  - Only the token's SHA-256 is stored, so a leaked copy of the sessions table can't be replayed.
  - Sessions last 14 days (an absolute limit). Sign-out deletes the session row, so the old cookie stops working (checked).
- **Forms:**
  - Sign-up, sign-in and sign-out are Next.js server actions. They are POST-only, and Next rejects any whose `Origin`
    doesn't match the host. With the `Lax` cookie, that is the CSRF defense.
  - The post-sign-in redirect accepts only a same-site path (`/…`, not `//…`).

## What was checked

All against real PostgreSQL 16, on a scratch database.

- **`npm run check:isolation`:** 131 checks, all passing in three connection setups (details below).
  - It sets up two organizations and tries every table, read and write, from each against the other:
    - unfiltered reads, and reads by the other organization's ids;
    - inserts, updates and moves into the other organization;
    - cross-organization scopes, managers and sessions;
    - the column privilege on password hashes;
    - attempts to alter the role or turn RLS off;
    - both lookups, including expired sessions;
    - `padua_in_scope`;
    - the future-table policy pattern.
  - V7.6.5b added the new tables (invites, invite facilities, the transfer log), and every guarded function aimed at
    the other organization's people, facilities and invites. Each is refused as "not found", and the other
    organization is checked untouched afterwards.
  - The three setups:
    - a non-superuser owner, like a hosted provider's default role;
    - an owner with `BYPASSRLS`, which some providers grant;
    - a separate non-owner login that's a member of `padua_app`, including after `RESET ROLE`.
  - It caught a real bug in V7.6.5a before commit: `padua_in_scope` accepted any facility id for whole-organization
    scope.
- **`npm run check:permissions`** (V7.6.5b): the privilege-escalation guard, exhaustively. It uses 12 people (each role
  with each of four scopes) over three facilities. Every guarded function is tried with every actor, target and grant,
  and the database's answer (allowed, or the exact refusal) must equal the TypeScript rules. That's 10,128
  combinations, all matching:
  - set role and access: 2,160;
  - invite: 180;
  - revoke: 144;
  - remove: 144;
  - add facility: 12;
  - set manager: 1,872 for each of three reporting structures, one of them random.

  Then 14 named escalation cases (an admin making themselves owner, widening their own scope, inviting above
  themselves, taking over a reporting line that reaches outside their access, and so on). Then 9 direct writes the
  app role must be denied. Then the invite lifecycle and the last-owner rule. 57 checks in all.

  To confirm the check can fail, I removed the role-rank rule from the database function in a throwaway database. The
  check then reported 5 failures, including "adminorg sets adminorg (self) to ownerorg: expected role-too-high, got
  ok".
- **`npm run check:hierarchy`** (V7.6.5b): 35 checks.
  - **Loops:**
    - loops of 1, 2 and 50 are refused, through the functions and through direct writes as the owner;
    - 25 races of two concurrent edits that would together close a loop: the second is refused every time, and no
      loop is stored.
  - **Traversal:**
    - 3,000 random moves over 300 people are refused exactly when they would loop;
    - `padua_manages` agrees with an independent TypeScript walk on 5,000 random pairs, and `padua_subtree` for all 300
      people;
    - with a loop stored anyway, the traversal functions still end.
  - **Owned-data rules** on a stand-in table:
    - transitive view;
    - reports don't see up;
    - scope alone is view-only;
    - managers can't edit, or edit while reassigning;
    - hand-offs go only within the manager's own chain, and are logged;
    - removal is refused while the person owns items, and reparents their reports.
  - **Performance:**
    - a 5,000-deep chain: `padua_manages` top to bottom 17 ms, the top's subtree 14 ms, refusing a 5,000-long loop
      18 ms, a legitimate move 17 ms;
    - a 10,000-person tree: the root's subtree 24 ms;
    - 100,000 owned rows read by a manager of 1,111 people through the policy: under 0.5 s.

    These timings assume the planner has current statistics. Straight after bulk-loading 5,000 people, before
    `ANALYZE`, the deep walk took about 6 s. Autovacuum fixes that, and people normally arrive one invite at a time. A
    future bulk-import feature should run `ANALYZE admins` after loading.
- **End to end (Chromium):**
  - V7.6.5a's 33 checks still pass (sign-up now goes through `padua_sign_up`).
  - V7.6.5b adds 29 more:
    - owner adds a facility, invites an admin scoped to one facility and a member;
    - the invite page shows who and what, and sends no referrer;
    - accepting signs them in with exactly that access;
    - the link can't be reused;
    - the admin sees what they can't do, and why.
  - **Forcing past the UI:** re-enabling disabled options in the page to invite an owner, to widen their own scope, or
    to make a loop is refused by the server with the rule's message.
  - **Other flows:**
    - withdrawing an invite kills its link;
    - demoting the admin removes their console on their next page load;
    - removing the member signs them out at once;
    - the only owner can't step down.
- **Regression against main:**
  - 13,079 API responses identical;
  - 66 page renders (11 pages × 3 hospital states × desktop and phone) identical in status, title, main text and
    shell;
  - every existing route keeps its rendering.
- **Accessibility (axe):** 0 violations on the new pages (13 console, dialog and invite states × light and dark ×
  desktop and phone). One contrast failure (the solid red Remove button in dark mode) was found and fixed.
- **With no `DATABASE_URL`:** the app runs as before. Sign-in and sign-up say accounts aren't set up, `/account` and
  `/organization` redirect to sign-in, and every public page and API responds normally. The account pages now always
  read the session cookie, so a build without a database can't prerender them as static pages. On main,
  `/account` and `/signup` were prerendered that way when built without `DATABASE_URL`.

## What a real audit should check before this holds client data

1. **The production connection role.** Locally, the app may connect as the database owner and step down to `padua_app`
   per transaction. That protects against a missing `WHERE`, but a SQL injection could `RESET ROLE` back to the owner.
   All queries are parameterized, but the boundary shouldn't rest on that. In production:
   - connect as a dedicated login role that is `NOINHERIT` and a member of `padua_app` only (see below);
   - run migrations separately, with the owner.

   The check already passes in that setup.
2. **The hosted database itself.**
   - Run `check:isolation` against a staging copy of the real provider (for example, a Neon branch). Confirm
     `padua_app` is `NOBYPASSRLS` and the migration's `grant padua_app to current_user` succeeded.
   - Use a separate database, or database branch, for preview deployments, never production's.
3. **A guard for every future table.** Every new organization-owned table needs:
   - `organization_id`;
   - RLS enabled, with the tenant (and, where facility-level, scope) policy;
   - composite foreign keys;
   - a case in `check:isolation`.

   Worth adding as a CI query: any table with an `organization_id` column where `relrowsecurity` is false.
4. **Account lifecycle gaps.** None of these exist yet: email verification, password reset, MFA, an idle timeout,
   "sign out everywhere", account or organization deletion. Password reset in particular is needed before real users.
5. **Abuse controls.**
   - Throttling is per email only. Add per-IP or edge rate limiting (for example, Vercel's firewall) on sign-in and
     sign-up, and a bot check on sign-up.
   - Sign-up reveals whether an email has an account ("already exists"). That's acceptable for B2B sign-up but a
     conscious choice.
   - Consider a breached-password check.
6. **Before client data arrives (BYOD especially).**
   - Decide whether any upload can contain PHI. If so, you need a BAA with the database and hosting providers,
     encryption at rest, retention and deletion policies, and access logging (who read what).
   - There is no audit log yet.
7. **The guarded functions themselves (V7.6.5b).** They run as the owner, outside row-level security, so each filters on
   `padua_current_org()` explicitly. A reviewer should read each of the nine against the rules; the permission and
   isolation checks test them from outside. Two things to watch:
   - The helper functions (`padua_refuse_*`, `padua_lock_org`, `padua_subtree`, …) are callable by the app role.
     They grant nothing, but `padua_lock_org` could be used to briefly serialize one's own organization's edits.
   - Changes to people aren't logged beyond invites and ownership transfers. An audit log of role, scope, manager and
     membership changes (who changed whom, when) should come before real client use.
8. **Invites before self-serve use.**
   - Deliver the link by email from a configured base URL, and verify the address on acceptance.
   - Consider a shorter default expiry.
   - Purge long-expired invite rows on a schedule.
9. **Housekeeping.**
   - Expired sessions and old `login_failures` rows aren't purged yet. A scheduled delete is needed.
   - Add security headers and a CSP.
   - Review dependencies (`pg` is the only new runtime one).
   - Keep `DATABASE_URL` in Vercel's environment settings only, never in the repo. `.env*` is git-ignored.

## Setting it up on a deployment

1. Create a Postgres database (PostgreSQL 15 or later). Vercel's Marketplace Neon integration works.
2. Run the migrations with the owner connection string, and again whenever a new one ships:
   `DATABASE_URL=… npm run db:migrate`.

   Deploy code and migrations together:
   - `0002_people.sql` takes away the direct inserts V7.6.5a's sign-up used, so V7.6.5a code against a 0002 database
     can't sign anyone up.
   - This code against a database without 0002 fails on the missing functions.
   - The same goes for `0003_test_hospitals.sql` (V7.6.5c): the account and organization pages read its table.
   - To offer test hospitals, also set `PADUA_TEST_HOSPITALS=on`.
3. Recommended: create the app's own login role, then give Vercel that role's connection string as `DATABASE_URL`:

   ```sql
   create role padua_web login password '…' noinherit;
   grant padua_app to padua_web;
   ```
4. Optional: run `npm run check:isolation`, `check:permissions` and `check:hierarchy`, with
   `CHECK_DATABASE_URL=<owner url of a scratch or staging DB>`. They add test organizations and remove them after.
   `check:hierarchy` briefly disables the loop trigger to prove the reads are loop-safe, so never point it at
   production.

Without `DATABASE_URL`, the deployment works exactly as before, and sign-in reports that accounts aren't set up.

## Deliberately deferred (next passes)

Done in V7.6.5b: invites, managing people (role, scope, reporting line, removal), adding facilities, management-hierarchy
access (functions, policy pattern and guard, proven on synthetic data), and the client-facing console at `/organization`.

Still to come:

- **Prisma's internal operations console:** the "we manage it for you" servicing tier, where Prisma staff act across
  client organizations. That needs its own role and audited cross-tenant access path, deliberately absent today. It's
  the next follow-up.
- **Invite delivery:** Padua emailing the link, email verification on acceptance, and resending.
- **Organization data under the hierarchy:** no real table uses `padua_owned_row_guard` or the chain policy yet.
  They arrive with BYOD, saved briefings, sharing and Initiatives.
- **Sharing:** of briefings, business cases or reports within or across organizations.
- **BYOD uploads, and moving browser-local work to the server:** business-case drafts and pinned briefings still live in
  the browser.
- **Test hospitals (V7.6.5c) — possible follow-ups:**
  - renaming or removing a test hospital;
  - choosing which kind of real hospital it's based on;
  - varying its rates as well (today its margins and rates match its source's, which keeps every total consistent).
- **Smaller gaps:**
  - renaming the organization;
  - facilities outside the HCAI list;
  - removing a facility;
  - leaving an organization yourself;
  - handing work to a peer rather than down the chain;
  - bulk import of people;
  - SSO;
  - an audit log of people changes.
- **Account lifecycle:** password reset, email verification, MFA.
- **Requiring sign-in for the public data:** not done. The request was to leave existing pages ungated. Putting the
  whole app behind sign-in later is a single decision, and nothing here depends on it.
