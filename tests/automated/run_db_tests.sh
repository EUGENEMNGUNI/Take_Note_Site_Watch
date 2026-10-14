#!/usr/bin/env bash
# Applies the stub, every migration and the seed to a throwaway PostgreSQL
# database, then runs the acceptance tests. The database is dropped afterwards.
#
# Needs PostgreSQL 15+ client tools and a server you can create databases on.
# Connection settings come from the standard PG* environment variables
# (PGHOST, PGPORT, PGUSER, PGPASSWORD). Example:
#   PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres tests/automated/run_db_tests.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB="sitewatch_test_$$"

createdb "$DB"
trap 'dropdb --if-exists "$DB" >/dev/null 2>&1 || true' EXIT

run() { psql -X -q -v ON_ERROR_STOP=1 -d "$DB" "$@"; }

echo "==> stub"
run -f "$ROOT/tests/automated/supabase_stub.sql"

for f in "$ROOT"/database/schema/*.sql; do
  echo "==> migration $(basename "$f")"
  run -f "$f"
done

echo "==> seed (twice, to prove it is idempotent)"
run -f "$ROOT/database/seed/seed.sql"
run -f "$ROOT/database/seed/seed.sql"

echo "==> acceptance tests"
LOG="$(mktemp)"
if run -f "$ROOT/tests/automated/rls_acceptance.sql" >"$LOG" 2>&1; then
  [ "${VERBOSE:-0}" = "1" ] && grep "ok - " "$LOG" || true
  echo "PASSED: $(grep -c 'ok - ' "$LOG") assertions"
  rm -f "$LOG"
else
  grep -E "ok - " "$LOG" | tail -n 5 || true
  grep -E "ASSERT|ERROR|DETAIL|CONTEXT|LINE" "$LOG" || cat "$LOG"
  echo "FAILED (full log: $LOG)"
  exit 1
fi
