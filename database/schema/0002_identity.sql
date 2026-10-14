-- 0002_identity.sql
-- Profiles (one per Supabase Auth user), sites, administrator site scope,
-- access helper functions and their Row Level Security policies.
--
-- Scope model (FR-02, FR-06, FR-07):
--   * An employee sees only their own records.
--   * An administrator sees records only for sites listed in
--     public.admin_site_access. Attendance and alerts are scoped by the site
--     they belong to; leave requests are scoped by the employee's home site.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.sites (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  address        text,
  latitude       double precision not null,
  longitude      double precision not null,
  radius_m       integer not null default 150,
  -- When true, check-ins that cannot be verified inside the radius are
  -- rejected. When false they are recorded and flagged. The site-presence
  -- method is still an open decision, so the default is the permissive one.
  enforce_radius boolean not null default false,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint sites_name_not_blank check (length(btrim(name)) > 0),
  constraint sites_latitude_range check (latitude between -90 and 90),
  constraint sites_longitude_range check (longitude between -180 and 180),
  constraint sites_radius_range check (radius_m between 10 and 5000)
);

create trigger sites_set_updated_at
  before update on public.sites
  for each row execute function public.set_updated_at();

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  full_name    text not null default '',
  role         public.user_role not null default 'employee',
  home_site_id uuid references public.sites (id) on delete set null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index profiles_home_site_idx on public.profiles (home_site_id);
create index profiles_role_idx on public.profiles (role);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Which sites each administrator may see.
create table public.admin_site_access (
  admin_id   uuid not null references public.profiles (id) on delete cascade,
  site_id    uuid not null references public.sites (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (admin_id, site_id)
);

create index admin_site_access_site_idx on public.admin_site_access (site_id);

-- ---------------------------------------------------------------------------
-- Access helper functions
-- SECURITY DEFINER so policies on profiles can call them without recursing
-- into profiles' own policies. They only ever answer about auth.uid().
-- ---------------------------------------------------------------------------

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.is_active
  );
$$;

create function public.admin_can_access_site(p_site_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
    and exists (
      select 1
      from public.admin_site_access a
      where a.admin_id = auth.uid()
        and a.site_id = p_site_id
    );
$$;

create function public.admin_can_access_employee(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
    and exists (
      select 1
      from public.profiles e
      join public.admin_site_access a on a.site_id = e.home_site_id
      where e.id = p_employee_id
        and a.admin_id = auth.uid()
    );
$$;

-- ---------------------------------------------------------------------------
-- New-user trigger
-- Every Auth user gets a profile. The role is ALWAYS 'employee': it is never
-- read from user metadata, because clients can set their own metadata.
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(btrim(new.raw_user_meta_data ->> 'full_name'), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Privileges and Row Level Security
-- Supabase grants broad default privileges, so everything is revoked first and
-- only what is needed is granted back. RLS is then the second gate.
-- ---------------------------------------------------------------------------

alter table public.sites             enable row level security;
alter table public.profiles          enable row level security;
alter table public.admin_site_access enable row level security;

revoke all on public.sites             from anon, authenticated;
revoke all on public.profiles          from anon, authenticated;
revoke all on public.admin_site_access from anon, authenticated;

-- sites: everyone signed in can see active sites (needed to check in);
-- administrators manage the sites in their scope. No deletes: deactivate.
grant select, insert, update on public.sites to authenticated;

create policy sites_select on public.sites
  for select to authenticated
  using (is_active or public.admin_can_access_site(id));

create policy sites_insert_admin on public.sites
  for insert to authenticated
  with check (public.is_admin());

create policy sites_update_admin on public.sites
  for update to authenticated
  using (public.admin_can_access_site(id))
  with check (public.admin_can_access_site(id));

-- A site's creator is automatically given access to it.
create function public.grant_creator_site_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and public.is_admin() then
    insert into public.admin_site_access (admin_id, site_id)
    values (auth.uid(), new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger sites_grant_creator_access
  after insert on public.sites
  for each row execute function public.grant_creator_site_access();

-- profiles: own row, plus employees within an administrator's scope.
-- Users may change only their own full_name (column-level grant), so nobody
-- can promote themselves or re-home themselves. Role and status changes go
-- through the admin functions in 0003.
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.admin_can_access_employee(id));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- admin_site_access: an administrator can read their own grants.
-- Grants are managed by the service role (see back-end seed script).
grant select on public.admin_site_access to authenticated;

create policy admin_site_access_select_own on public.admin_site_access
  for select to authenticated
  using (admin_id = auth.uid());

-- Helper functions are callable by signed-in users only.
revoke execute on function public.is_admin()                       from public, anon;
revoke execute on function public.admin_can_access_site(uuid)      from public, anon;
revoke execute on function public.admin_can_access_employee(uuid)  from public, anon;
grant  execute on function public.is_admin()                       to authenticated;
grant  execute on function public.admin_can_access_site(uuid)      to authenticated;
grant  execute on function public.admin_can_access_employee(uuid)  to authenticated;
