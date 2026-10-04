#!/usr/bin/env bash
# Run the database migrations and the sharing rules test against a scratch
# Postgres + PostGIS. Needs a running server; set PGHOST/PGPORT/PGUSER as usual.
#   PGHOST=/var/run/postgresql scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${CAUSEWAY_TEST_DB:-causeway_test}
psql -q -v ON_ERROR_STOP=1 -c "drop database if exists $DB" -c "create database $DB"
for f in db/test/supabase-stub.sql db/migrations/*.sql; do
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"
done
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f db/test/sharing.test.sql 2>&1 | grep -E "ok:|FAILED|ERROR"
echo "Database rules: all checks passed."
