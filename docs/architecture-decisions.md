# Architecture Decisions

Short records of decisions made while building the foundation. Update or
supersede them as the supervisor confirms the open items in `requirements.md`
§9.

## ADR-001: Access is enforced in the database

**Decision.** Row Level Security on every table, default privileges revoked,
column-level grants for the few direct writes, and `SECURITY DEFINER` functions
for everything else.
**Why.** FR-02 and the security requirements ask for controls in the database as
well as the application. It also means a bug in the UI cannot expose data.
**Consequence.** New tables must enable RLS and revoke default grants in their
migration; the tests should gain a case for each.

## ADR-002: Site-scoped managers and administrators

**Decision.** Employees, managers and administrators have separate permissions.
Managers are assigned one `home_site_id` and can access only that site's
manager workflows; administrators see data only for sites in
`admin_site_access`.
**Why.** Site managers need to monitor attendance and coordinate staff without
receiving administrator privileges.
**Consequence.** Manager scope is enforced in database policies and functions,
not inferred from the dashboard. Manager accounts require a home site.

## ADR-003: Attendance is written by functions, with the server clock

**Decision.** Clients cannot insert or update attendance. `check_in` and
`check_out` validate, compute the presence status and stamp `now()`.
**Why.** Preserves accurate timestamps (reliability requirements) and prevents
back-dated or duplicated records.
**Consequence.** Corrections and retention purges need their own audited
procedures.

## ADR-004: Presence is flagged by default, enforcement is per site

**Decision.** A location radius check runs on the server. `sites.enforce_radius`
is off by default: out-of-radius check-ins are recorded and raise an alert.
**Why.** The verification method, accuracy and exceptions are still undecided.
GPS can be inaccurate indoors, so blocking by default risks locking out honest
employees.
**Consequence.** Switch enforcement on per site once the method is agreed.

## ADR-005: Roles never come from sign-up metadata

**Decision.** The new-user trigger always assigns `employee`. Promotion happens
through `admin_set_user_role` or the service role.
**Why.** Users can set their own metadata when signing up.

## ADR-006: Service role key stays on the server

**Decision.** `lib/supabase/admin.ts` imports `server-only`; the key is never
`NEXT_PUBLIC_`. The seed script refuses non-local projects by default.
**Why.** The service role key bypasses RLS entirely.
