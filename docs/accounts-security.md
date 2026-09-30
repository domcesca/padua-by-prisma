# Accounts and organization isolation: security review note (V7.6.5a)

This note covers how accounts, sessions and the organization boundary work, what was checked, and what a real audit
should check before Padua holds client data. Today, nothing organization-owned exists beyond the account records
themselves. This pass builds the boundary that later data (BYOD uploads, saved briefings, filing-calendar entries,
Initiatives) will sit behind.

## What is and isn't behind the boundary

- **Behind it (organization-owned):** organizations, facilities, admins, facility scopes, sessions. Later, every table of
  client data.
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
The isolation check exercises exactly that pattern on a stand-in table. Nothing uses scope to hide anything yet:
every account today is an Owner with whole-organization scope.

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

- **`npm run check:isolation`** runs against real PostgreSQL 16. It sets up two organizations, one of them with a member
  scoped to one of its two facilities, and makes 45 checks per connection setup (plus one more for the non-owner login's `RESET ROLE`). They cover:
  - unfiltered reads of every table;
  - reads by the other organization's ids;
  - inserts, updates and moves into the other organization;
  - cross-organization scopes, managers and sessions;
  - the column privilege on password hashes;
  - attempts to alter the role or turn RLS off;
  - both lookups, including expired sessions;
  - `padua_in_scope` for member, owner, an unknown facility id and a mismatched admin id;
  - the future-table policy pattern.

  All pass in three setups:
  - connected as a non-superuser owner, like a hosted provider's default role;
  - connected as an owner with `BYPASSRLS`, which some providers grant;
  - connected as a separate non-owner login that's a member of `padua_app`, including after `RESET ROLE`.

  Writing the check caught a real bug before commit. `padua_in_scope` returned true for any facility id when the
  admin's scope was the whole organization. It now requires the facility to belong to the current organization.
- **End to end (Chromium, 33 checks):**
  - sign-up validation, with values kept, the password never echoed and focus on the first error;
  - two organizations, each seeing only its own account page;
  - duplicate email; sign-out; replay of a signed-out cookie; a forged cookie;
  - wrong password and unknown email, with the same message;
  - a case-insensitive email; the `next=` redirect and an attempted open redirect;
  - throttling, including with the right password;
  - public pages and APIs while signed out and signed in.
- **With no `DATABASE_URL`:** the app runs as before. Sign-in and sign-up say accounts aren't set up, `/account`
  redirects to sign-in, and every public page and API responds normally.

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
7. **Housekeeping.**
   - Expired sessions and old `login_failures` rows aren't purged yet. A scheduled delete is needed.
   - Add security headers and a CSP.
   - Review dependencies (`pg` is the only new runtime one).
   - Keep `DATABASE_URL` in Vercel's environment settings only, never in the repo. `.env*` is git-ignored.

## Setting it up on a deployment

1. Create a Postgres database (PostgreSQL 15 or later). Vercel's Marketplace Neon integration works.
2. Run the migration once with the owner connection string:
   `DATABASE_URL=… npm run db:migrate`.
3. Recommended: create the app's own login role, then give Vercel that role's connection string as `DATABASE_URL`:

   ```sql
   create role padua_web login password '…' noinherit;
   grant padua_app to padua_web;
   ```
4. Optional: run `CHECK_DATABASE_URL=<owner url of a scratch or staging DB> npm run check:isolation`.

Without `DATABASE_URL`, the deployment works exactly as before, and sign-in reports that accounts aren't set up.

## Deliberately deferred (next passes)

- **Organization invites:** there is no way to join an existing organization. Every sign-up creates a new organization
  with the signer as Owner.
- **Managing people:** changing roles and facility scopes, and removing people. The schema supports this;
  there's no UI or action yet.
- **Adding facilities:** a health system can't yet add its other hospitals after sign-up.
- **Management-hierarchy access:** `admins.manager_id` exists, is kept inside the organization by a composite key, and
  is covered by the isolation check. Nothing sets or reads it, and it grants no access.
- **Org-chart console:** nothing built.
- **Sharing:** of briefings, business cases or reports within or across organizations.
- **BYOD uploads, and moving browser-local work to the server:** business-case drafts and pinned briefings still live in
  the browser.
- **Requiring sign-in for the public data:** not done. The request was to leave existing pages ungated. Putting the
  whole app behind sign-in later is a single decision, and nothing here depends on it.
