#!/bin/bash
# Behaviour checks for the migrations (RLS, CHECK constraints, foreign keys, storage)
# on a throwaway Postgres 16 container with a minimal Supabase stand-in.
# Requires Docker. This is NOT hosted Supabase; see services/assistant/README.md.
set -o pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SUPA="$(cd "$HERE/.." && pwd)"
CONTAINER=supa-rls-check
docker rm -f "$CONTAINER" >/dev/null 2>&1
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=pw postgres:16-alpine >/dev/null || exit 2
for i in $(seq 1 30); do docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
run() { docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -a; }
run < "$HERE/00_supabase_stub.sql" > /tmp/supa-stub.log 2>&1 || { echo "stub failed"; tail -n 20 /tmp/supa-stub.log; docker rm -f "$CONTAINER" >/dev/null; exit 2; }
for f in "$SUPA"/migrations/*.sql "$SUPA"/seed.sql; do
  run < "$f" > /tmp/supa-step.log 2>&1 || { echo "failed: $(basename "$f")"; tail -n 20 /tmp/supa-step.log; docker rm -f "$CONTAINER" >/dev/null; exit 2; }
done
if run < "$HERE/rls_tests.sql" > /tmp/supa-rls.log 2>&1; then e=0; else e=$?; fi
grep -E "NOTICE:  ok|ERROR|FAIL|ALL CHECKS" /tmp/supa-rls.log | sed -E 's/^.*NOTICE:  //' | cut -c1-160
docker rm -f "$CONTAINER" >/dev/null
echo "rls checks exit: $e"
exit $e
