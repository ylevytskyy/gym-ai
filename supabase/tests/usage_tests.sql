\set ON_ERROR_STOP on
-- Pro entitlement and AI usage limits (migration 010). Runs after rls_tests.sql, which defines
-- t_check and t_expect_error. See docs/usage-limits-spec.md.

\set A 'aaaaaaaa-0000-4000-8000-000000000001'
\set B 'bbbbbbbb-0000-4000-8000-000000000002'
-- 21:30 UTC on 13 Nov 2026 is 23:30 in Kyiv (UTC+2), half an hour before local midnight.
\set T0 '2026-11-13 21:30:00+00'

-- ---------------------------------------------------------------- time zone on the profile
SELECT t_check((SELECT timezone FROM profiles WHERE id = :'A') = 'UTC', 'Z1 a profile counts days in UTC until the app sends a time zone');
SELECT t_expect_error(format($q$UPDATE profiles SET timezone = 'Mars/Olympus' WHERE id = %L$q$, :'A'), '22023', 'Z2 an unknown time zone is rejected');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'A', false);
UPDATE profiles SET timezone = 'Europe/Kyiv' WHERE id = :'A';
RESET ROLE;
SELECT t_check((SELECT timezone FROM profiles WHERE id = :'A') = 'Europe/Kyiv', 'Z3 a user can set their own time zone');

-- ---------------------------------------------------------------- free daily coach messages
SELECT set_config('t.last', '', false);
DO $$
DECLARE r jsonb;
BEGIN
  FOR i IN 1..10 LOOP
    r := reserve_ai_use('aaaaaaaa-0000-4000-8000-000000000001', 'chat_message', 'chat-' || i, '2026-11-13 21:30:00+00');
    IF (r->>'allowed')::boolean IS NOT TRUE OR (r->>'remaining')::int <> 10 - i OR r->>'tier' <> 'free' THEN
      RAISE EXCEPTION 'FAIL: free chat % returned %', i, r;
    END IF;
  END LOOP;
  RAISE NOTICE 'ok: U1 a free user gets 10 coach messages a day, remaining counts down to 0';
END $$;
SELECT t_check((reserve_ai_use(:'A', 'chat_message', 'chat-11', :'T0')->>'allowed')::boolean = false, 'U2 the 11th free coach message in a local day is refused');
SELECT t_check((reserve_ai_use(:'A', 'chat_message', 'chat-12', :'T0')->>'resets_at')::timestamptz = '2026-11-13 22:00:00+00', 'U3 the refusal says the limit resets at local midnight');
SELECT t_check((SELECT count(*) FROM ai_usage WHERE user_id = :'A' AND action = 'chat_message') = 10, 'U4 a refused request leaves no usage row');
SELECT t_check((reserve_ai_use(:'A', 'chat_message', 'chat-13', '2026-11-13 22:00:01+00')->>'allowed')::boolean, 'U5 after local midnight the allowance is back');

-- ---------------------------------------------------------------- idempotency and release
SELECT set_config('t.first', reserve_ai_use(:'A', 'new_plan', 'plan-1', :'T0')->>'use_id', false);
SELECT t_check((reserve_ai_use(:'A', 'new_plan', 'plan-1', :'T0')->>'duplicate')::boolean AND (reserve_ai_use(:'A', 'new_plan', 'plan-1', :'T0')->>'allowed')::boolean = false, 'U6 the same request id again is a duplicate and is not allowed to run');
SELECT t_check((SELECT count(*) FROM ai_usage WHERE user_id = :'A' AND request_id = 'plan-1') = 1, 'U7 the same request id is counted once');
SELECT t_check((reserve_ai_use(:'A', 'chat_message', 'chat-1', :'T0')->>'duplicate')::boolean AND (reserve_ai_use(:'A', 'chat_message', 'chat-1', :'T0')->>'allowed')::boolean = false, 'U7b a used request id replayed at the limit is refused, not run again');
SELECT set_config('t.second', reserve_ai_use(:'A', 'new_plan', 'plan-2', :'T0')->>'use_id', false);
SELECT t_check((reserve_ai_use(:'A', 'new_plan', 'plan-3', :'T0')->>'allowed')::boolean = false, 'U8 the 3rd free plan in 7 days is refused');
SELECT finish_ai_use(current_setting('t.second')::uuid, false);
SELECT t_check((SELECT status FROM ai_usage WHERE id = current_setting('t.second')::uuid) = 'released', 'U9 a failed model call releases the use');
SELECT t_check((reserve_ai_use(:'A', 'new_plan', 'plan-4', :'T0')->>'allowed')::boolean, 'U10 a released use does not count against the limit');
SELECT t_check((reserve_ai_use(:'A', 'new_plan', 'plan-2', '2026-11-20 21:30:01+00')->>'allowed')::boolean, 'U10b a retry of a failed request id is allowed again');
SELECT t_check((SELECT status FROM ai_usage WHERE request_id = 'plan-2') = 'reserved', 'U10c and counted again');
UPDATE ai_usage SET status = 'released' WHERE request_id = 'plan-2';
SELECT finish_ai_use(current_setting('t.first')::uuid, true);
SELECT finish_ai_use(current_setting('t.first')::uuid, false);
SELECT t_check((SELECT status FROM ai_usage WHERE id = current_setting('t.first')::uuid) = 'used', 'U11 a finished use cannot be released afterwards');
SELECT t_check((reserve_ai_use(:'A', 'new_plan', 'plan-5', :'T0')->>'resets_at')::timestamptz = '2026-11-20 21:30:00+00', 'U12 the plan limit resets 7 days after the oldest counted plan');
SELECT t_check((reserve_ai_use(:'A', 'new_plan', 'plan-6', '2026-11-20 21:30:01+00')->>'allowed')::boolean, 'U13 a plan is allowed again once the oldest one is 7 days old');

-- ---------------------------------------------------------------- Pro
INSERT INTO entitlements (user_id, tier, expires_at, source) VALUES (:'B', 'pro', '2026-12-13 00:00:00+00', 'manual');
DO $$
DECLARE r jsonb;
BEGIN
  FOR i IN 1..150 LOOP
    r := reserve_ai_use('bbbbbbbb-0000-4000-8000-000000000002', 'chat_message', 'pro-chat-' || i, '2026-11-13 21:30:00+00');
    IF (r->>'allowed')::boolean IS NOT TRUE OR r->>'tier' <> 'pro' THEN RAISE EXCEPTION 'FAIL: pro chat % returned %', i, r; END IF;
  END LOOP;
  RAISE NOTICE 'ok: U14 a Pro user gets 150 coach messages a day';
END $$;
SELECT t_check((reserve_ai_use(:'B', 'chat_message', 'pro-chat-151', :'T0')->>'allowed')::boolean = false, 'U15 the 151st Pro coach message in a day is refused');
DO $$
DECLARE r jsonb;
BEGIN
  FOR i IN 1..20 LOOP
    r := reserve_ai_use('bbbbbbbb-0000-4000-8000-000000000002', 'new_plan', 'pro-plan-' || i, '2026-11-13 21:30:00+00');
    IF (r->>'allowed')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: pro plan % returned %', i, r; END IF;
  END LOOP;
  RAISE NOTICE 'ok: U16 a Pro user gets 20 plans in 30 days';
END $$;
SELECT t_check((reserve_ai_use(:'B', 'new_plan', 'pro-plan-21', :'T0')->>'allowed')::boolean = false, 'U17 the 21st Pro plan in 30 days is refused');
SELECT t_check(reserve_ai_use(:'B', 'chat_message', 'after-expiry', '2026-12-13 00:00:01+00')->>'tier' = 'free', 'U18 after expires_at the user is free again');
-- A Pro user makes 5 plans, one an hour, then Pro lapses. As a free user (2 in 7 days) a place
-- frees only when 4 of the 5 have left the window: at the 4th plan's time + 7 days.
INSERT INTO auth.users (id, email) VALUES ('cccccccc-0000-4000-8000-000000000007', 'lapsed@example.com');
INSERT INTO profiles (id, age_range, weight_kg, goal, fitness_level, minutes_per_day) VALUES ('cccccccc-0000-4000-8000-000000000007', '18-24', 60, 'g', 1, 10);
INSERT INTO entitlements (user_id, tier, expires_at, source) VALUES ('cccccccc-0000-4000-8000-000000000007', 'pro', '2026-11-14 21:30:00+00', 'manual');
SELECT reserve_ai_use('cccccccc-0000-4000-8000-000000000007', 'new_plan', 'lapsed-' || h, :'T0'::timestamptz + h * INTERVAL '1 hour') FROM generate_series(1, 5) AS h;
SELECT t_check((SELECT count(*) FROM ai_usage WHERE user_id = 'cccccccc-0000-4000-8000-000000000007') = 5, 'U18b a Pro user made 5 plans');
SELECT t_check((reserve_ai_use('cccccccc-0000-4000-8000-000000000007', 'new_plan', 'lapsed-6', '2026-11-16 00:00:00+00')->>'resets_at')::timestamptz = '2026-11-21 01:30:00+00', 'U18c after Pro lapses, resets_at is when the count drops below the free limit');

-- ---------------------------------------------------------------- time zone hopping
-- A user who moves to the zone whose midnight just passed gets a new local day. However they hop,
-- no more than twice the daily limit fits in any 24 hours.
INSERT INTO auth.users (id, email) VALUES ('cccccccc-0000-4000-8000-000000000006', 'hop@example.com');
INSERT INTO profiles (id, age_range, weight_kg, goal, fitness_level, minutes_per_day) VALUES ('cccccccc-0000-4000-8000-000000000006', '18-24', 60, 'g', 1, 10);
DO $$
DECLARE
  r jsonb;
  ok int := 0;
  zones text[] := ARRAY['UTC', 'Etc/GMT+1', 'Etc/GMT+2', 'Etc/GMT+3', 'Etc/GMT+4', 'Etc/GMT+5', 'Etc/GMT+6', 'Etc/GMT+7', 'Etc/GMT+8', 'Etc/GMT+9', 'Etc/GMT+10', 'Etc/GMT+11'];
BEGIN
  FOR h IN 0..11 LOOP
    -- At 00:00:01 UTC + h hours it is just past midnight in Etc/GMT+h.
    UPDATE profiles SET timezone = zones[h + 1] WHERE id = 'cccccccc-0000-4000-8000-000000000006';
    FOR i IN 1..10 LOOP
      r := reserve_ai_use('cccccccc-0000-4000-8000-000000000006', 'chat_message', 'hop-' || h || '-' || i, '2026-11-14 00:00:01+00'::timestamptz + h * INTERVAL '1 hour');
      IF (r->>'allowed')::boolean THEN ok := ok + 1; END IF;
    END LOOP;
  END LOOP;
  IF ok <> 20 THEN RAISE EXCEPTION 'FAIL: time zone hopping allowed % messages in 12 hours, expected 20', ok; END IF;
  RAISE NOTICE 'ok: U18d hopping time zones gives at most twice the daily limit in 24 hours';
END $$;
SELECT t_check((reserve_ai_use('cccccccc-0000-4000-8000-000000000006', 'chat_message', 'hop-late', '2026-11-14 12:00:00+00')->>'resets_at')::timestamptz = '2026-11-15 00:00:01+00', 'U18e the 24-hour cap says when its oldest message leaves the window');

-- ---------------------------------------------------------------- bad input
SELECT t_expect_error(format($q$SELECT reserve_ai_use(%L, 'image', 'x', now())$q$, :'A'), '22023', 'U19 an unknown action is rejected');
SELECT t_expect_error($q$SELECT reserve_ai_use('dddddddd-0000-4000-8000-000000000009', 'chat_message', 'x', now())$q$, 'P0002', 'U20 a user without a profile is rejected');
SELECT t_expect_error(format($q$SELECT reserve_ai_use(%L, 'chat_message', '', now())$q$, :'A'), '22023', 'U21 an empty request id is rejected');

-- ---------------------------------------------------------------- what a signed-in user can do
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'A', false);
SELECT t_check((SELECT count(*) FROM ai_usage) > 0 AND (SELECT count(*) FROM ai_usage WHERE user_id = :'B'::uuid) = 0, 'U22 a user sees only their own usage');
SELECT t_check((SELECT count(*) FROM entitlements) = 0, 'U23 a user does not see another user''s entitlement');
SELECT t_expect_error(format($q$INSERT INTO entitlements (user_id, tier, expires_at, source) VALUES (%L, 'pro', '2099-01-01', 'manual')$q$, :'A'), '42501', 'U24 a user cannot make themselves Pro');
SELECT t_expect_error(format($q$DELETE FROM ai_usage WHERE user_id = %L$q$, :'A'), '42501', 'U25 a user cannot delete their usage');
SELECT t_expect_error(format($q$UPDATE ai_usage SET status = 'released' WHERE user_id = %L$q$, :'A'), '42501', 'U26 a user cannot release their usage');
SELECT t_expect_error(format($q$INSERT INTO ai_usage (user_id, action, request_id, status) VALUES (%L, 'chat_message', 'x', 'released')$q$, :'A'), '42501', 'U27 a user cannot write usage rows');
SELECT t_expect_error(format($q$SELECT reserve_ai_use(%L, 'chat_message', 'self', now())$q$, :'A'), '42501', 'U28 a user cannot call reserve_ai_use');
SELECT t_expect_error(format($q$SELECT finish_ai_use(%L, false)$q$, current_setting('t.first')), '42501', 'U29 a user cannot call finish_ai_use');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'B', false);
SELECT t_check((SELECT count(*) FROM entitlements) = 1, 'U30 a user can read their own entitlement');
RESET ROLE;

-- ---------------------------------------------------------------- account deletion
INSERT INTO auth.users (id, email) VALUES ('cccccccc-0000-4000-8000-000000000005', 'temp5@example.com');
INSERT INTO profiles (id, age_range, weight_kg, goal, fitness_level, minutes_per_day) VALUES ('cccccccc-0000-4000-8000-000000000005', '18-24', 60, 'g', 1, 10);
INSERT INTO entitlements (user_id, tier, expires_at, source) VALUES ('cccccccc-0000-4000-8000-000000000005', 'pro', '2099-01-01', 'manual');
SELECT reserve_ai_use('cccccccc-0000-4000-8000-000000000005', 'chat_message', 'bye', now());
DELETE FROM auth.users WHERE id = 'cccccccc-0000-4000-8000-000000000005';
SELECT t_check(
  (SELECT count(*) FROM ai_usage WHERE user_id = 'cccccccc-0000-4000-8000-000000000005') = 0
  AND (SELECT count(*) FROM entitlements WHERE user_id = 'cccccccc-0000-4000-8000-000000000005') = 0,
  'U31 deleting the account removes its usage and entitlement');

SELECT 'ALL USAGE CHECKS PASSED' AS result;
