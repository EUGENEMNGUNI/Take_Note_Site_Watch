-- seed.sql
-- Sample data for LOCAL DEVELOPMENT ONLY. Safe to run more than once.
--
-- Contains sites only. Users must be created through Supabase Auth so that
-- passwords are hashed correctly; run back-end/scripts/seed-users.ts after
-- this file to create the test administrator and employees.
--
-- The coordinates are placeholders around Johannesburg. Replace them with the
-- organisation's real work sites before any real use.

insert into public.sites (id, name, address, latitude, longitude, radius_m, enforce_radius)
values
  ('a0000000-0000-4000-8000-000000000001',
   'Sample Head Office', 'Sandton, Johannesburg (sample)',
   -26.1076, 28.0567, 150, false),
  ('a0000000-0000-4000-8000-000000000002',
   'Sample Depot', 'Midrand (sample)',
   -25.9992, 28.1263, 200, false)
on conflict (id) do nothing;
