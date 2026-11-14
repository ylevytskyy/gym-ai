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
if cat "$HERE/rls_tests.sql" "$HERE/usage_tests.sql" "$HERE/revenuecat_tests.sql" | run > /tmp/supa-rls.log 2>&1; then e=0; else e=$?; fi
grep -E "NOTICE:  ok|ERROR|FAIL|ALL (USAGE |REVENUECAT )?CHECKS" /tmp/supa-rls.log | sed -E 's/^.*NOTICE:  //' | cut -c1-160
if [ "$e" = 0 ]; then
  # 20 requests at once from separate sessions for a free user with 10 messages a day: exactly 10 get in.
  C=cccccccc-0000-4000-8000-000000000020
  echo "INSERT INTO auth.users (id, email) VALUES ('$C', 'race@example.com');
INSERT INTO profiles (id, age_range, weight_kg, goal, fitness_level, minutes_per_day) VALUES ('$C', '18-24', 60, 'g', 1, 10);" | run > /dev/null 2>&1 || e=1
  for i in $(seq 1 20); do
    docker exec "$CONTAINER" psql -U postgres -d postgres -tAc "SELECT reserve_ai_use('$C', 'chat_message', 'race-$i')->>'allowed'" > "/tmp/supa-race-$i.log" 2>&1 &
  done
  wait
  allowed=$(cat /tmp/supa-race-*.log | grep -c '^true$')
  refused=$(cat /tmp/supa-race-*.log | grep -c '^false$')
  rm -f /tmp/supa-race-*.log
  if [ "$allowed" = 10 ] && [ "$refused" = 10 ]; then echo "ok: U32 20 parallel requests for a free user: exactly 10 allowed"; else echo "FAIL: U32 parallel requests: $allowed allowed, $refused refused"; e=1; fi
fi
docker rm -f "$CONTAINER" >/dev/null
echo "rls checks exit: $e"
exit $e
