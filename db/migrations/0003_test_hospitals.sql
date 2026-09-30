-- V7.6.5c: test hospitals. A made-up hospital an organization can use to try Padua (src/lib/data/sandbox.ts makes its
-- data from a real hospital's public filings). It's a facility of the organization, so the organization's row-level
-- security already keeps it private: only that organization's people, within their facility scope, can learn it exists.
-- The data itself is never stored: it's regenerated from (source, seed) on each use.

create table sandbox_hospitals (
  facility_id uuid primary key,
  organization_id uuid not null,
  -- The id it goes by in URLs and data, in a range no HCAI hospital uses.
  public_id text not null unique check (public_id ~ '^999[0-9]{6}$'),
  -- The real hospital whose filings it's made from, and the seed that fixes the changes.
  source_hcai_id text not null check (source_hcai_id ~ '^[0-9]{9}$'),
  seed integer not null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, facility_id) references facilities (organization_id, id) on delete cascade
);

alter table sandbox_hospitals enable row level security;
create policy tenant on sandbox_hospitals to padua_app
  using (organization_id = padua_current_org()) with check (organization_id = padua_current_org());
grant select on sandbox_hospitals to padua_app;

-- Creates the facility and its test-hospital record. Internal: called by the two guarded functions below.
create function padua_new_test_hospital(p_org uuid, p_name text, p_public_id text, p_source text, p_seed integer) returns uuid
  language plpgsql
  as $$
  declare v_id uuid;
  begin
    if length(btrim(coalesce(p_name, ''))) not between 1 and 200 then perform padua_refuse('bad-request'); end if;
    insert into facilities (organization_id, name, hcai_facility_id) values (p_org, btrim(p_name), null) returning id into v_id;
    insert into sandbox_hospitals (facility_id, organization_id, public_id, source_hcai_id, seed) values (v_id, p_org, p_public_id, p_source, p_seed);
    return v_id;
  exception when unique_violation then
    -- The random public id collided with another test hospital's; the app picks another and tries again.
    perform padua_refuse('id-taken');
  end
  $$;

-- Adding one later: the same rule as adding any facility (an owner or admin who sees the whole organization).
create function padua_add_test_hospital(p_name text, p_public_id text, p_source text, p_seed integer) returns uuid
  language plpgsql security definer set search_path = pg_catalog, public
  as $$
  declare a record;
  begin
    a := padua_actor();
    if a.role = 'member' then perform padua_refuse('not-a-manager'); end if;
    if a.scope <> 'organization' then perform padua_refuse('needs-organization-scope'); end if;
    return padua_new_test_hospital(a.org, p_name, p_public_id, p_source, p_seed);
  end
  $$;

-- Signing up with a test hospital instead of a real one: as padua_sign_up, with the test hospital as the first facility.
create function padua_sign_up_with_test_hospital(p_org_name text, p_test_name text, p_public_id text, p_source text, p_seed integer, p_email text, p_name text, p_password_hash text)
  returns void
  language plpgsql security definer set search_path = pg_catalog, public
  as $$
  declare
    v_org uuid := padua_current_org();
    v_admin uuid := padua_current_admin();
  begin
    if v_org is null or v_admin is null then perform padua_refuse('not-signed-in'); end if;
    insert into organizations (id, name) values (v_org, btrim(p_org_name));
    perform padua_new_test_hospital(v_org, p_test_name, p_public_id, p_source, p_seed);
    insert into admins (id, organization_id, email, name, password_hash, role, facility_scope)
    values (v_admin, v_org, lower(btrim(p_email)), btrim(p_name), p_password_hash, 'owner', 'organization');
  exception when unique_violation then
    if sqlerrm like '%admins_email_key%' then perform padua_refuse('email-taken'); end if;
    raise;
  end
  $$;

revoke all on function padua_new_test_hospital(uuid, text, text, text, integer) from public;
revoke all on function padua_add_test_hospital(text, text, text, integer), padua_sign_up_with_test_hospital(text, text, text, text, integer, text, text, text) from public;
grant execute on function padua_add_test_hospital(text, text, text, integer), padua_sign_up_with_test_hospital(text, text, text, text, integer, text, text, text) to padua_app;
