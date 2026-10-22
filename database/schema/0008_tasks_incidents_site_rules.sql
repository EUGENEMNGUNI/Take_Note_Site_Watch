-- 0008_tasks_incidents_site_rules.sql
-- Site manager scope, tasks, incident reports and per-site working rules.
--
-- Writes to tasks and incidents go through SECURITY DEFINER functions only
-- (no insert/update grants), so every rule below is enforced in the database.

-- ---------------------------------------------------------------------------
-- Site rules (administrators edit these through the existing sites policy)
-- ---------------------------------------------------------------------------

alter table public.sites
  add column work_start time not null default '08:00',
  add column work_end time not null default '17:00',
  add column authorised_network text,
  add constraint sites_work_hours_ordered check (work_end > work_start),
  add constraint sites_network_length check (authorised_network is null or length(authorised_network) <= 200);

-- ---------------------------------------------------------------------------
-- Manager helpers
-- ---------------------------------------------------------------------------

create function public.is_manager()
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
      and p.role = 'manager'
      and p.is_active
      and p.home_site_id is not null
  );
$$;

create function public.manager_can_access_site(p_site_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_site_id is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'manager'
        and p.is_active
        and p.home_site_id = p_site_id
    );
$$;

create function public.manager_can_access_employee(p_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles m
    join public.profiles e on e.home_site_id = m.home_site_id
    where m.id = auth.uid()
      and m.role = 'manager'
      and m.is_active
      and m.home_site_id is not null
      and e.id = p_employee_id
  );
$$;

revoke execute on function public.is_manager() from public, anon;
revoke execute on function public.manager_can_access_site(uuid) from public, anon;
revoke execute on function public.manager_can_access_employee(uuid) from public, anon;
grant execute on function public.is_manager() to authenticated;
grant execute on function public.manager_can_access_site(uuid) to authenticated;
grant execute on function public.manager_can_access_employee(uuid) to authenticated;

-- Managers can read the people, attendance and alerts of their own site.
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.admin_can_access_employee(id)
    or public.manager_can_access_employee(id)
  );

drop policy attendance_select on public.attendance;
create policy attendance_select on public.attendance
  for select to authenticated
  using (
    employee_id = auth.uid()
    or public.admin_can_access_site(site_id)
    or public.manager_can_access_site(site_id)
  );

drop policy alerts_select_admin on public.alerts;
create policy alerts_select_scoped on public.alerts
  for select to authenticated
  using (
    public.admin_can_access_site(site_id)
    or public.admin_can_access_employee(employee_id)
    or public.manager_can_access_site(site_id)
  );

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------

create type public.task_priority as enum ('low', 'medium', 'high');
create type public.task_status as enum ('pending', 'in_progress', 'done');

create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid not null references public.sites (id) on delete restrict,
  assigned_to  uuid not null references public.profiles (id) on delete restrict,
  created_by   uuid not null references public.profiles (id) on delete restrict,
  title        text not null,
  priority     public.task_priority not null default 'medium',
  status       public.task_status not null default 'pending',
  due_at       timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  completed_at timestamptz,
  constraint tasks_title_length check (length(btrim(title)) between 1 and 200)
);

create index tasks_assignee_idx on public.tasks (assigned_to, status);
create index tasks_site_idx on public.tasks (site_id, status);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;
revoke all on public.tasks from anon, authenticated;
grant select on public.tasks to authenticated;

create policy tasks_select on public.tasks
  for select to authenticated
  using (
    assigned_to = auth.uid()
    or public.manager_can_access_site(site_id)
    or public.admin_can_access_site(site_id)
  );

create function public.create_task(
  p_assigned_to uuid,
  p_title       text,
  p_priority    public.task_priority default 'medium',
  p_due_at      timestamptz default null
)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site uuid;
  v_row  public.tasks;
begin
  if not public.is_manager() then
    raise exception 'Site manager access required' using errcode = '42501';
  end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 200 then
    raise exception 'Task title must be 1 to 200 characters' using errcode = '22023';
  end if;

  select home_site_id into v_site from public.profiles where id = auth.uid();

  if not exists (
    select 1 from public.profiles e
    where e.id = p_assigned_to
      and e.role = 'employee'
      and e.is_active
      and e.home_site_id = v_site
  ) then
    raise exception 'Assignee must be an active employee at your site' using errcode = '42501';
  end if;

  insert into public.tasks (site_id, assigned_to, created_by, title, priority, due_at)
  values (v_site, p_assigned_to, auth.uid(), btrim(p_title), p_priority, p_due_at)
  returning * into v_row;

  perform public.record_audit('task.created', 'task', v_row.id::text,
    jsonb_build_object('assigned_to', p_assigned_to, 'priority', p_priority));
  return v_row;
end;
$$;

-- The assignee can move their own task between statuses; so can the manager
-- of the task's site.
create function public.set_task_status(p_task_id uuid, p_status public.task_status)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.tasks;
begin
  select * into v_row from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;
  if not (
    (v_row.assigned_to = auth.uid()
       and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active))
    or public.manager_can_access_site(v_row.site_id)
  ) then
    raise exception 'You cannot change this task' using errcode = '42501';
  end if;

  update public.tasks
     set status = p_status,
         completed_at = case when p_status = 'done' then now() else null end
   where id = p_task_id
  returning * into v_row;

  perform public.record_audit('task.status_changed', 'task', v_row.id::text,
    jsonb_build_object('status', p_status));
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Incidents
-- ---------------------------------------------------------------------------

create type public.incident_category as enum ('hazard', 'accident');
create type public.incident_status as enum ('open', 'investigating', 'monitoring', 'resolved');

create table public.incidents (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites (id) on delete restrict,
  reported_by uuid not null references public.profiles (id) on delete restrict,
  category    public.incident_category not null,
  priority    public.task_priority not null default 'medium',
  status      public.incident_status not null default 'open',
  details     text not null,
  location    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint incidents_details_length check (length(btrim(details)) between 1 and 2000),
  constraint incidents_location_length check (location is null or length(location) <= 200)
);

create index incidents_site_idx on public.incidents (site_id, status, created_at desc);
create index incidents_reporter_idx on public.incidents (reported_by);

create trigger incidents_set_updated_at
  before update on public.incidents
  for each row execute function public.set_updated_at();

alter table public.incidents enable row level security;
revoke all on public.incidents from anon, authenticated;
grant select on public.incidents to authenticated;

create policy incidents_select on public.incidents
  for select to authenticated
  using (
    reported_by = auth.uid()
    or public.manager_can_access_site(site_id)
    or public.admin_can_access_site(site_id)
  );

create function public.report_incident(
  p_category public.incident_category,
  p_priority public.task_priority,
  p_details  text,
  p_location text default null
)
returns public.incidents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site uuid;
  v_row  public.incidents;
begin
  select p.home_site_id into v_site
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active
    and p.role in ('employee', 'manager');
  if v_site is null then
    raise exception 'An active account with a home site is required' using errcode = '42501';
  end if;
  if p_details is null or length(btrim(p_details)) not between 1 and 2000 then
    raise exception 'Details must be 1 to 2000 characters' using errcode = '22023';
  end if;
  if p_location is not null and length(p_location) > 200 then
    raise exception 'Location must not exceed 200 characters' using errcode = '22023';
  end if;

  insert into public.incidents (site_id, reported_by, category, priority, details, location)
  values (v_site, auth.uid(), p_category, p_priority, btrim(p_details), nullif(btrim(p_location), ''))
  returning * into v_row;

  perform public.record_audit('incident.reported', 'incident', v_row.id::text,
    jsonb_build_object('category', p_category, 'priority', p_priority));
  return v_row;
end;
$$;

create function public.set_incident_status(p_incident_id uuid, p_status public.incident_status)
returns public.incidents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.incidents;
begin
  select * into v_row from public.incidents where id = p_incident_id for update;
  if not found then
    raise exception 'Incident not found' using errcode = 'P0002';
  end if;
  if not (public.manager_can_access_site(v_row.site_id)
          or public.admin_can_access_site(v_row.site_id)) then
    raise exception 'You cannot change this incident' using errcode = '42501';
  end if;

  update public.incidents set status = p_status where id = p_incident_id
  returning * into v_row;

  perform public.record_audit('incident.status_changed', 'incident', v_row.id::text,
    jsonb_build_object('status', p_status));
  return v_row;
end;
$$;

revoke execute on function public.create_task(uuid, text, public.task_priority, timestamptz) from public, anon;
revoke execute on function public.set_task_status(uuid, public.task_status) from public, anon;
revoke execute on function public.report_incident(public.incident_category, public.task_priority, text, text) from public, anon;
revoke execute on function public.set_incident_status(uuid, public.incident_status) from public, anon;
grant execute on function public.create_task(uuid, text, public.task_priority, timestamptz) to authenticated;
grant execute on function public.set_task_status(uuid, public.task_status) to authenticated;
grant execute on function public.report_incident(public.incident_category, public.task_priority, text, text) to authenticated;
grant execute on function public.set_incident_status(uuid, public.incident_status) to authenticated;
