# Testing

## Automated database tests

`tests/automated/` checks the schema, Row Level Security and the write
functions against a throwaway PostgreSQL 15+ database. A small stub
(`supabase_stub.sql`) stands in for Supabase's `auth` and `storage` schemas and
its API roles, then every migration and the seed are applied, then
`rls_acceptance.sql` runs. The database is dropped afterwards.

```bash
PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres tests/automated/run_db_tests.sh
# VERBOSE=1 prints every passing assertion
```

The script needs permission to create databases, and exits non-zero on the first
failed assertion. Users are impersonated the way Supabase does it: a database
role (`anon` or `authenticated`) plus the caller's id in
`request.jwt.claim.sub`.

## Automated server tests

`tests/automated/register-employee.test.ts` tests the employee registration
logic with fake Supabase clients: order of checks, error mapping, rollback of
the new account, and that the password and personal data never appear in
errors or logs.

```bash
cd back-end
npm install
npm test            # 21 tests
npm run typecheck   # also type-checks the tests
```

### Coverage against `requirements.md` §8

| Acceptance criterion | Where it is checked |
| --- | --- |
| Employees cannot reach administrator functions | role, site, audit and alert checks as an employee; admin functions rejected |
| Valid check-in and check-out events | verified, unverified and outside-radius check-ins; check-out; duplicate and retry handling |
| Records tied to the correct employee | attendance owner assertions |
| Employees cannot read another's records | attendance, profile, leave, document and file isolation between two employees |
| Administrators see only what their role permits | two administrators with different site scopes |
| Leave requests and decisions recorded correctly | submit, approve, reviewer and time stamps, double review, self-review, cancel |
| Sensitive documents protected | private bucket, path rules, upload only for own pending request, scoped admin reads, no changes by employees |
| Invalid input handled | out-of-range coordinates, bad file type and size, bad dates, unknown site |
| Only authorised administrators register employees | `register_employee_profile`: not callable by browser roles, actor and site scope re-checked, cannot re-register or move existing people, audit entry names the administrator; server tests for 401/403/409/422 and rollback |
| Audit trail | every audited action, plus append-only enforcement even for the service role |

### What these tests do not cover

- Supabase Auth itself (sign-in, sign-out, password reset) and the real
  `auth` and `storage` services: the stub only mimics the parts the schema uses.
  Re-run the key isolation checks once against a real Supabase project.
- The Next.js application: route protection, forms and error states.
- Concurrency under load: the unique indexes guard against duplicate open
  check-ins, but there is no parallel stress test yet.

## Manual tests

`tests/manual/` is reserved for scripted manual checks (browser sign-in,
check-in on a phone, document upload). None are written yet.
