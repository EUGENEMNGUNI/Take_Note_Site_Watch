# Setup

## Prerequisites

- Node.js 22.9 or newer, and npm
- A Supabase project (hosted), **or** the Supabase CLI with Docker for a local
  stack
- `psql` if you apply the SQL from the command line

## 1. Database

The migrations in `database/schema/` are applied **in filename order**:

```
0001_base.sql        enums and utility functions
0002_identity.sql    profiles, sites, administrator scope, access helpers
0003_audit.sql       audit log, role/status management
0004_attendance.sql  attendance, check-in/out, alerts, hours view
0005_leave.sql       leave requests, documents, review
0006_storage.sql     private document bucket and its policies
```

Either paste them into the Supabase SQL Editor one at a time, or run them with
`psql` against the project's database connection string:

```bash
for f in database/schema/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/seed/seed.sql   # dev only
```

Do not apply `tests/automated/supabase_stub.sql` to a real project.

The Supabase CLI expects migrations in `supabase/migrations/` with timestamped
names. If the team adopts the CLI, copy or symlink these files there, keeping the
order.

## 2. Environment variables

```bash
cp front-end/.env.example front-end/.env.local
cp back-end/.env.example  back-end/.env
```

Fill in the project URL, the anon (public) key and the **service role** key from
Supabase Project Settings, API. The service role key bypasses Row Level
Security: keep it server-side, never prefix it with `NEXT_PUBLIC_`, never commit
it. `.env.local` and `.env` are git-ignored.

The employee-registration API runs in the Next.js server, so also add the
service role key to the private `front-end/.env.local` as
`SUPABASE_SERVICE_ROLE_KEY`. Restart `npm run dev` after changing environment
variables. Site creation uses the signed-in administrator's normal client and
is protected by database Row Level Security.

## Troubleshooting the connection

```bash
cd back-end
npm install
npm run check:connection
```

It checks both env files (wrong key in the wrong place, quotes, leftover
brackets, local URL), whether Supabase answers and accepts the key, whether all
tables exist, and whether the sample sites and test accounts are there. It
prints what to fix and never prints the keys.

## 3. Test accounts (development only)

After the seed has created the sample sites:

```bash
cd back-end
npm install
npm run seed:users
```

This creates `admin@sitewatch.test`, `employee1@sitewatch.test` and
`employee2@sitewatch.test` with the `SEED_PASSWORD` you set in `back-end/.env`,
and gives the administrator scope over both sample sites. The script refuses to
run against a non-local Supabase URL unless `ALLOW_NON_LOCAL_SEED=yes`.

## 4. Run the app

```bash
cd front-end
npm install
npm run dev
```

## Supabase clients in the front end

| File | Use it in | Acts as |
| --- | --- | --- |
| `lib/supabase/browser.ts` | Client Components | the signed-in user (RLS applies) |
| `lib/supabase/server.ts` | Server Components, Server Functions, Route Handlers | the signed-in user (RLS applies) |
| `lib/supabase/admin.ts` | trusted server code only | the service role (bypasses RLS) |

`admin.ts` imports `server-only`, so the build fails if it is pulled into client
code. On the server, identify the caller with `supabase.auth.getUser()`, not
`getSession()`.

Generate TypeScript types for the schema with the Supabase CLI once the project
is linked: `supabase gen types typescript --project-id <id>`.

## Application API

The Next.js server exposes the following authenticated endpoints. Requests use
the caller's Supabase session and database Row Level Security; attendance writes
and leave decisions go through the database functions described in
[`database-design.md`](database-design.md).

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/attendance` | Employee or administrator | Return scoped attendance history, active sites, and the caller profile |
| `POST` | `/api/attendance` | Employee | Check in with a site ID and optional coordinates / request ID |
| `PATCH` | `/api/attendance` | Employee | Check out with optional coordinates / request ID |
| `GET` | `/api/leave` | Employee | List the caller's leave requests |
| `POST` | `/api/leave` | Employee | Submit a sick-leave request (`startDate`, `endDate`, optional `reason`) |
| `PATCH` | `/api/leave/{requestId}` | Employee | Cancel a pending request (`{"action":"cancel"}`) |
| `GET` | `/api/admin/leave` | Administrator | List leave requests visible within the administrator's site scope |
| `PATCH` | `/api/admin/leave/{requestId}` | Administrator | Approve or reject a pending request (`decision`, optional `note`) |
| `GET` | `/api/admin/leave/{requestId}/documents` | Administrator | List a request's supporting documents with 5-minute signed URLs |

Mutation routes require a same-origin JSON request. They validate input and
return an `{ "error": "..." }` response with an appropriate HTTP status on
failure. Employees upload sick-leave documents straight to the private
`leave-documents` bucket (Storage policies enforce ownership); the manager,
task, and incident features are not implemented.

## Not done yet

Sign-in, password reset (Supabase email one-time code), session refresh and
redirect of signed-out visitors (`front-end/proxy.ts`), employee attendance and
leave with document upload, and administrator leave review, site/employee
creation, live attendance counts and activity history are implemented. The
password-reset email must be configured in Supabase (the template has to
include the `{{ .Token }}` code). Still demo data: employee tasks, incident
reports, the manager screen, and the "Site rules" card (work hours and network
have no schema yet). The database schema supports employee and administrator
roles only.
