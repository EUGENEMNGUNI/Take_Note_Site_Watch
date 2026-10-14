-- 0004_attendance.sql
-- Attendance records (FR-03 to FR-08) and attendance alerts (FR-09).
--
-- Design rules:
--   * Clients can only READ attendance. Every write goes through check_in()
--     and check_out(), which use the server clock (never the client's) and
--     enforce the business rules below.
--   * One open check-in per employee (partial unique index).
--   * Retries are safe: an optional client-generated request id makes
--     check_in() / check_out() idempotent.
--   * Closed records and the identifying columns of open records are
--     immutable; deletes are blocked. Corrections and retention purges will
--     need their own audited procedures (not part of the foundation).

create table public.attendance (
  id                  uuid primary key default gen_random_uuid(),
  employee_id         uuid not null references public.profiles (id) on delete restrict,
  site_id             uuid not null references public.sites (id) on delete restrict,
  check_in_at         timestamptz not null default now(),
  check_out_at        timestamptz,
  presence_status     public.presence_status not null default 'unverified',
  check_in_lat        double precision,
  check_in_lng        double precision,
  check_in_accuracy_m double precision,
  check_in_distance_m double precision,
  check_out_lat       double precision,
  check_out_lng       double precision,
  check_in_request_id  uuid,
  check_out_request_id uuid,
  created_at          timestamptz not null default now(),
  constraint attendance_times_ordered
    check (check_out_at is null or check_out_at > check_in_at),
  constraint attendance_check_in_coords
    check ((check_in_lat is null) = (check_in_lng is null)
       and (check_in_lat is null or check_in_lat between -90 and 90)
       and (check_in_lng is null or check_in_lng between -180 and 180)),
  constraint attendance_check_out_coords
    check ((check_out_lat is null) = (check_out_lng is null)
       and (check_out_lat is null or check_out_lat between -90 and 90)
       and (check_out_lng is null or check_out_lng between -180 and 180))
);

-- At most one open (not yet checked out) record per employee.
create unique index attendance_one_open_per_employee
  on public.attendance (employee_id)
  where check_out_at is null;

-- Idempotency keys.
create unique index attendance_check_in_request_uniq
  on public.attendance (employee_id, check_in_request_id)
  where check_in_request_id is not null;
create unique index attendance_check_out_request_uniq
  on public.attendance (employee_id, check_out_request_id)
  where check_out_request_id is not null;

create index attendance_employee_time_idx on public.attendance (employee_id, check_in_at desc);
create index attendance_site_time_idx     on public.attendance (site_id, check_in_at desc);

-- Immutability guard (applies to every role, including service_role).
create function public.attendance_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Attendance records cannot be deleted' using errcode = '42501';
  end if;
  if old.check_out_at is not null then
    raise exception 'Closed attendance records are immutable' using errcode = '42501';
  end if;
  if new.employee_id is distinct from old.employee_id
     or new.site_id is distinct from old.site_id
     or new.check_in_at is distinct from old.check_in_at then
    raise exception 'Attendance identity columns are immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger attendance_guard_trg
  before update or delete on public.attendance
  for each row execute function public.attendance_guard();

-- ---------------------------------------------------------------------------
-- Alerts (FR-09). The foundation only raises 'outside_radius'; the other
-- types exist so later scheduled checks need no schema change.
-- ---------------------------------------------------------------------------

create table public.alerts (
  id              uuid primary key default gen_random_uuid(),
  alert_type      public.alert_type not null,
  status          public.alert_status not null default 'open',
  employee_id     uuid not null references public.profiles (id) on delete cascade,
  site_id         uuid references public.sites (id) on delete set null,
  attendance_id   uuid references public.attendance (id) on delete set null,
  message         text not null,
  created_at      timestamptz not null default now(),
  acknowledged_by uuid references public.profiles (id) on delete set null,
  acknowledged_at timestamptz
);

create index alerts_status_created_idx on public.alerts (status, created_at desc);
create index alerts_site_idx           on public.alerts (site_id);
create index alerts_employee_idx       on public.alerts (employee_id);

-- ---------------------------------------------------------------------------
-- check_in
-- ---------------------------------------------------------------------------

create function public.check_in(
  p_site_id    uuid,
  p_latitude   double precision default null,
  p_longitude  double precision default null,
  p_accuracy_m double precision default null,
  p_request_id uuid default null
)
returns public.attendance
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_site     public.sites;
  v_row      public.attendance;
  v_distance double precision;
  v_status   public.presence_status := 'unverified';
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and is_active) then
    raise exception 'Account is inactive' using errcode = '42501';
  end if;

  -- Idempotent retry: same request id returns the original record.
  if p_request_id is not null then
    select * into v_row
      from public.attendance
     where employee_id = v_uid and check_in_request_id = p_request_id;
    if found then
      return v_row;
    end if;
  end if;

  select * into v_site from public.sites where id = p_site_id and is_active;
  if not found then
    raise exception 'Site not found or inactive' using errcode = 'P0002';
  end if;

  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'Latitude and longitude must be supplied together' using errcode = '22023';
  end if;

  if p_latitude is not null then
    if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
      raise exception 'Coordinates are out of range' using errcode = '22023';
    end if;
    v_distance := public.distance_m(p_latitude, p_longitude, v_site.latitude, v_site.longitude);
    if v_distance <= v_site.radius_m then
      v_status := 'verified';
    else
      v_status := 'outside_radius';
    end if;
  end if;

  if v_site.enforce_radius and v_status <> 'verified' then
    raise exception 'Site presence could not be verified' using errcode = '42501';
  end if;

  begin
    insert into public.attendance (
      employee_id, site_id, presence_status,
      check_in_lat, check_in_lng, check_in_accuracy_m, check_in_distance_m,
      check_in_request_id
    ) values (
      v_uid, p_site_id, v_status,
      p_latitude, p_longitude, p_accuracy_m, v_distance,
      p_request_id
    )
    returning * into v_row;
  exception when unique_violation then
    -- Either a concurrent retry of the same request, or a real open check-in.
    if p_request_id is not null then
      select * into v_row
        from public.attendance
       where employee_id = v_uid and check_in_request_id = p_request_id;
      if found then
        return v_row;
      end if;
    end if;
    raise exception 'You already have an open check-in' using errcode = '23505';
  end;

  if v_status = 'outside_radius' then
    insert into public.alerts (alert_type, employee_id, site_id, attendance_id, message)
    values (
      'outside_radius', v_uid, p_site_id, v_row.id,
      format('Check-in recorded %s m from %s (allowed radius %s m)',
             round(v_distance)::int, v_site.name, v_site.radius_m)
    );
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- check_out
-- ---------------------------------------------------------------------------

create function public.check_out(
  p_latitude   double precision default null,
  p_longitude  double precision default null,
  p_request_id uuid default null
)
returns public.attendance
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.attendance;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and is_active) then
    raise exception 'Account is inactive' using errcode = '42501';
  end if;

  if p_request_id is not null then
    select * into v_row
      from public.attendance
     where employee_id = v_uid and check_out_request_id = p_request_id;
    if found then
      return v_row;
    end if;
  end if;

  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'Latitude and longitude must be supplied together' using errcode = '22023';
  end if;
  if p_latitude is not null
     and (p_latitude not between -90 and 90 or p_longitude not between -180 and 180) then
    raise exception 'Coordinates are out of range' using errcode = '22023';
  end if;

  select * into v_row
    from public.attendance
   where employee_id = v_uid and check_out_at is null
   for update;
  if not found then
    raise exception 'No open check-in to close' using errcode = 'P0002';
  end if;

  update public.attendance
     set check_out_at = now(),
         check_out_lat = p_latitude,
         check_out_lng = p_longitude,
         check_out_request_id = p_request_id
   where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- acknowledge_alert
-- ---------------------------------------------------------------------------

create function public.acknowledge_alert(
  p_alert_id uuid,
  p_status   public.alert_status default 'acknowledged'
)
returns public.alerts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.alerts;
begin
  if not public.is_admin() then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  if p_status = 'open' then
    raise exception 'Status must be acknowledged or resolved' using errcode = '22023';
  end if;

  select * into v_row from public.alerts where id = p_alert_id;
  if not found then
    raise exception 'Alert not found' using errcode = 'P0002';
  end if;
  if not (public.admin_can_access_site(v_row.site_id)
          or public.admin_can_access_employee(v_row.employee_id)) then
    raise exception 'Alert is outside your scope' using errcode = '42501';
  end if;

  update public.alerts
     set status = p_status,
         acknowledged_by = auth.uid(),
         acknowledged_at = now()
   where id = p_alert_id
  returning * into v_row;

  perform public.record_audit('alert.' || p_status::text, 'alert', p_alert_id::text, '{}'::jsonb);
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Working hours (FR-08): raw duration only. Break, overtime and missed
-- check-out rules are still undecided, so nothing is deducted or capped here.
-- security_invoker makes the view obey the caller's Row Level Security.
-- ---------------------------------------------------------------------------

create view public.attendance_hours
with (security_invoker = true) as
select
  a.id,
  a.employee_id,
  a.site_id,
  a.check_in_at,
  a.check_out_at,
  (a.check_out_at is null) as is_open,
  case
    when a.check_out_at is not null
    then round((extract(epoch from (a.check_out_at - a.check_in_at)) / 3600.0)::numeric, 2)
  end as hours_worked
from public.attendance a;

-- ---------------------------------------------------------------------------
-- Privileges and Row Level Security
-- ---------------------------------------------------------------------------

alter table public.attendance enable row level security;
alter table public.alerts     enable row level security;

revoke all on public.attendance       from anon, authenticated;
revoke all on public.alerts           from anon, authenticated;
revoke all on public.attendance_hours from anon, authenticated;

grant select on public.attendance       to authenticated;
grant select on public.alerts           to authenticated;
grant select on public.attendance_hours to authenticated;

create policy attendance_select on public.attendance
  for select to authenticated
  using (employee_id = auth.uid() or public.admin_can_access_site(site_id));

create policy alerts_select_admin on public.alerts
  for select to authenticated
  using (
    public.admin_can_access_site(site_id)
    or public.admin_can_access_employee(employee_id)
  );

revoke execute on function public.check_in(uuid, double precision, double precision, double precision, uuid)
  from public, anon;
revoke execute on function public.check_out(double precision, double precision, uuid)
  from public, anon;
revoke execute on function public.acknowledge_alert(uuid, public.alert_status)
  from public, anon;
grant execute on function public.check_in(uuid, double precision, double precision, double precision, uuid)
  to authenticated;
grant execute on function public.check_out(double precision, double precision, uuid)
  to authenticated;
grant execute on function public.acknowledge_alert(uuid, public.alert_status)
  to authenticated;
