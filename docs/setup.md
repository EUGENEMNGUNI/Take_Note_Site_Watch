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
0007_register_employee.sql  server-only step that completes a new employee's account
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

## Registering employees

`POST /api/admin/employees` creates an employee's sign-in account and sets their
home site. It runs on the server with the secret key, which is why it is an API
route and not something the browser does directly. Apply
`0007_register_employee.sql` first.

Request (JSON, same origin, signed in as an administrator):

```json
{ "fullName": "Thandi Nkosi", "email": "thandi@example.com", "homeSiteId": "<site uuid>" }
```

Success (`201`, never cached): the new employee plus a **temporary password**
that is shown once and not stored anywhere. The administrator passes it to the
employee. The account is marked `must_change_password` in its `app_metadata`
(users cannot edit that); the sign-in screen must enforce the change when it is
built.

Errors come back as `{ "error": { "code", "message", "fields?" } }`:

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `invalid_input`, `invalid_json` | Bad name, email or site id (see `fields`) |
| 401 | `not_signed_in` | No valid session |
| 403 | `forbidden`, `bad_origin` | Not an administrator of that site, or a cross-site request |
| 409 | `email_taken` | An account with that email already exists |
| 413, 415 | `payload_too_large`, `unsupported_media_type` | Not a small JSON body |
| 422 | `site_inactive` | The chosen site is inactive |
| 502 | `account_creation_failed` | Supabase could not create the account |

Why a temporary password and not an email invite: Supabase's built-in email
only delivers to your own team members until you connect an email provider
(SMTP). Once one is connected, switching to invitations is a small change.

Registering needs the administrator to have access to the site in
`admin_site_access`. The seeded test administrator has both sample sites.

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

## Not done yet

Route protection and session refresh (a Next.js proxy), the sign-in and
password-reset screens wired to Supabase Auth, the forced password change at
first sign-in, and the screens that call the functions and endpoints described
in `database-design.md` (including a "register employee" form that calls
`POST /api/admin/employees`). Until sign-in exists, nobody has a session, so
the endpoint cannot be used from the browser yet.
