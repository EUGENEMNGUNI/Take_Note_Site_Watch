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

## Not done yet

Route protection and session refresh (a Next.js proxy), the sign-in and
password-reset screens wired to Supabase Auth, and the screens that call the
functions described in `database-design.md`.
