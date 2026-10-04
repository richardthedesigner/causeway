#!/usr/bin/env bash
# Run the database migrations and the sharing and review rules tests against a scratch
# Postgres + PostGIS. Needs a running server; set PGHOST/PGPORT/PGUSER as usual.
#   PGHOST=/var/run/postgresql scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${CAUSEWAY_TEST_DB:-causeway_test}
psql -q -v ON_ERROR_STOP=1 -c "drop database if exists $DB" -c "create database $DB"
for f in db/test/supabase-stub.sql db/migrations/*.sql; do
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"
done
for t in db/test/sharing.test.sql db/test/review.test.sql; do
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$t" 2>&1 | grep -E "ok:|FAILED|ERROR"
done
echo "Database rules: all checks passed."
