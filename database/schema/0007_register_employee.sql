-- 0007_register_employee.sql
-- Completes the registration of a newly created sign-in account.
--
-- Flow (see docs/architecture-decisions.md, ADR-007):
--   1. The server verifies the caller is an administrator with scope over the
--      chosen site.
--   2. The server creates the Supabase Auth user with the secret key. The
--      handle_new_user trigger gives it a profile with role 'employee' and no
--      home site, so no administrator can see it yet.
--   3. The server calls this function (service role only) to set the name and
--      home site and to write an audit entry naming the administrator.
--
-- The function re-checks the administrator's scope itself, so a bug in the
-- server code cannot register someone at a site the administrator does not
-- manage. It only ever configures a profile that is still unregistered
-- (employee, no home site), so it cannot be used to move existing people.

create function public.register_employee_profile(
  p_actor_id     uuid,
  p_user_id      uuid,
  p_full_name    text,
  p_home_site_id uuid
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_full_name, ''));
  v_row  public.profiles;
begin
  if p_actor_id is null or not exists (
    select 1 from public.profiles a
     where a.id = p_actor_id and a.role = 'admin' and a.is_active
  ) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.admin_site_access s
     where s.admin_id = p_actor_id and s.site_id = p_home_site_id
  ) then
    raise exception 'Site is outside your scope' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.sites s where s.id = p_home_site_id and s.is_active
  ) then
    raise exception 'Site not found or inactive' using errcode = 'P0002';
  end if;

  if length(v_name) < 2 or length(v_name) > 100 then
    raise exception 'Full name must be 2 to 100 characters' using errcode = '22023';
  end if;

  update public.profiles
     set full_name = v_name,
         home_site_id = p_home_site_id
   where id = p_user_id
     and role = 'employee'
     and home_site_id is null
  returning * into v_row;

  if not found then
    raise exception 'Account not found or already registered' using errcode = 'P0002';
  end if;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (
    p_actor_id,
    'user.registered',
    'profile',
    p_user_id::text,
    jsonb_build_object('home_site_id', p_home_site_id, 'email', v_row.email)
  );

  return v_row;
end;
$$;

-- Never callable from the browser: only the server, with the secret key.
revoke execute on function public.register_employee_profile(uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.register_employee_profile(uuid, uuid, text, uuid)
  to service_role;
