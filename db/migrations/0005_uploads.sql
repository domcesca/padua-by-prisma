-- V7.6.5d: private uploads ("bring your own data"), one admin's files, visible to that admin alone.
--
-- The file's bytes live in the row itself (content), so the policy below covers them exactly as it covers the name
-- and date: there is no second store to keep in step. Unlike every table before it, uploads is private to a person,
-- not shared with the organization: the policy matches the signed-in admin as well as the organization. No one else
-- sees these rows, whatever their role or place in the reporting chain; nothing reads them as the owner role
-- (no SECURITY DEFINER function touches this table).
--
-- Allowed types are the ones the app checks by content (src/lib/uploads/sniff.ts): CSV, Excel (.xlsx), JSON, plain
-- text. At most 4 MB each, under Vercel's 4.5 MB request limit.

create table uploads (
  id uuid primary key default gen_random_uuid(),
  -- Both default to the signed-in admin, so the app never supplies them; the policy refuses any other value.
  organization_id uuid not null default padua_current_org(),
  admin_id uuid not null default padua_current_admin(),
  file_name text not null check (length(file_name) between 1 and 255 and file_name !~ '[[:cntrl:]/\\]'),
  label text check (label is null or length(btrim(label)) between 1 and 200),
  content_type text not null check (content_type in (
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/json',
    'text/plain'
  )),
  size_bytes integer not null check (size_bytes between 1 and 4194304),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  content bytea not null,
  created_at timestamptz not null default now(),
  check (octet_length(content) = size_bytes),
  -- Removing a person removes their uploads: no one else could ever open them.
  foreign key (organization_id, admin_id) references admins (organization_id, id) on delete cascade
);
create index uploads_admin_idx on uploads (admin_id, created_at desc);

alter table uploads enable row level security;
create policy owner_only on uploads to padua_app
  using (organization_id = padua_current_org() and admin_id = padua_current_admin())
  with check (organization_id = padua_current_org() and admin_id = padua_current_admin());

-- No update: uploads can't be edited or replaced yet.
grant select, insert, delete on uploads to padua_app;
