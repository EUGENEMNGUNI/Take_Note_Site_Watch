# Site Watch

Digital employee attendance, site-presence verification and leave management.
Built with Next.js, TypeScript and Supabase (PostgreSQL). See
[`docs/requirements.md`](docs/requirements.md) for the full specification.

## Repository layout

| Path | Contents |
| --- | --- |
| `front-end/` | Next.js application, authenticated API routes, and Supabase clients (`lib/supabase/`) |
| `back-end/` | Development scripts for connection checks and test-account seeding |
| `database/schema/` | Ordered SQL migrations: tables, Row Level Security, functions, storage |
| `database/seed/` | Sample sites for local development |
| `tests/automated/` | Database acceptance tests (`run_db_tests.sh`) |
| `docs/` | Requirements, database design, setup, testing, decisions |

## Getting started

Follow [`docs/setup.md`](docs/setup.md). To check the database layer on its own:

```bash
PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres tests/automated/run_db_tests.sh
```

## Status

Foundation in place: schema, access control, check-in/out and leave functions,
audit log, private document storage, Supabase clients, seed data and tests.
Sign-in, password reset, session refresh, attendance, leave with document
upload, and administrator review/dashboard are implemented. Still to build:
tasks, incident reports, the manager role, site rules (hours/network), alerts
and reports views. Open decisions are listed in `docs/requirements.md` §9.
