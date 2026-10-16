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

## ADR-007: Employees are registered by the server, with a temporary password

**Decision.** `POST /api/admin/employees` checks the caller's session and site
scope as the caller, creates the Auth user with the secret key, then calls the
service-role-only `register_employee_profile` function to set the name and home
site and write the audit entry. If the second step fails, the Auth user is
deleted again. The new account gets a random temporary password, shown once to
the administrator, and is flagged `must_change_password`.
**Why.** Only the server may create accounts (the secret key must not reach the
browser). The database function re-checks the administrator's scope, so a bug
in the server code cannot register someone at a site the administrator does not
manage, and it only configures accounts that are still unregistered, so it
cannot move existing people. Email invitations were not chosen because
Supabase's built-in email only reaches team members until SMTP is configured.
**Consequence.** The server code lives in the Next.js app (`front-end/lib/server`)
because that is what is deployed; it has no Next.js imports so it can be tested
on its own. The temporary password is a credential in transit: the administrator
must hand it over privately, and the sign-in screen must force a change.
