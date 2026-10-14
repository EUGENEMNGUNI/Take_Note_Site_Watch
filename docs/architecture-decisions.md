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

## ADR-002: Two roles, site-scoped administrators

**Decision.** `employee` and `admin` only. Administrators see data only for the
sites in `admin_site_access`.
**Why.** The requirements list these two roles and say administrators work
"within their authorised scope". The manager role from the mockups is not in the
requirements.
**Consequence.** Adding a manager role later is an enum value plus new policies.

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
