-- 0003_audit.sql
-- Append-only audit log (FR-15), triggers that record security-sensitive
-- changes, and the administrator functions for role / status changes.

create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid,           -- null when the change came from the service role
  action      text not null,
  entity_type text not null,
  entity_id   text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

-- Administrators can read the log; nobody can write to it directly.
create policy audit_log_select_admin on public.audit_log
  for select to authenticated
  using (public.is_admin());

-- The log is append-only for everyone, including privileged roles.
create function public.audit_log_block_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only' using errcode = '42501';
end;
$$;

create trigger audit_log_no_update_delete
  before update or delete on public.audit_log
  for each row execute function public.audit_log_block_changes();

create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_block_changes();

-- Internal writer. Not callable by clients; only triggers and other
-- SECURITY DEFINER functions use it.
create function public.record_audit(
  p_action      text,
  p_entity_type text,
  p_entity_id   text,
  p_metadata    jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
$$;

revoke execute on function public.record_audit(text, text, text, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Triggers: profiles, sites, administrator site access
-- ---------------------------------------------------------------------------

create function public.audit_profiles_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    perform public.record_audit('user.role_changed', 'profile', new.id::text,
      jsonb_build_object('from', old.role, 'to', new.role));
  end if;
  if new.is_active is distinct from old.is_active then
    perform public.record_audit(
      case when new.is_active then 'user.activated' else 'user.deactivated' end,
      'profile', new.id::text, '{}'::jsonb);
  end if;
  if new.home_site_id is distinct from old.home_site_id then
    perform public.record_audit('user.home_site_changed', 'profile', new.id::text,
      jsonb_build_object('from', old.home_site_id, 'to', new.home_site_id));
  end if;
  return new;
end;
$$;

create trigger profiles_audit
  after update on public.profiles
  for each row execute function public.audit_profiles_changes();

create function public.audit_sites_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.record_audit('site.created', 'site', new.id::text,
      jsonb_build_object('name', new.name));
  elsif new.is_active is distinct from old.is_active then
    perform public.record_audit(
      case when new.is_active then 'site.activated' else 'site.deactivated' end,
      'site', new.id::text, '{}'::jsonb);
  elsif (new.name, new.latitude, new.longitude, new.radius_m, new.enforce_radius)
        is distinct from
        (old.name, old.latitude, old.longitude, old.radius_m, old.enforce_radius) then
    perform public.record_audit('site.updated', 'site', new.id::text,
      jsonb_build_object(
        'from', jsonb_build_object('name', old.name, 'latitude', old.latitude,
          'longitude', old.longitude, 'radius_m', old.radius_m,
          'enforce_radius', old.enforce_radius),
        'to', jsonb_build_object('name', new.name, 'latitude', new.latitude,
          'longitude', new.longitude, 'radius_m', new.radius_m,
          'enforce_radius', new.enforce_radius)));
  end if;
  return new;
end;
$$;

create trigger sites_audit
  after insert or update on public.sites
  for each row execute function public.audit_sites_changes();

create function public.audit_admin_site_access_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.record_audit('admin_scope.granted', 'profile', new.admin_id::text,
      jsonb_build_object('site_id', new.site_id));
    return new;
  end if;
  perform public.record_audit('admin_scope.revoked', 'profile', old.admin_id::text,
    jsonb_build_object('site_id', old.site_id));
  return old;
end;
$$;

create trigger admin_site_access_audit
  after insert or delete on public.admin_site_access
  for each row execute function public.audit_admin_site_access_changes();

-- ---------------------------------------------------------------------------
-- Administrator functions: role and status changes
-- Rules: caller must be an active administrator with scope over the target,
-- and cannot change their own role or status (prevents lock-out and silent
-- self-promotion). The audit trigger above records the change.
-- ---------------------------------------------------------------------------

create function public.admin_set_user_role(p_user_id uuid, p_role public.user_role)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own role' using errcode = '42501';
  end if;
  if not public.admin_can_access_employee(p_user_id) then
    raise exception 'User is outside your scope' using errcode = '42501';
  end if;

  update public.profiles
     set role = p_role
   where id = p_user_id
  returning * into v_row;

  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

create function public.admin_set_user_active(p_user_id uuid, p_active boolean)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own status' using errcode = '42501';
  end if;
  if not public.admin_can_access_employee(p_user_id) then
    raise exception 'User is outside your scope' using errcode = '42501';
  end if;

  update public.profiles
     set is_active = p_active
   where id = p_user_id
  returning * into v_row;

  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

revoke execute on function public.admin_set_user_role(uuid, public.user_role)  from public, anon;
revoke execute on function public.admin_set_user_active(uuid, boolean)         from public, anon;
grant  execute on function public.admin_set_user_role(uuid, public.user_role)  to authenticated;
grant  execute on function public.admin_set_user_active(uuid, boolean)         to authenticated;
