# Database Design

PostgreSQL on Supabase. The schema lives in `database/schema/` as ordered SQL
files; sample data is in `database/seed/`. Everything is in the `public`
schema except the private document bucket in Supabase Storage.

## Principles

1. **The database enforces access, not just the UI.** Every table has Row Level
   Security (RLS) enabled. Default Supabase privileges are revoked and only what
   each role needs is granted back, so a forgotten policy fails closed.
2. **Clients read; the server rules write.** Sensitive writes (check-in,
   check-out, leave review, role changes, alert handling) happen only through
   `SECURITY DEFINER` functions that validate input and use the server clock.
3. **Records are append-only where it matters.** Attendance cannot be deleted
   or edited once closed; the audit log cannot be changed by anyone.
4. **Safe retries.** `check_in` and `check_out` accept an optional
   client-generated request id, so a repeated request after a network failure
   returns the original record instead of creating a duplicate.

## Roles and scope

Only two roles exist, matching `requirements.md` §3: `employee` and `admin`. A
`manager` role is **not** created (see Open decisions).

Administrators are scoped by site through `admin_site_access`:

| Data | An administrator sees it when... |
| --- | --- |
| Attendance, alerts | the record's **site** is in their scope |
| Profiles, leave requests, documents | the employee's **home site** is in their scope |
| Audit log | always (all administrators see the whole log) |

Employees see only their own rows. An employee's role, status and home site
cannot be changed by the employee; only their own `full_name` is editable.

## Tables

| Table | Purpose |
| --- | --- |
| `profiles` | One row per Auth user: name, role, home site, active flag. Created automatically on sign-up with role `employee` (never taken from user metadata). |
| `sites` | Work sites: coordinates, radius in metres, `enforce_radius`, active flag. Sites are deactivated, never deleted. |
| `admin_site_access` | Which sites each administrator may see. Managed by the service role. |
| `attendance` | Check-in/check-out pairs with server timestamps, presence status and the coordinates supplied. |
| `alerts` | Attendance exceptions for administrators. Currently raised: `outside_radius`. |
| `leave_requests` | Sick-leave requests and their decision (status, reviewer, time, note). |
| `leave_documents` | Metadata for uploaded files; the files themselves live in Storage. |
| `audit_log` | Append-only record of security-sensitive and administrative actions. |

View: `attendance_hours` (per record: hours worked, open flag). It uses
`security_invoker`, so it follows the caller's RLS.

## Functions (the write API)

| Function | Who | What it does |
| --- | --- | --- |
| `check_in(site, lat, lng, accuracy, request_id)` | employee | Rejects inactive sites and a second open check-in; computes distance and presence status; rejects unverified check-ins when the site has `enforce_radius`; raises an `outside_radius` alert. |
| `check_out(lat, lng, request_id)` | employee | Closes the caller's open record; error if none. |
| `cancel_leave_request(id)` | employee | Cancels their own pending request. |
| `review_leave_request(id, decision, note)` | admin | Approves or rejects a pending request in scope; cannot review one's own. |
| `acknowledge_alert(id, status)` | admin | Marks an in-scope alert acknowledged or resolved. |
| `admin_set_user_role(user, role)` | admin | Changes the role of an in-scope user; not one's own. |
| `admin_set_user_active(user, active)` | admin | Activates or deactivates an in-scope user; not one's own. |

Errors use SQLSTATE codes the application can map to messages: `28000` not
signed in, `42501` not allowed, `P0002` not found, `22023` invalid input,
`23505` duplicate (already checked in).

## Documents (Storage)

Bucket `leave-documents` is private, limited to 10 MB and to PDF, JPEG and PNG.
Object keys must be `<employee_id>/<leave_request_id>/<file name>`.

- An employee can upload only into their own folder, for one of their own
  **pending** requests, and can read their own files.
- An administrator can read files of employees in scope. The server should hand
  out short-lived signed URLs rather than expose paths.
- Nobody but the service role can change or delete files.

## Audit coverage

Recorded automatically by triggers (also when the change comes from the service
role, with no actor): role, status and home-site changes; site create, edit and
(de)activation; administrator scope grants and revocations; leave submission,
documents added and every status change; alert acknowledgement and resolution.

Not yet recorded: sign-ins (Supabase Auth keeps its own log; surfacing it is
part of the authentication step) and attendance corrections (none exist yet).

## Open decisions that will change this schema

These come from `requirements.md` §9 and are deliberately not hard-coded.

- **Site-presence method.** The foundation supports a location radius with
  `sites.enforce_radius` off by default (flag, do not block). A network-based
  method would need an extra column or table.
- **Manager role, tasks, incidents, messaging, map.** Not modelled. Add them
  only once approved. `alter type public.user_role add value 'manager'` is
  enough to introduce the role itself.
- **Working-hours rules.** `attendance_hours` is raw duration: no break
  deduction, overtime split or missed-check-out handling.
- **Alert rules and channels.** Only `outside_radius` is generated. The enum
  already lists `late_arrival`, `no_check_in` and `missed_check_out`.
- **Retention.** Foreign keys from attendance and leave to `profiles` use
  `on delete restrict`, so a user with records is deactivated, not deleted.
  Deleting old attendance, location data or documents needs an audited
  server-side procedure once the retention period is agreed.
- **Administrator corrections to attendance** need their own audited function.

## Known limits

- A newly created user has no home site, so no administrator can see or manage
  them until the server assigns one (the seed script shows how).
- Employees can list all active sites and their coordinates (needed to check
  in). The coordinates are not personal data, but say so if that is a concern.
- Location coordinates are stored with each attendance record. Keep this to the
  minimum the agreed verification method needs.
