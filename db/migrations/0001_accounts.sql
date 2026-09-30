-- V7.6.5a: accounts and organization-first multi-tenancy.
--
-- Organization (the tenant) → Facility (one or more hospitals) → Admin (a person, in exactly one organization).
-- Each admin has two independent axes of access: role (owner / admin / member) and facility scope (the whole
-- organization, or the facilities listed in admin_facilities). A management chain (admins.manager_id) is in the schema
-- but not used yet.
--
-- Isolation: every organization-owned table carries organization_id and has row-level security. The app runs its
-- queries as the padua_app role (SET LOCAL ROLE in every transaction, src/lib/server/db.ts), with the signed-in
-- admin's organization in the padua.organization_id setting; padua_app can only see and write rows of that
-- organization. With no organization set it sees none. The only reads across organizations are the two SECURITY
-- DEFINER lookups at the bottom (sign-in by email, session by token hash), which return one admin's ids and nothing
-- else. The migration runs as the database owner, which is not subject to these policies.
--
-- Padua's public HCAI data isn't in the database at all (data/processed, read from disk) and is untouched by this.

-- The role the app acts as. NOLOGIN: it's only ever reached by SET ROLE from the connecting (owner) role, which must
-- be a member of it (PostgreSQL 16 no longer grants that implicitly to the role that created it).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'padua_app') then
    create role padua_app nologin nobypassrls;
  end if;
end
$$;
grant padua_app to current_user;

-- The signed-in admin's organization and id, as set by the app for the current transaction; null when unset.
create function padua_current_org() returns uuid
  language sql stable
  as $$ select nullif(current_setting('padua.organization_id', true), '')::uuid $$;
create function padua_current_admin() returns uuid
  language sql stable
  as $$ select nullif(current_setting('padua.admin_id', true), '')::uuid $$;

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  created_at timestamptz not null default now()
);

create table facilities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  -- The hospital's HCAI facility id, linking it to the public data; null for a facility HCAI doesn't report on.
  hcai_facility_id text,
  created_at timestamptz not null default now(),
  -- Referenced with organization_id by the tables below, so a row can't point at another organization's facility.
  unique (organization_id, id),
  unique (organization_id, hcai_facility_id)
);

create table admins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and length(email) between 3 and 320),
  name text not null check (length(btrim(name)) between 1 and 200),
  -- scrypt, self-describing (src/lib/server/auth/password.ts). Never selected except by padua_login_lookup.
  password_hash text not null,
  -- owner / admin manage the organization and its people; member views and contributes within their scope.
  role text not null check (role in ('owner', 'admin', 'member')),
  -- organization: every facility, including ones added later. facilities: only those in admin_facilities.
  facility_scope text not null check (facility_scope in ('organization', 'facilities')),
  -- Management chain, independent of the facility tree and free to cross facilities. Not used yet; the composite key
  -- keeps a manager inside the same organization.
  manager_id uuid check (manager_id <> id),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, manager_id) references admins (organization_id, id) on delete set null (manager_id)
);
-- One person, one organization: an email signs in to exactly one account.
create unique index admins_email_key on admins (email);
create index admins_manager_idx on admins (organization_id, manager_id);

-- The facilities an admin with facility_scope = 'facilities' can see. Both keys include organization_id, so a scope
-- can't reach a facility in another organization.
create table admin_facilities (
  organization_id uuid not null,
  admin_id uuid not null,
  facility_id uuid not null,
  primary key (admin_id, facility_id),
  foreign key (organization_id, admin_id) references admins (organization_id, id) on delete cascade,
  foreign key (organization_id, facility_id) references facilities (organization_id, id) on delete cascade
);

-- Signed-in sessions. The cookie holds a random token; only its SHA-256 is stored, so a copy of this table can't be
-- replayed as a session.
create table sessions (
  token_hash text primary key,
  organization_id uuid not null,
  admin_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  foreign key (organization_id, admin_id) references admins (organization_id, id) on delete cascade
);
create index sessions_admin_idx on sessions (admin_id);
create index sessions_expires_idx on sessions (expires_at);

-- Failed sign-ins, for throttling. The email is stored hashed; this is the one table outside any organization.
create table login_failures (
  email_hash text not null,
  failed_at timestamptz not null default now()
);
create index login_failures_idx on login_failures (email_hash, failed_at);

-- Row-level security: padua_app sees only the current organization's rows. ENABLE (not FORCE), so the owner that runs
-- migrations and owns the two lookups below is exempt; the app never queries as the owner.
alter table organizations enable row level security;
alter table facilities enable row level security;
alter table admins enable row level security;
alter table admin_facilities enable row level security;
alter table sessions enable row level security;

create policy tenant on organizations to padua_app
  using (id = padua_current_org()) with check (id = padua_current_org());
create policy tenant on facilities to padua_app
  using (organization_id = padua_current_org()) with check (organization_id = padua_current_org());
create policy tenant on admins to padua_app
  using (organization_id = padua_current_org()) with check (organization_id = padua_current_org());
create policy tenant on admin_facilities to padua_app
  using (organization_id = padua_current_org()) with check (organization_id = padua_current_org());
create policy tenant on sessions to padua_app
  using (organization_id = padua_current_org()) with check (organization_id = padua_current_org());

-- Privileges: only what the app uses. No deletes of organizations or admins yet (nothing removes them).
grant usage on schema public to padua_app;
grant select, insert, update on organizations, facilities to padua_app;
grant select, insert, update on admins to padua_app;
-- The hash stays with padua_login_lookup: padua_app can write it (sign-up) but not read it back.
revoke select on admins from padua_app;
grant select (id, organization_id, email, name, role, facility_scope, manager_id, created_at) on admins to padua_app;
grant select, insert, delete on admin_facilities, sessions to padua_app;
grant select, insert, delete on login_failures to padua_app;

-- Is a facility within the signed-in admin's scope? For policies on future facility-level data:
--   using (organization_id = padua_current_org() and padua_in_scope(facility_id))
-- The facility has to be the current organization's (organization scope covers every facility of that organization,
-- never any facility id at all). Runs as the caller, so it's bound by the policies above too.
create function padua_in_scope(p_facility uuid) returns boolean
  language sql stable
  as $$
    select exists (
      select 1 from admins a
      join facilities f on f.organization_id = a.organization_id and f.id = p_facility
      where a.id = padua_current_admin()
        and a.organization_id = padua_current_org()
        and (a.facility_scope = 'organization'
             or exists (select 1 from admin_facilities af where af.admin_id = a.id and af.facility_id = f.id))
    )
  $$;

-- The two reads that have to happen before an organization is known. SECURITY DEFINER (they run as the owner, outside
-- the policies) with a pinned search_path, and each returns one admin's ids at most.
create function padua_login_lookup(p_email text)
  returns table (admin_id uuid, organization_id uuid, password_hash text)
  language sql stable security definer set search_path = pg_catalog, public
  as $$ select a.id, a.organization_id, a.password_hash from public.admins a where a.email = lower(btrim(p_email)) $$;

create function padua_session_lookup(p_token_hash text)
  returns table (admin_id uuid, organization_id uuid, expires_at timestamptz)
  language sql stable security definer set search_path = pg_catalog, public
  as $$
    select s.admin_id, s.organization_id, s.expires_at from public.sessions s
    where s.token_hash = p_token_hash and s.expires_at > now()
  $$;

revoke all on function padua_login_lookup(text), padua_session_lookup(text) from public;
grant execute on function padua_login_lookup(text), padua_session_lookup(text) to padua_app;
grant execute on function padua_current_org(), padua_current_admin(), padua_in_scope(uuid) to padua_app;
