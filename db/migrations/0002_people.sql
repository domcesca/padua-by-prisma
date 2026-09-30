-- V7.6.5b: invites, managing people, and the management hierarchy.
--
-- Privilege-escalation guard: from here on the app role (padua_app) can't write roles, facility scopes, managers,
-- membership, facilities or invites directly. Every such change goes through one of the SECURITY DEFINER functions
-- below, which take the actor from padua.admin_id (set from the verified session) and apply the rules in
-- src/lib/org/permissions.ts: you can't give a role above your own or access beyond your own, and you can't manage
-- someone who outranks you or sees more than you. scripts/check-permissions.mts checks every combination of the
-- functions against those rules. Two triggers back the functions up whatever the caller: no reporting-line cycles, and
-- never an organization without an owner.
--
-- Definer functions run as the owner, outside row-level security, so each one filters on padua_current_org() itself.

-- ---------------------------------------------------------------------------------------------------------------------
-- Tables

create table invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and length(email) between 3 and 320),
  role text not null check (role in ('owner', 'admin', 'member')),
  facility_scope text not null check (facility_scope in ('organization', 'facilities')),
  -- SHA-256 of the link's token. The token itself is shown once, to the inviter, and never stored.
  token_hash text not null unique,
  invited_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_admin_id uuid,
  revoked_at timestamptz,
  revoked_by uuid,
  check (accepted_at is null or revoked_at is null),
  unique (organization_id, id),
  foreign key (organization_id, invited_by) references admins (organization_id, id) on delete set null (invited_by),
  foreign key (organization_id, revoked_by) references admins (organization_id, id) on delete set null (revoked_by),
  foreign key (organization_id, accepted_admin_id) references admins (organization_id, id) on delete set null (accepted_admin_id)
);
create index invites_pending_idx on invites (organization_id, email) where accepted_at is null and revoked_at is null;

create table invite_facilities (
  organization_id uuid not null,
  invite_id uuid not null,
  facility_id uuid not null,
  primary key (invite_id, facility_id),
  foreign key (organization_id, invite_id) references invites (organization_id, id) on delete cascade,
  foreign key (organization_id, facility_id) references facilities (organization_id, id) on delete cascade
);

-- Every change of ownership made through a manager, for tables that use padua_owned_row_guard (none yet). A manager can
-- move their reports' work, never quietly: each move is recorded here.
create table ownership_transfers (
  id bigint generated always as identity primary key,
  organization_id uuid not null references organizations (id) on delete cascade,
  table_name text not null,
  row_id text,
  from_admin uuid,
  to_admin uuid,
  by_admin uuid,
  at timestamptz not null default now()
);

alter table invites enable row level security;
alter table invite_facilities enable row level security;
alter table ownership_transfers enable row level security;
create policy tenant on invites to padua_app using (organization_id = padua_current_org()) with check (organization_id = padua_current_org());
create policy tenant on invite_facilities to padua_app using (organization_id = padua_current_org()) with check (organization_id = padua_current_org());
create policy tenant on ownership_transfers to padua_app using (organization_id = padua_current_org()) with check (organization_id = padua_current_org());

grant select (id, organization_id, email, role, facility_scope, invited_by, created_at, expires_at, accepted_at, accepted_admin_id, revoked_at, revoked_by)
  on invites to padua_app;
grant select on invite_facilities to padua_app;
grant select, insert on ownership_transfers to padua_app;

-- The app role loses every direct write that carries privilege. What's left: sessions (its own sign-in and sign-out)
-- and login failures.
revoke insert, update on organizations, facilities, admins from padua_app;
revoke insert, delete on admin_facilities from padua_app;

-- ---------------------------------------------------------------------------------------------------------------------
-- Rules (the same as src/lib/org/permissions.ts)

create function padua_rank(p_role text) returns int
  language sql immutable
  as $$ select case p_role when 'owner' then 3 when 'admin' then 2 when 'member' then 1 end $$;

-- Does scope a include scope s?
create function padua_covers(a_scope text, a_fac uuid[], s_scope text, s_fac uuid[]) returns boolean
  language sql immutable
  as $$ select a_scope = 'organization' or (s_scope = 'facilities' and cardinality(s_fac) > 0 and s_fac <@ a_fac) $$;

-- Why the actor (a) can't manage the target (t), or null if they can.
create function padua_refuse_manage(a_role text, a_scope text, a_fac uuid[], t_role text, t_scope text, t_fac uuid[]) returns text
  language sql immutable
  as $$
    select case
      when a_role = 'member' then 'not-a-manager'
      when padua_rank(t_role) > padua_rank(a_role) then 'target-outranks'
      when not padua_covers(a_scope, a_fac, t_scope, t_fac) then 'target-outside-scope'
    end
  $$;

-- Why the actor (a) can't grant role g_role with scope g_scope/g_fac, or null if they can.
create function padua_refuse_grant(a_role text, a_scope text, a_fac uuid[], g_role text, g_scope text, g_fac uuid[]) returns text
  language sql immutable
  as $$
    select case
      when a_role = 'member' then 'not-a-manager'
      when padua_rank(g_role) > padua_rank(a_role) then 'role-too-high'
      when g_scope = 'facilities' and cardinality(g_fac) = 0 then 'no-facilities'
      when not padua_covers(a_scope, a_fac, g_scope, g_fac) then 'scope-too-broad'
    end
  $$;

create function padua_refuse(p_code text) returns void
  language plpgsql volatile
  as $$ begin if p_code is not null then raise exception 'padua:%', p_code using errcode = 'P0001'; end if; end $$;

-- An admin's facility list (empty for organization scope).
create function padua_facilities_of(p_admin uuid) returns uuid[]
  language sql stable
  as $$ select coalesce(array_agg(facility_id order by facility_id), '{}') from admin_facilities where admin_id = p_admin $$;

-- One writer at a time per organization for people changes, so two concurrent edits can't together break a rule that
-- each alone keeps (a reporting-line loop, or no owner left).
create function padua_lock_org(p_org uuid) returns void
  language sql volatile
  as $$ select pg_advisory_xact_lock(hashtextextended('padua-org:' || p_org::text, 0)) $$;

-- Facility ids for a grant: none for organization scope; otherwise distinct, and every one must be this organization's.
create function padua_grant_facilities(p_org uuid, p_scope text, p_fac uuid[]) returns uuid[]
  language plpgsql stable
  as $$
  declare v uuid[];
  begin
    if p_scope not in ('organization', 'facilities') then perform padua_refuse('bad-request'); end if;
    if p_scope = 'organization' then return '{}'; end if;
    select coalesce(array_agg(distinct f order by f), '{}') into v from unnest(coalesce(p_fac, '{}')) f;
    if exists (select 1 from unnest(v) f where not exists (select 1 from facilities where id = f and organization_id = p_org)) then
      perform padua_refuse('not-found');
    end if;
    return v;
  end
  $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Hierarchy (security invoker: under the caller's row-level security; the org filter is explicit as well, for calls from
-- the definer functions)

-- Everyone who reports to p_admin, directly or down the chain, and p_admin. UNION (not UNION ALL) drops rows already
-- seen, so this ends even if a loop were ever stored.
create function padua_subtree(p_admin uuid) returns setof uuid
  language sql stable
  as $$
    with recursive down (id) as (
      select p_admin
      union
      select a.id from admins a join down d on a.manager_id = d.id where a.organization_id = padua_current_org()
    )
    select id from down
  $$;

-- Everyone above p_admin in the chain (not p_admin). Loop-safe the same way.
create function padua_managers_of(p_admin uuid) returns setof uuid
  language sql stable
  as $$
    with recursive up (id, manager_id) as (
      select id, manager_id from admins where id = p_admin and organization_id = padua_current_org()
      union
      select a.id, a.manager_id from admins a join up on a.id = up.manager_id where a.organization_id = padua_current_org()
    )
    select id from up where id <> p_admin
  $$;

-- Is p_manager above p_report, at any distance?
create function padua_manages(p_manager uuid, p_report uuid) returns boolean
  language sql stable
  as $$ select exists (select 1 from padua_managers_of(p_report) m where m = p_manager) $$;

-- Whose data the signed-in admin sees through the hierarchy: themselves and everyone below them. For policies, wrap
-- it in a subquery so it runs once per statement, not per row:  owner_admin_id = any ((select padua_visible_owners())::uuid[])
create function padua_visible_owners() returns uuid[]
  language sql stable
  as $$ select coalesce(array_agg(s), '{}') from padua_subtree(padua_current_admin()) s $$;

-- The facilities the signed-in admin's scope covers, as an array (same once-per-statement pattern).
create function padua_scope_facilities() returns uuid[]
  language sql stable
  as $$ select coalesce(array_agg(f.id), '{}') from facilities f where f.organization_id = padua_current_org() and padua_in_scope(f.id) $$;

-- For future tables of organization data owned by one admin (owner_admin_id): the owner edits; a manager above them can
-- see it and hand it to someone in their own part of the chain, but change nothing else, and each hand-off is logged.
-- Attach as: create trigger owned_guard before update on <table> for each row execute function padua_owned_row_guard();
create function padua_owned_row_guard() returns trigger
  language plpgsql
  as $$
  declare
    v_actor uuid := padua_current_admin();
  begin
    if new.owner_admin_id is distinct from old.owner_admin_id then
      if not (new.owner_admin_id = any (padua_visible_owners())) then
        raise exception 'padua:reassign-outside-reports' using errcode = 'P0001';
      end if;
    end if;
    if v_actor is distinct from old.owner_admin_id then
      if not padua_manages(v_actor, old.owner_admin_id) then
        raise exception 'padua:not-owner' using errcode = 'P0001';
      end if;
      if (to_jsonb(new) - 'owner_admin_id') <> (to_jsonb(old) - 'owner_admin_id') then
        raise exception 'padua:manager-cannot-edit' using errcode = 'P0001';
      end if;
    end if;
    if new.owner_admin_id is distinct from old.owner_admin_id then
      insert into ownership_transfers (organization_id, table_name, row_id, from_admin, to_admin, by_admin)
      values (old.organization_id, tg_table_name, to_jsonb(old) ->> 'id', old.owner_admin_id, new.owner_admin_id, v_actor);
    end if;
    return new;
  end
  $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Backstops, whatever writes the row

-- No one ends up above themselves. The lock serializes manager changes within an organization, and each check reads
-- the latest committed chain, so two concurrent edits can't close a loop between them.
create function padua_admins_chain_guard() returns trigger
  language plpgsql
  as $$
  begin
    if new.manager_id is not null and (tg_op = 'INSERT' or new.manager_id is distinct from old.manager_id) then
      perform padua_lock_org(new.organization_id);
      if new.manager_id = new.id or exists (
        with recursive up (id, manager_id) as (
          select id, manager_id from admins where id = new.manager_id
          union
          select a.id, a.manager_id from admins a join up on a.id = up.manager_id
        )
        select 1 from up where id = new.id
      ) then
        raise exception 'padua:cycle' using errcode = 'P0001';
      end if;
    end if;
    return new;
  end
  $$;
create trigger chain_guard before insert or update of manager_id on admins for each row execute function padua_admins_chain_guard();

-- Never an organization without an owner (unless the organization itself is being deleted).
create function padua_admins_owner_guard() returns trigger
  language plpgsql
  as $$
  begin
    if old.role = 'owner'
       and exists (select 1 from organizations where id = old.organization_id)
       and not exists (select 1 from admins where organization_id = old.organization_id and role = 'owner') then
      raise exception 'padua:last-owner' using errcode = 'P0001';
    end if;
    return null;
  end
  $$;
create trigger owner_guard after update of role or delete on admins for each row execute function padua_admins_owner_guard();

-- ---------------------------------------------------------------------------------------------------------------------
-- The only ways to change people, facilities and invites

-- Sign-up (replaces V7.6.5a's direct inserts): a new organization, its first facility, and the signer as its Owner, in
-- the organization and admin ids the app set for this transaction.
create function padua_sign_up(p_org_name text, p_facility_name text, p_hcai text, p_email text, p_name text, p_password_hash text) returns void
  language plpgsql security definer set search_path = pg_catalog, public
  as $$
  declare
    v_org uuid := padua_current_org();
    v_admin uuid := padua_current_admin();
  begin
    if v_org is null or v_admin is null then perform padua_refuse('not-signed-in'); end if;
    insert into organizations (id, name) values (v_org, btrim(p_org_name));
    insert into facilities (organization_id, name, hcai_facility_id) values (v_org, p_facility_name, p_hcai);
    insert into admins (id, organization_id, email, name, password_hash, role, facility_scope)
    values (v_admin, v_org, lower(btrim(p_email)), btrim(p_name), p_password_hash, 'owner', 'organization');
  exception when unique_violation then
    if sqlerrm like '%admins_email_key%' then perform padua_refuse('email-taken'); end if;
    raise;
  end
  $$;

-- The signed-in admin, as the actor of a change. Raises if there's none in this organization.
create function padua_actor(out id uuid, out org uuid, out role text, out scope text, out fac uuid[])
  language plpgsql stable
  as $$
  begin
    select a.id, a.organization_id, a.role, a.facility_scope into id, org, role, scope
    from admins a where a.id = padua_current_admin() and a.organization_id = padua_current_org();
    if id is null then perform padua_refuse('not-signed-in'); end if;
    fac := padua_facilities_of(id);
  end
  $$;

-- Someone in the actor's organization. Raises not-found for anyone else, including other organizations' people.
create function padua_member(p_org uuid, p_admin uuid, out id uuid, out role text, out scope text, out fac uuid[], out manager_id uuid)
  language plpgsql stable
  as $$
  begin
    select a.id, a.role, a.facility_scope, a.manager_id into id, role, scope, manager_id
    from admins a where a.id = p_admin and a.organization_id = p_org;
    if id is null then perform padua_refuse('not-found'); end if;
    fac := padua_facilities_of(id);
  end
  $$;

create function padua_create_invite(p_email text, p_role text, p_scope text, p_fac uuid[], p_token_hash text, p_days int) returns uuid
  language plpgsql security definer set search_path = pg_catalog, public
  as $$
  declare
    a record;
    g uuid[];
    p record;
    v_email text := lower(btrim(p_email));
    v_id uuid;
  begin
    a := padua_actor();
    perform padua_lock_org(a.org);
    if p_role not in ('owner', 'admin', 'member') or p_days not between 1 and 30 then perform padua_refuse('bad-request'); end if;
    g := padua_grant_facilities(a.org, p_scope, p_fac);
    perform padua_refuse(padua_refuse_grant(a.role, a.scope, a.fac, p_role, p_scope, g));
    if exists (select 1 from admins where organization_id = a.org and email = v_email) then perform padua_refuse('already-member'); end if;
    -- A new invite replaces any pending one for the same email, which the actor must be able to revoke.
    for p in select i.id, i.role, i.facility_scope,
               coalesce((select array_agg(facility_id order by facility_id) from invite_facilities where invite_id = i.id), '{}') as fac
             from invites i
             where i.organization_id = a.org and i.email = v_email and i.accepted_at is null and i.revoked_at is null loop
      perform padua_refuse(padua_refuse_manage(a.role, a.scope, a.fac, p.role, p.facility_scope, p.fac));
      update invites set revoked_at = now(), revoked_by = a.id where id = p.id;
    end loop;
    insert into invites (organization_id, email, role, facility_scope, token_hash, invited_by, expires_at)
    values (a.org, v_email, p_role, p_scope, p_token_hash, a.id, now() + make_interval(days => p_days))
    returning id into v_id;
    insert into invite_facilities (organization_id, invite_id, facility_id) select a.org, v_id, unnest(g);
    return v_id;
  end
  $$;

create function padua_revoke_invite(p_invite uuid) returns void
  language plpgsql security definer set search_path = pg_catalog, public
  as $$
  declare
    a record;
    i record;
  begin
    a := padua_actor();
    perform padua_lock_org(a.org);
    select inv.id, inv.role, inv.facility_scope, inv.accepted_at, inv.revoked_at, inv.expires_at,
           coalesce((select array_agg(facility_id order by facility_id) from invite_facilities where invite_id = inv.id), '{}') as fac
      into i from invites inv where inv.id = p_invite and inv.organization_id = a.org;
    if i.id is null then perform padua_refuse('not-found'); end if;
    if i.accepted_at is not null or i.revoked_at is not null then perform padua_refuse('invite-not-pending'); end if;
    perform padua_refuse(padua_refuse_manage(a.role, a.scope, a.fac, i.role, i.facility_scope, i.fac));
    update invites set revoked_at = now(), revoked_by = a.id where id = i.id;
  end
  $$;

-- What an invite link shows before it's accepted. Anyone holding the link may read this; nothing without it.
create function padua_invite_lookup(p_token_hash text)
  returns table (organization_name text, invited_by_name text, email text, role text, facility_scope text, facility_names text[], status text, expires_at timestamptz)
  language sql stable security definer set search_path = pg_catalog, public
  as $$
    select o.name, a.name, i.email, i.role, i.facility_scope,
           coalesce((select array_agg(f.name order by f.name) from invite_facilities x join facilities f on f.id = x.facility_id where x.invite_id = i.id), '{}'),
           case when i.accepted_at is not null then 'accepted' when i.revoked_at is not null then 'revoked'
                when i.expires_at <= now() then 'expired' else 'pending' end,
           i.expires_at
    from invites i join organizations o on o.id = i.organization_id left join admins a on a.id = i.invited_by
    where i.token_hash = p_token_hash
  $$;

-- Accepting: once, before it expires, unless revoked; and only while whoever sent it could still send it (an inviter
-- since removed or narrowed can't leave a stronger invite behind). Creates the admin with the invite's role and scope.
create function padua_accept_invite(p_token_hash text, p_name text, p_password_hash text, out admin_id uuid, out organization_id uuid)
  language plpgsql security definer set search_path = pg_catalog, public
  as $$
  declare
    i record;
    s record;
    g uuid[];
  begin
    select * into i from invites where token_hash = p_token_hash for update;
    if i.id is null then perform padua_refuse('invite-invalid'); end if;
    perform padua_lock_org(i.organization_id);
    if i.accepted_at is not null then perform padua_refuse('invite-accepted'); end if;
    if i.revoked_at is not null then perform padua_refuse('invite-revoked'); end if;
    if i.expires_at <= now() then perform padua_refuse('invite-expired'); end if;
    g := coalesce((select array_agg(facility_id order by facility_id) from invite_facilities where invite_id = i.id), '{}');
    select a.role, a.facility_scope, padua_facilities_of(a.id) as fac into s from admins a where a.id = i.invited_by and a.organization_id = i.organization_id;
    if s.role is null or padua_refuse_grant(s.role, s.facility_scope, s.fac, i.role, i.facility_scope, g) is not null then
      perform padua_refuse('invite-inviter-changed');
    end if;
    begin
      insert into admins (organization_id, email, name, password_hash, role, facility_scope)
      values (i.organization_id, i.email, btrim(p_name), p_password_hash, i.role, i.facility_scope)
      returning id into admin_id;
    exception when unique_violation then
      perform padua_refuse('email-taken');
    end;
    insert into admin_facilities (organization_id, admin_id, facility_id) select i.organization_id, admin_id, unnest(g);
    update invites set accepted_at = now(), accepted_admin_id = admin_id where id = i.id;
    organization_id := i.organization_id;
  end
  $$;

create function padua_set_access(p_target uuid, p_role text, p_scope text, p_fac uuid[]) returns void
  language plpgsql security definer set search_path = pg_catalog, public
  as $$
  declare
    a record;
    t record;
    g uuid[];
  begin
    a := padua_actor();
    perform padua_lock_org(a.org);
    a := padua_actor();
    t := padua_member(a.org, p_target);
    if p_role not in ('owner', 'admin', 'member') then perform padua_refuse('bad-request'); end if;
    g := padua_grant_facilities(a.org, p_scope, p_fac);
    perform padua_refuse(padua_refuse_manage(a.role, a.scope, a.fac, t.role, t.scope, t.fac));
    perform padua_refuse(padua_refuse_grant(a.role, a.scope, a.fac, p_role, p_scope, g));
    if t.role = 'owner' and p_role <> 'owner' and (select count(*) from admins where organization_id = a.org and role = 'owner') <= 1 then
      perform padua_refuse('last-owner');
    end if;
    update admins set role = p_role, facility_scope = p_scope where id = t.id;
    delete from admin_facilities where admin_id = t.id;
    insert into admin_facilities (organization_id, admin_id, facility_id) select a.org, t.id, unnest(g);
  end
  $$;

-- Removing someone: their reports move up to the removed person's own manager, so the chain above stays intact; their
-- sessions end (cascade), so they're signed out at once.
create function padua_remove_admin(p_target uuid) returns void
  language plpgsql security definer set search_path = pg_catalog, public
  as $$
  declare
    a record;
    t record;
  begin
    a := padua_actor();
    perform padua_lock_org(a.org);
    a := padua_actor();
    t := padua_member(a.org, p_target);
    if t.id = a.id then perform padua_refuse('self-remove'); end if;
    perform padua_refuse(padua_refuse_manage(a.role, a.scope, a.fac, t.role, t.scope, t.fac));
    if t.role = 'owner' and (select count(*) from admins where organization_id = a.org and role = 'owner') <= 1 then
      perform padua_refuse('last-owner');
    end if;
    update admins set manager_id = t.manager_id where organization_id = a.org and manager_id = t.id;
    delete from admins where id = t.id;
  end
  $$;

create function padua_set_manager(p_target uuid, p_manager uuid) returns void
  language plpgsql security definer set search_path = pg_catalog, public
  as $$
  declare
    a record;
    t record;
    s record;
  begin
    a := padua_actor();
    perform padua_lock_org(a.org);
    a := padua_actor();
    t := padua_member(a.org, p_target);
    if p_manager is not null then perform padua_member(a.org, p_manager); end if;
    perform padua_refuse(padua_refuse_manage(a.role, a.scope, a.fac, t.role, t.scope, t.fac));
    if p_manager is not null then
      if p_manager in (select padua_subtree(t.id)) then perform padua_refuse('cycle'); end if;
      for s in select x.role, x.facility_scope, padua_facilities_of(x.id) as fac
               from admins x where x.organization_id = a.org and x.id in (select padua_subtree(t.id)) loop
        if padua_refuse_manage(a.role, a.scope, a.fac, s.role, s.facility_scope, s.fac) is not null then
          perform padua_refuse('reports-outside-scope');
        end if;
      end loop;
    end if;
    update admins set manager_id = p_manager where id = t.id;
  end
  $$;

create function padua_add_facility(p_name text, p_hcai text) returns uuid
  language plpgsql security definer set search_path = pg_catalog, public
  as $$
  declare
    a record;
    v_id uuid;
  begin
    a := padua_actor();
    if a.role = 'member' then perform padua_refuse('not-a-manager'); end if;
    if a.scope <> 'organization' then perform padua_refuse('needs-organization-scope'); end if;
    if exists (select 1 from facilities where organization_id = a.org and hcai_facility_id = p_hcai) then perform padua_refuse('facility-exists'); end if;
    insert into facilities (organization_id, name, hcai_facility_id) values (a.org, btrim(p_name), p_hcai) returning id into v_id;
    return v_id;
  end
  $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- Privileges

revoke all on function
  padua_sign_up(text, text, text, text, text, text),
  padua_create_invite(text, text, text, uuid[], text, int),
  padua_revoke_invite(uuid),
  padua_invite_lookup(text),
  padua_accept_invite(text, text, text),
  padua_set_access(uuid, text, text, uuid[]),
  padua_remove_admin(uuid),
  padua_set_manager(uuid, uuid),
  padua_add_facility(text, text)
from public;
grant execute on function
  padua_sign_up(text, text, text, text, text, text),
  padua_create_invite(text, text, text, uuid[], text, int),
  padua_revoke_invite(uuid),
  padua_invite_lookup(text),
  padua_accept_invite(text, text, text),
  padua_set_access(uuid, text, text, uuid[]),
  padua_remove_admin(uuid),
  padua_set_manager(uuid, uuid),
  padua_add_facility(text, text),
  padua_subtree(uuid),
  padua_managers_of(uuid),
  padua_manages(uuid, uuid),
  padua_visible_owners(),
  padua_scope_facilities()
to padua_app;
