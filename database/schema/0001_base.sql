-- 0001_base.sql
-- Shared enums and utility functions used by every later migration.
--
-- Role model: the requirements (docs/requirements.md §3) define only
-- Employee and Administrator. A "manager" role is NOT created here because it
-- is still an open decision; it can be added later with
--   alter type public.user_role add value 'manager';

create type public.user_role as enum ('employee', 'admin');

create type public.presence_status as enum (
  'verified',        -- coordinates supplied and inside the site radius
  'outside_radius',  -- coordinates supplied but outside the site radius
  'unverified'       -- no coordinates supplied
);

create type public.leave_type as enum ('sick');

create type public.leave_status as enum (
  'pending',
  'approved',
  'rejected',
  'cancelled'
);

create type public.alert_type as enum (
  'outside_radius',
  'late_arrival',
  'no_check_in',
  'missed_check_out'
);

create type public.alert_status as enum ('open', 'acknowledged', 'resolved');

-- Keeps updated_at current on tables that have the column.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Great-circle distance in metres between two WGS84 points (haversine).
create function public.distance_m(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
)
returns double precision
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 2 * 6371000.0 * asin(sqrt(least(1.0,
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2))
      * power(sin(radians(lng2 - lng1) / 2), 2)
  )));
$$;
