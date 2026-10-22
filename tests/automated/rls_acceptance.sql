-- rls_acceptance.sql
-- Database-level acceptance tests for docs/requirements.md §8.
-- Run through tests/automated/run_db_tests.sh (applies the stub, migrations
-- and seed first). Any failed assertion aborts the run with a non-zero exit.
--
-- Users are impersonated the way Supabase does it: a role (anon /
-- authenticated) plus the caller's id in the request.jwt.claim.sub setting.

\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = notice;

create schema t;
grant usage on schema t to public;

create function t.assert(p_cond boolean, p_msg text) returns void
language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'ASSERT FAILED: %', p_msg;
  end if;
  raise notice 'ok - %', p_msg;
end $$;

-- Runs a DML statement and returns how many rows it touched (RLS can make
-- an UPDATE silently match zero rows rather than raise).
create function t.affected(p_sql text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;

-- Expects the statement to fail with the given SQLSTATE.
create function t.raises(p_sql text, p_state text) returns void
language plpgsql as $$
begin
  execute p_sql;
  raise exception 'ASSERT FAILED: expected SQLSTATE % but it succeeded: %', p_state, p_sql;
exception when others then
  if sqlstate = p_state then
    raise notice 'ok - SQLSTATE % for: %', p_state, left(regexp_replace(p_sql, '\s+', ' ', 'g'), 80);
  elsif sqlerrm like 'ASSERT FAILED%' then
    raise;
  else
    raise exception 'ASSERT FAILED: expected % but got % (%) for: %', p_state, sqlstate, sqlerrm, p_sql;
  end if;
end $$;

-- Identity switches -----------------------------------------------------------
\set as_super  'reset role; set request.jwt.claim.sub = ''''; '
\set as_anon   'reset role; set request.jwt.claim.sub = ''''; set role anon; '
\set as_noauth 'reset role; set request.jwt.claim.sub = ''''; set role authenticated; '
\set as_admin1 'reset role; set request.jwt.claim.sub = ''00000000-0000-4000-8000-0000000000a1''; set role authenticated; '
\set as_admin2 'reset role; set request.jwt.claim.sub = ''00000000-0000-4000-8000-0000000000a2''; set role authenticated; '
\set as_emp1   'reset role; set request.jwt.claim.sub = ''00000000-0000-4000-8000-0000000000e1''; set role authenticated; '
\set as_emp2   'reset role; set request.jwt.claim.sub = ''00000000-0000-4000-8000-0000000000e2''; set role authenticated; '
\set as_emp3   'reset role; set request.jwt.claim.sub = ''00000000-0000-4000-8000-0000000000e3''; set role authenticated; '

-- =============================================================================
-- Fixtures (service role / superuser)
--   site s1 (Johannesburg) : admin1, emp1, emp2
--   site s2 (Pretoria)     : admin2, emp3
-- =============================================================================
:as_super
insert into public.sites (id, name, latitude, longitude, radius_m) values
  ('11111111-1111-4111-8111-111111111111', 'Test Site One', -26.2041, 28.0473, 100),
  ('22222222-2222-4222-8222-222222222222', 'Test Site Two', -25.7479, 28.2293, 100);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'admin1@test.local', '{"full_name":"Admin One"}'),
  ('00000000-0000-4000-8000-0000000000a2', 'admin2@test.local', '{"full_name":"Admin Two"}'),
  ('00000000-0000-4000-8000-0000000000e1', 'emp1@test.local',   '{"full_name":"Emp One"}'),
  -- emp2 tries to make itself an admin through signup metadata
  ('00000000-0000-4000-8000-0000000000e2', 'emp2@test.local',   '{"full_name":"Emp Two","role":"admin"}'),
  ('00000000-0000-4000-8000-0000000000e3', 'emp3@test.local',   '{"full_name":"Emp Three"}');

update public.profiles set role = 'admin'
 where id in ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2');
update public.profiles set home_site_id = '11111111-1111-4111-8111-111111111111'
 where id in ('00000000-0000-4000-8000-0000000000a1',
              '00000000-0000-4000-8000-0000000000e1',
              '00000000-0000-4000-8000-0000000000e2');
update public.profiles set home_site_id = '22222222-2222-4222-8222-222222222222'
 where id in ('00000000-0000-4000-8000-0000000000a2',
              '00000000-0000-4000-8000-0000000000e3');
insert into public.admin_site_access (admin_id, site_id) values
  ('00000000-0000-4000-8000-0000000000a1', '11111111-1111-4111-8111-111111111111'),
  ('00000000-0000-4000-8000-0000000000a2', '22222222-2222-4222-8222-222222222222');
update public.sites set enforce_radius = true where id = '22222222-2222-4222-8222-222222222222';

select t.assert((select count(*) from public.profiles) = 5, 'a profile is created for every auth user');
select t.assert((select role from public.profiles where id = '00000000-0000-4000-8000-0000000000e2') = 'employee',
  'signup metadata cannot grant the admin role');
select t.assert(abs(public.distance_m(0, 0, 1, 0) - 111195) < 600, 'distance_m is accurate (1 degree latitude ~ 111 km)');

-- =============================================================================
-- anon and unauthenticated callers
-- =============================================================================
:as_anon
select t.raises($$select * from public.profiles$$, '42501');
select t.raises($$select * from public.sites$$, '42501');
select t.raises($$select * from public.attendance$$, '42501');
select t.raises($$select * from public.leave_requests$$, '42501');
select t.raises($$select * from public.audit_log$$, '42501');
select t.raises($$select public.check_in('11111111-1111-4111-8111-111111111111')$$, '42501');

:as_noauth
select t.assert((select count(*) from public.profiles) = 0, 'a token without a user id sees no profiles');
select t.raises($$select public.check_in('11111111-1111-4111-8111-111111111111')$$, '28000');

-- =============================================================================
-- Employee: profile and role boundaries (FR-02)
-- =============================================================================
:as_emp1
select t.assert((select count(*) from public.profiles) = 1, 'employee sees only their own profile');
select t.assert(not public.is_admin(), 'employee is not an administrator');
select t.raises($$update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000e1'$$, '42501');
select t.raises($$update public.profiles set home_site_id = null where id = '00000000-0000-4000-8000-0000000000e1'$$, '42501');
select t.raises($$update public.profiles set is_active = true where id = '00000000-0000-4000-8000-0000000000e1'$$, '42501');
update public.profiles set full_name = 'Emma One' where id = '00000000-0000-4000-8000-0000000000e1';
select t.assert((select full_name from public.profiles where id = '00000000-0000-4000-8000-0000000000e1') = 'Emma One',
  'employee can edit their own name');
select t.assert(t.affected($$update public.profiles set full_name = 'Hacked'
                             where id = '00000000-0000-4000-8000-0000000000e2'$$) = 0,
  'employee cannot edit another profile');
select t.assert((select count(*) from public.sites
                  where id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')) = 2,
  'employee can see active sites');
select t.raises($$insert into public.sites (name, latitude, longitude) values ('Rogue', 0, 0)$$, '42501');
select t.assert(t.affected($$update public.sites set radius_m = 5000
                             where id = '11111111-1111-4111-8111-111111111111'$$) = 0,
  'employee cannot edit a site');
select t.raises($$select public.admin_set_user_role('00000000-0000-4000-8000-0000000000e2', 'admin')$$, '42501');
select t.raises($$select public.admin_set_user_active('00000000-0000-4000-8000-0000000000e2', false)$$, '42501');
select t.assert((select count(*) from public.audit_log) = 0, 'employee cannot read the audit log');
select t.assert((select count(*) from public.alerts) = 0, 'employee cannot read alerts');
select t.assert((select count(*) from public.admin_site_access) = 0, 'employee has no administrator scope');

-- =============================================================================
-- Employee: check-in / check-out (FR-03, FR-04, FR-05)
-- =============================================================================
select (public.check_in('11111111-1111-4111-8111-111111111111', -26.2041, 28.0473, 10,
        'c0000000-0000-4000-8000-000000000001')).id as ci1 \gset
select t.assert((select presence_status from public.attendance where id = :'ci1') = 'verified',
  'check-in at the site is verified');
select t.assert((select employee_id from public.attendance where id = :'ci1') = '00000000-0000-4000-8000-0000000000e1',
  'attendance is linked to the correct employee');
select t.assert((public.check_in('11111111-1111-4111-8111-111111111111', -26.2041, 28.0473, 10,
        'c0000000-0000-4000-8000-000000000001')).id = :'ci1'::uuid,
  'retrying a check-in with the same request id returns the original record');
select t.assert((select count(*) from public.attendance where employee_id = '00000000-0000-4000-8000-0000000000e1') = 1,
  'a retried check-in does not create a duplicate');
select t.raises($$select public.check_in('11111111-1111-4111-8111-111111111111')$$, '23505');
select t.raises($$select public.check_in('99999999-9999-4999-8999-999999999999')$$, 'P0002');

select (public.check_out(-26.2041, 28.0473, 'c0000000-0000-4000-8000-000000000002')).id as co1 \gset
select t.assert(:'co1'::uuid = :'ci1'::uuid, 'check-out closes the open record');
select t.assert((select check_out_at > check_in_at from public.attendance where id = :'ci1'),
  'check-out time is after check-in time (server clock)');
select t.assert((public.check_out(null, null, 'c0000000-0000-4000-8000-000000000002')).id = :'ci1'::uuid,
  'retrying a check-out with the same request id returns the same record');
select t.raises($$select public.check_out()$$, 'P0002');

select (public.check_in('11111111-1111-4111-8111-111111111111')).id as ci2 \gset
select t.assert((select presence_status from public.attendance where id = :'ci2') = 'unverified',
  'check-in without coordinates is recorded as unverified');

select t.raises($$select public.check_in('11111111-1111-4111-8111-111111111111', -26.2)$$, '22023');
select t.raises($$select public.check_in('11111111-1111-4111-8111-111111111111', 95, 28)$$, '22023');

-- Direct writes are blocked: attendance is only written by check_in/check_out.
select t.raises($$insert into public.attendance (employee_id, site_id)
                   values ('00000000-0000-4000-8000-0000000000e1', '11111111-1111-4111-8111-111111111111')$$, '42501');
select t.raises($$update public.attendance set check_in_at = now() - interval '5 hours'$$, '42501');
select t.raises($$delete from public.attendance$$, '42501');
select t.raises($$insert into public.alerts (alert_type, employee_id, message)
                   values ('late_arrival', '00000000-0000-4000-8000-0000000000e1', 'x')$$, '42501');

select t.assert((select count(*) from public.attendance) = 2, 'employee sees their own attendance history');
select t.assert((select count(*) from public.attendance_hours) = 2, 'working-hours view returns the employee''s rows');
select t.assert((select hours_worked is not null and hours_worked >= 0 from public.attendance_hours where id = :'ci1'),
  'closed record has hours worked');
select t.assert((select is_open and hours_worked is null from public.attendance_hours where id = :'ci2'),
  'open record has no hours worked yet');

-- =============================================================================
-- Second employee: outside radius, isolation from emp1
-- =============================================================================
:as_emp2
select t.assert((select count(*) from public.attendance) = 0, 'employee cannot see another employee''s attendance');
select (public.check_in('11111111-1111-4111-8111-111111111111', -26.2541, 28.0473, 12)).id as ci3 \gset
select t.assert((select presence_status from public.attendance where id = :'ci3') = 'outside_radius',
  'check-in far from the site is flagged outside_radius');
select t.assert((select check_in_distance_m between 5000 and 6000 from public.attendance where id = :'ci3'),
  'distance from the site is recorded');
select t.assert((select count(*) from public.attendance) = 1, 'second employee sees only their own record');
select t.assert((select count(*) from public.attendance_hours) = 1, 'view is also restricted to own rows');

-- =============================================================================
-- Third employee: site with enforce_radius = true
-- =============================================================================
:as_emp3
select t.raises($$select public.check_in('22222222-2222-4222-8222-222222222222')$$, '42501');
select t.raises($$select public.check_in('22222222-2222-4222-8222-222222222222', -25.8479, 28.2293)$$, '42501');
select t.assert((select count(*) from public.attendance) = 0, 'rejected check-ins leave no record');
select (public.check_in('22222222-2222-4222-8222-222222222222', -25.7479, 28.2293)).id as ci4 \gset
select t.assert((select presence_status from public.attendance where id = :'ci4') = 'verified',
  'enforced site accepts a verified check-in');

-- =============================================================================
-- Administrator scope: attendance, profiles, alerts (FR-06, FR-07, FR-09)
-- =============================================================================
:as_admin1
select t.assert(public.is_admin(), 'admin is recognised');
select t.assert((select count(*) from public.attendance) = 3, 'admin1 sees attendance at their site');
select t.assert((select count(*) from public.attendance where employee_id = '00000000-0000-4000-8000-0000000000e3') = 0,
  'admin1 cannot see attendance at another site');
select t.assert((select count(*) from public.profiles) = 3, 'admin1 sees only profiles inside their scope');
select t.raises($$update public.attendance set check_out_at = now()$$, '42501');
select t.assert((select count(*) from public.alerts) = 1, 'admin1 sees the outside-radius alert');
select id as al1 from public.alerts limit 1 \gset
select t.assert((select alert_type from public.alerts where id = :'al1') = 'outside_radius', 'alert has the right type');
select t.assert((select count(*) from public.attendance_hours) = 3, 'admin view of hours follows the same scope');

:as_admin2
select t.assert((select count(*) from public.attendance) = 1, 'admin2 sees only their own site''s attendance');
select t.assert((select count(*) from public.alerts) = 0, 'admin2 does not see site one''s alerts');
select t.assert((select count(*) from public.profiles) = 2, 'admin2 sees only profiles inside their scope');
select t.raises(format($q$select public.acknowledge_alert(%L)$q$, :'al1'), '42501');

:as_admin1
select t.assert((public.acknowledge_alert(:'al1')).status = 'acknowledged', 'admin can acknowledge an in-scope alert');
select t.raises(format($q$select public.acknowledge_alert(%L, 'open')$q$, :'al1'), '22023');

:as_emp1
select t.raises(format($q$select public.acknowledge_alert(%L)$q$, :'al1'), '42501');

-- =============================================================================
-- Site management by administrators
-- =============================================================================
:as_admin1
with ins as (
  insert into public.sites (name, latitude, longitude, radius_m)
  values ('Annex', -26.1, 28.0, 120) returning id
) select id as annex from ins \gset
select t.assert((select count(*) from public.admin_site_access where site_id = :'annex' and admin_id = '00000000-0000-4000-8000-0000000000a1') = 1,
  'a site''s creator is granted access to it');
select t.raises($$insert into public.sites (name, latitude, longitude, radius_m) values ('Bad', 0, 0, 5)$$, '23514');
select t.raises($$insert into public.sites (name, latitude, longitude) values ('Bad', 100, 0)$$, '23514');

:as_admin2
select t.assert(t.affected(format($q$update public.sites set radius_m = 999 where id = %L$q$, :'annex')) = 0,
  'admin2 cannot edit a site outside their scope');

:as_admin1
update public.sites set radius_m = 300 where id = :'annex';
update public.sites set is_active = false where id = :'annex';

:as_emp1
select t.assert((select count(*) from public.sites where id = :'annex') = 0, 'inactive sites are hidden from employees');
select t.raises(format($q$select public.check_in(%L)$q$, :'annex'), 'P0002');

:as_admin1
select t.assert((select count(*) from public.sites where id = :'annex') = 1, 'administrator still sees their inactive site');

-- =============================================================================
-- Leave requests, documents and review (FR-10, FR-11, FR-12)
-- =============================================================================
:as_emp1
insert into public.leave_requests (employee_id, start_date, end_date, reason)
values ('00000000-0000-4000-8000-0000000000e1', '2026-10-12', '2026-10-13', 'Flu');
insert into public.leave_requests (employee_id, start_date, end_date, reason)
values ('00000000-0000-4000-8000-0000000000e1', '2026-11-02', '2026-11-02', 'Migraine');
select id as r1 from public.leave_requests where reason = 'Flu' \gset
select id as r2 from public.leave_requests where reason = 'Migraine' \gset
select t.assert((select count(*) from public.leave_requests where status = 'pending') = 2, 'new requests start as pending');

select t.raises($$insert into public.leave_requests (employee_id, start_date, end_date, status)
                   values ('00000000-0000-4000-8000-0000000000e1', '2026-12-01', '2026-12-01', 'approved')$$, '42501');
select t.raises($$insert into public.leave_requests (employee_id, start_date, end_date)
                   values ('00000000-0000-4000-8000-0000000000e2', '2026-12-01', '2026-12-01')$$, '42501');
select t.raises($$insert into public.leave_requests (employee_id, start_date, end_date)
                   values ('00000000-0000-4000-8000-0000000000e1', '2026-12-05', '2026-12-01')$$, '23514');
select t.raises($$update public.leave_requests set status = 'approved'$$, '42501');

-- Documents: valid, then each rule that must reject.
insert into public.leave_documents (leave_request_id, employee_id, storage_path, file_name, mime_type, size_bytes)
values (:'r1', '00000000-0000-4000-8000-0000000000e1',
        '00000000-0000-4000-8000-0000000000e1/' || :'r1' || '/note.pdf', 'note.pdf', 'application/pdf', 1000);
select t.raises(format($q$insert into public.leave_documents (leave_request_id, employee_id, storage_path, file_name, mime_type, size_bytes)
   values (%L, '00000000-0000-4000-8000-0000000000e1', %L, 'a.gif', 'image/gif', 1000)$q$,
   :'r1', '00000000-0000-4000-8000-0000000000e1/' || :'r1' || '/a.gif'), '23514');
select t.raises(format($q$insert into public.leave_documents (leave_request_id, employee_id, storage_path, file_name, mime_type, size_bytes)
   values (%L, '00000000-0000-4000-8000-0000000000e1', %L, 'big.pdf', 'application/pdf', 20000000)$q$,
   :'r1', '00000000-0000-4000-8000-0000000000e1/' || :'r1' || '/big.pdf'), '23514');
select t.raises(format($q$insert into public.leave_documents (leave_request_id, employee_id, storage_path, file_name, mime_type, size_bytes)
   values (%L, '00000000-0000-4000-8000-0000000000e1', 'somewhere/else.pdf', 'x.pdf', 'application/pdf', 100)$q$,
   :'r1'), '23514');

-- Private storage: path convention and ownership enforced by policy.
insert into storage.objects (bucket_id, name)
values ('leave-documents', '00000000-0000-4000-8000-0000000000e1/' || :'r1' || '/note.pdf');
select t.raises(format($q$insert into storage.objects (bucket_id, name) values ('leave-documents', %L)$q$,
   '00000000-0000-4000-8000-0000000000e2/' || :'r1' || '/note.pdf'), '42501');
select t.raises($$insert into storage.objects (bucket_id, name)
   values ('leave-documents', '00000000-0000-4000-8000-0000000000e1/doc.pdf')$$, '42501');
select t.raises(format($q$insert into storage.objects (bucket_id, name) values ('leave-documents', %L)$q$,
   '00000000-0000-4000-8000-0000000000e1/99999999-9999-4999-8999-999999999999/note.pdf'), '42501');
select t.assert(t.affected($$update storage.objects set name = 'x'$$) = 0, 'employee cannot rename or replace stored files');
select t.assert(t.affected($$delete from storage.objects$$) = 0, 'employee cannot delete stored files');
select t.assert((select count(*) from storage.objects where bucket_id = 'leave-documents') = 1,
  'employee can read their own document');
select t.assert((select public = false from storage.buckets where id = 'leave-documents'),
  'the documents bucket is private');

:as_emp2
select t.assert((select count(*) from public.leave_requests) = 0, 'employee cannot see another employee''s leave');
select t.assert((select count(*) from public.leave_documents) = 0, 'employee cannot see another employee''s documents');
select t.assert((select count(*) from storage.objects where bucket_id = 'leave-documents') = 0,
  'employee cannot read another employee''s files');
select t.raises(format($q$select public.cancel_leave_request(%L)$q$, :'r1'), 'P0002');
select t.raises(format($q$insert into public.leave_documents (leave_request_id, employee_id, storage_path, file_name, mime_type, size_bytes)
   values (%L, '00000000-0000-4000-8000-0000000000e2', %L, 'n.pdf', 'application/pdf', 10)$q$,
   :'r1', '00000000-0000-4000-8000-0000000000e2/' || :'r1' || '/n.pdf'), '42501');
select t.raises(format($q$select public.review_leave_request(%L, 'approved')$q$, :'r1'), '42501');

:as_admin2
select t.assert((select count(*) from public.leave_requests) = 0, 'out-of-scope admin cannot see the request');
select t.assert((select count(*) from storage.objects where bucket_id = 'leave-documents') = 0,
  'out-of-scope admin cannot read the document');
select t.raises(format($q$select public.review_leave_request(%L, 'approved')$q$, :'r1'), '42501');

:as_admin1
select t.assert((select count(*) from public.leave_requests where employee_id = '00000000-0000-4000-8000-0000000000e1') = 2,
  'in-scope admin sees the employee''s requests');
select t.assert((select count(*) from public.leave_documents) = 1, 'in-scope admin sees the document record');
select t.assert((select count(*) from storage.objects where bucket_id = 'leave-documents') = 1,
  'in-scope admin can read the document file');
select t.raises(format($q$select public.review_leave_request(%L, 'pending')$q$, :'r1'), '22023');
select t.assert((public.review_leave_request(:'r1', 'approved', 'Get well soon')).status = 'approved', 'admin can approve a request');
select t.assert((select reviewed_by = '00000000-0000-4000-8000-0000000000a1' and reviewed_at is not null
                   and decision_note = 'Get well soon' from public.leave_requests where id = :'r1'),
  'the decision, reviewer and time are recorded');
select t.raises(format($q$select public.review_leave_request(%L, 'rejected')$q$, :'r1'), '22023');

-- An administrator cannot approve their own leave.
insert into public.leave_requests (employee_id, start_date, end_date)
values ('00000000-0000-4000-8000-0000000000a1', '2026-12-10', '2026-12-10');
select id as r_admin from public.leave_requests where employee_id = '00000000-0000-4000-8000-0000000000a1' \gset
select t.raises(format($q$select public.review_leave_request(%L, 'approved')$q$, :'r_admin'), '42501');

:as_emp1
select t.raises(format($q$select public.review_leave_request(%L, 'approved')$q$, :'r2'), '42501');
select t.raises(format($q$select public.cancel_leave_request(%L)$q$, :'r1'), '22023');
-- No new documents once a request has been decided.
select t.raises(format($q$insert into public.leave_documents (leave_request_id, employee_id, storage_path, file_name, mime_type, size_bytes)
   values (%L, '00000000-0000-4000-8000-0000000000e1', %L, 'late.pdf', 'application/pdf', 10)$q$,
   :'r1', '00000000-0000-4000-8000-0000000000e1/' || :'r1' || '/late.pdf'), '42501');
select t.raises(format($q$insert into storage.objects (bucket_id, name) values ('leave-documents', %L)$q$,
   '00000000-0000-4000-8000-0000000000e1/' || :'r1' || '/late.pdf'), '42501');
select t.assert((public.cancel_leave_request(:'r2')).status = 'cancelled', 'employee can cancel their own pending request');
select t.raises(format($q$insert into public.leave_documents (leave_request_id, employee_id, storage_path, file_name, mime_type, size_bytes)
   values (%L, '00000000-0000-4000-8000-0000000000e1', %L, 'x.pdf', 'application/pdf', 10)$q$,
   :'r2', '00000000-0000-4000-8000-0000000000e1/' || :'r2' || '/x.pdf'), '42501');

-- =============================================================================
-- Administrator user management
-- =============================================================================
:as_admin1
select t.raises($$select public.admin_set_user_role('00000000-0000-4000-8000-0000000000a1', 'employee')$$, '42501');
select t.raises($$select public.admin_set_user_role('00000000-0000-4000-8000-0000000000e3', 'admin')$$, '42501');
select t.assert((public.admin_set_user_role('00000000-0000-4000-8000-0000000000e2', 'admin')).role = 'admin',
  'admin can promote an in-scope user');
select t.assert((public.admin_set_user_role('00000000-0000-4000-8000-0000000000e2', 'employee')).role = 'employee',
  'admin can demote an in-scope user');
select t.assert((public.admin_set_user_active('00000000-0000-4000-8000-0000000000e2', false)).is_active = false,
  'admin can deactivate an in-scope user');

:as_emp2
select t.raises($$select public.check_in('11111111-1111-4111-8111-111111111111')$$, '42501');
select t.raises($$select public.check_out()$$, '42501');

:as_admin1
select public.admin_set_user_active('00000000-0000-4000-8000-0000000000e2', true);

-- =============================================================================
-- Audit log (FR-15)
-- =============================================================================
:as_admin1
select t.assert((select count(*) from public.audit_log
                  where action = 'user.role_changed'
                    and actor_id = '00000000-0000-4000-8000-0000000000a1') = 2,
  'role changes made by an administrator are audited with their id');
select t.assert((select count(*) from public.audit_log
                  where action = 'user.role_changed' and actor_id is null) = 2,
  'role changes made by the service role are audited without an actor');
select t.assert((select count(*) from public.audit_log where action = 'user.deactivated') = 1, 'deactivation is audited');
select t.assert((select count(*) from public.audit_log where action = 'leave.approved') = 1, 'leave decisions are audited');
select t.assert((select count(*) from public.audit_log where action = 'leave.submitted') = 3, 'leave submissions are audited');
select t.assert((select count(*) from public.audit_log where action = 'leave.document_added') = 1, 'document uploads are audited');
select t.assert((select count(*) from public.audit_log where action = 'alert.acknowledged') = 1, 'alert handling is audited');
select t.assert((select count(*) from public.audit_log where action = 'site.created' and entity_id = :'annex') = 1, 'site creation is audited');
select t.assert((select count(*) from public.audit_log where action = 'site.deactivated' and entity_id = :'annex') = 1, 'site deactivation is audited');
select t.assert((select count(*) from public.audit_log where action = 'site.updated' and entity_id = :'annex') = 1, 'site edits are audited');
select t.assert((select actor_id from public.audit_log where action = 'leave.approved') = '00000000-0000-4000-8000-0000000000a1',
  'audit entries record the acting user');
select t.raises($$update public.audit_log set action = 'tampered'$$, '42501');
select t.raises($$delete from public.audit_log$$, '42501');
select t.raises($$select public.record_audit('x', 'y', 'z')$$, '42501');

:as_emp1
select t.assert((select count(*) from public.audit_log) = 0, 'employees see no audit entries');

:as_super
select t.raises($$update public.audit_log set action = 'tampered'$$, '42501');
select t.raises($$delete from public.audit_log$$, '42501');
select t.raises($$truncate public.audit_log$$, '42501');
select t.raises($$delete from public.attendance$$, '42501');
select t.raises(format($q$update public.attendance set check_out_at = now() where id = %L$q$, :'ci1'), '42501');
select t.raises(format($q$update public.attendance set employee_id = '00000000-0000-4000-8000-0000000000e2' where id = %L$q$, :'ci2'), '42501');

-- =============================================================================
-- Site manager, tasks, incidents and site rules (0007, 0008)
--   m1 manages site s1; m2 manages site s2.
-- =============================================================================
:as_super
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000b1', 'mgr1@test.local', '{"full_name":"Manager One"}'),
  ('00000000-0000-4000-8000-0000000000b2', 'mgr2@test.local', '{"full_name":"Manager Two"}');
update public.profiles set role = 'manager', home_site_id = '11111111-1111-4111-8111-111111111111'
 where id = '00000000-0000-4000-8000-0000000000b1';
update public.profiles set role = 'manager', home_site_id = '22222222-2222-4222-8222-222222222222'
 where id = '00000000-0000-4000-8000-0000000000b2';
\set as_mgr1 'reset role; set request.jwt.claim.sub = ''00000000-0000-4000-8000-0000000000b1''; set role authenticated; '
\set as_mgr2 'reset role; set request.jwt.claim.sub = ''00000000-0000-4000-8000-0000000000b2''; set role authenticated; '

select t.assert((select work_start::text from public.sites where id = '11111111-1111-4111-8111-111111111111') = '08:00:00',
  'sites default to an 08:00 start');
select t.raises($$update public.sites set work_end = '07:00' where id = '11111111-1111-4111-8111-111111111111'$$, '23514');

:as_mgr1
select t.assert(public.is_manager(), 'manager is recognised');
select t.assert(not public.is_admin(), 'manager is not an administrator');
select t.assert((select count(*) from public.profiles) = 4,
  'manager sees themselves and the three people at their own site');
select t.assert((select count(*) from public.profiles where home_site_id = '22222222-2222-4222-8222-222222222222') = 0,
  'manager cannot see people at another site');
select t.assert(t.affected($$update public.sites set radius_m = 5000
                             where id = '11111111-1111-4111-8111-111111111111'$$) = 0,
  'manager cannot edit site rules');
select t.raises($$select public.admin_set_user_role('00000000-0000-4000-8000-0000000000e1', 'admin')$$, '42501');
select t.assert((select count(*) from public.audit_log) = 0, 'manager cannot read the audit log');

-- tasks
select t.raises($$insert into public.tasks (site_id, assigned_to, created_by, title)
                  values ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-0000000000e1',
                          '00000000-0000-4000-8000-0000000000b1', 'direct')$$, '42501');
select public.create_task('00000000-0000-4000-8000-0000000000e1', 'Inspect server room', 'high', now() + interval '4 hours');
select t.assert((select count(*) from public.tasks where title = 'Inspect server room' and status = 'pending') = 1,
  'manager creates a task for an employee at their site');
select t.raises($$select public.create_task('00000000-0000-4000-8000-0000000000e3', 'Wrong site', 'low')$$, '42501');
select t.raises($$select public.create_task('00000000-0000-4000-8000-0000000000e1', '   ', 'low')$$, '22023');
select t.raises($$select public.create_task('00000000-0000-4000-8000-0000000000a1', 'Admin is not an employee', 'low')$$, '42501');

:as_emp1
select t.assert((select count(*) from public.tasks) = 1, 'employee sees the task assigned to them');
select t.raises($$select public.create_task('00000000-0000-4000-8000-0000000000e1', 'Self assigned', 'low')$$, '42501');
select t.assert((select (public.set_task_status((select id from public.tasks limit 1), 'in_progress')).status) = 'in_progress',
  'assignee can start their task');
select t.assert((select (public.set_task_status((select id from public.tasks limit 1), 'done')).completed_at) is not null,
  'completing a task stamps completed_at');

:as_emp2
select t.assert((select count(*) from public.tasks) = 0, 'other employees cannot see the task');
select t.raises($$select public.set_task_status((select id from public.tasks limit 1), 'done')$$, 'P0002');

:as_mgr2
select t.assert((select count(*) from public.tasks) = 0, 'manager of another site cannot see the task');

-- incidents
:as_emp1
select public.report_incident('hazard', 'high', 'Water leak in Bay 3', 'Warehouse');
select t.assert((select count(*) from public.incidents) = 1, 'employee reports an incident');
select t.raises($$select public.report_incident('hazard', 'low', '   ')$$, '22023');
select t.raises($$insert into public.incidents (site_id, reported_by, category, details)
                  values ('11111111-1111-4111-8111-111111111111', '00000000-0000-4000-8000-0000000000e1', 'hazard', 'x')$$, '42501');
select t.raises($$select public.set_incident_status((select id from public.incidents limit 1), 'resolved')$$, '42501');

:as_emp2
select t.assert((select count(*) from public.incidents) = 0, 'employees only see incidents they reported');

:as_mgr1
select t.assert((select count(*) from public.incidents) = 1, 'manager sees incidents at their site');
select t.assert((select (public.set_incident_status((select id from public.incidents limit 1), 'investigating')).status) = 'investigating',
  'manager updates an incident status');

:as_mgr2
select t.assert((select count(*) from public.incidents) = 0, 'manager of another site cannot see the incident');
select t.raises($$select public.set_incident_status((select id from public.incidents limit 1), 'resolved')$$, 'P0002');

:as_admin1
select t.assert((select count(*) from public.tasks) = 1 and (select count(*) from public.incidents) = 1,
  'scoped administrator can read tasks and incidents');
select t.assert(t.affected($$update public.sites set work_start = '07:30', authorised_network = 'Office Wi-Fi'
                             where id = '11111111-1111-4111-8111-111111111111'$$) = 1,
  'scoped administrator can edit site working rules');
select t.assert((select count(*) from public.audit_log where action in
  ('task.created', 'task.status_changed', 'incident.reported', 'incident.status_changed')) = 5,
  'task and incident actions are audited');

:as_admin2
select t.assert((select count(*) from public.tasks) = 0 and (select count(*) from public.incidents) = 0,
  'administrator of another site cannot read them');

:as_super
select 'ALL DATABASE TESTS PASSED' as result;
