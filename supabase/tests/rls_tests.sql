\set ON_ERROR_STOP on
-- Helpers (created as superuser; run with the caller's privileges).
CREATE FUNCTION t_check(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT ok THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
  RAISE NOTICE 'ok: %', label;
END $$;

CREATE FUNCTION t_expect_error(sql_text text, expected_state text, label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE st text;
BEGIN
  BEGIN
    EXECUTE sql_text;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS st = RETURNED_SQLSTATE;
    IF st = expected_state THEN RAISE NOTICE 'ok: %', label; RETURN; END IF;
    RAISE EXCEPTION 'FAIL (sqlstate % expected %): %', st, expected_state, label;
  END;
  RAISE EXCEPTION 'FAIL (no error): %', label;
END $$;

\set A 'aaaaaaaa-0000-4000-8000-000000000001'
\set B 'bbbbbbbb-0000-4000-8000-000000000002'

-- ---------------------------------------------------------------- RLS: profiles / plans / logs / messages
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'A', false);
SELECT t_check((SELECT count(*) FROM profiles) = 1 AND (SELECT id FROM profiles) = :'A'::uuid, 'R1 user A sees only own profile');
SELECT t_check((SELECT count(*) FROM plans WHERE user_id = :'B'::uuid) = 0, 'R2 user A cannot read B plans');
SELECT t_check((SELECT count(*) FROM plans) = 1, 'R3 user A sees exactly own plan');
SELECT t_check((SELECT count(*) FROM workout_logs WHERE user_id = :'B'::uuid) = 0, 'R4 user A cannot read B logs');
SELECT t_check((SELECT count(*) FROM workout_logs) = 2, 'R5 user A sees exactly own 2 logs');
SELECT t_check((SELECT count(*) FROM assistant_messages) = 0, 'R6 user A sees no messages (none seeded)');
SELECT t_expect_error(format($q$INSERT INTO plans (user_id, schema_version, plan_json, provider) VALUES (%L, '1.0.0', '{}', 'x')$q$, :'B'), '42501', 'R7 user A cannot insert plan for B');
SELECT t_expect_error(format($q$INSERT INTO workout_logs (user_id, day_number, exercises_completed, duration_minutes) VALUES (%L, 1, '[]', 5)$q$, :'B'), '42501', 'R8 user A cannot insert log for B');
SELECT t_expect_error(format($q$INSERT INTO assistant_messages (user_id, role, content) VALUES (%L, 'user', 'hi')$q$, :'B'), '42501', 'R9 user A cannot insert message for B');
SELECT t_expect_error(format($q$INSERT INTO profiles (id, age_range, weight_kg, goal, fitness_level, minutes_per_day) VALUES (%L, '18-24', 60, 'move_more', 1, 10)$q$, :'B'), '42501', 'R10 user A cannot insert profile for B');
INSERT INTO plans (user_id, schema_version, plan_json, provider) VALUES (:'A', '1.0.0', '{"days":[]}', 'test');
SELECT t_check((SELECT count(*) FROM plans) = 2, 'R11 user A can insert own plan');
INSERT INTO assistant_messages (user_id, role, content) VALUES (:'A', 'user', 'hello');
SELECT t_check((SELECT count(*) FROM assistant_messages) = 1, 'R12 user A can insert own message');
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'B', false);
SELECT t_check((SELECT count(*) FROM assistant_messages) = 0, 'R13 user B cannot read A messages');
UPDATE profiles SET goal = 'hijacked' WHERE id = :'A';
RESET ROLE;
SELECT t_check((SELECT goal FROM profiles WHERE id = :'A') = 'move_more', 'R14 user B cannot update A profile (row untouched)');

-- ---------------------------------------------------------------- anon
-- Clear the JWT claim: a real anon request has no user id.
SELECT set_config('request.jwt.claim.sub', '', false);
SET ROLE anon;
SELECT t_check((SELECT count(*) FROM profiles) = 0 AND (SELECT count(*) FROM plans) = 0, 'R15 anon sees no profiles or plans');
RESET ROLE;

-- ---------------------------------------------------------------- updated_at trigger (separate statements = separate txns)
SELECT set_config('t.before', (SELECT updated_at::text FROM profiles WHERE id = :'A'), false);
SELECT pg_sleep(0.05);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'A', false);
UPDATE profiles SET minutes_per_day = 20 WHERE id = :'A';
RESET ROLE;
SELECT t_check((SELECT updated_at FROM profiles WHERE id = :'A') > current_setting('t.before')::timestamptz, 'R16 updated_at advances on profile update');
SELECT t_check((SELECT minutes_per_day FROM profiles WHERE id = :'A') = 20, 'R17 own profile update applied');

-- ---------------------------------------------------------------- CHECK constraints (as superuser)
SELECT t_expect_error(format($q$INSERT INTO profiles (id, age_range, weight_kg, goal, fitness_level, minutes_per_day) VALUES (%L, '18-24', 0, 'g', 1, 10)$q$, 'cccccccc-0000-4000-8000-000000000003'), '23514', 'C1 weight_kg must be > 0');
SELECT t_expect_error(format($q$INSERT INTO profiles (id, age_range, weight_kg, goal, fitness_level, minutes_per_day) VALUES (%L, '18-24', 60, 'g', 4, 10)$q$, 'cccccccc-0000-4000-8000-000000000003'), '23514', 'C2 fitness_level must be 1-3');
SELECT t_expect_error(format($q$INSERT INTO profiles (id, age_range, weight_kg, goal, fitness_level, minutes_per_day) VALUES (%L, '18-24', 60, 'g', 1, 121)$q$, 'cccccccc-0000-4000-8000-000000000003'), '23514', 'C3 minutes_per_day must be <= 120');
SELECT t_expect_error(format($q$INSERT INTO workout_logs (user_id, day_number, exercises_completed, duration_minutes, rating) VALUES (%L, 1, '[]', 5, 6)$q$, :'A'), '23514', 'C4 rating must be 1-5');
SELECT t_expect_error(format($q$INSERT INTO workout_logs (user_id, day_number, exercises_completed, duration_minutes) VALUES (%L, 0, '[]', 5)$q$, :'A'), '23514', 'C5 day_number must be > 0');
SELECT t_expect_error(format($q$INSERT INTO assistant_messages (user_id, role, content) VALUES (%L, 'system', 'x')$q$, :'A'), '23514', 'C6 role must be user or assistant');

-- ---------------------------------------------------------------- foreign keys
SELECT t_expect_error(format($q$INSERT INTO plans (user_id, schema_version, plan_json, provider) VALUES (%L, '1.0.0', '{}', 'x')$q$, 'dddddddd-0000-4000-8000-000000000004'), '23503', 'F1 plan requires existing profile');

-- ON DELETE SET NULL: deleting a plan keeps its logs.
INSERT INTO plans (id, user_id, schema_version, plan_json, provider) VALUES ('eeeeeeee-0000-4000-8000-000000000005', :'A', '1.0.0', '{}', 'test');
INSERT INTO workout_logs (user_id, plan_id, day_number, exercises_completed, duration_minutes) VALUES (:'A', 'eeeeeeee-0000-4000-8000-000000000005', 1, '[]', 5);
DELETE FROM plans WHERE id = 'eeeeeeee-0000-4000-8000-000000000005';
SELECT t_check((SELECT count(*) FROM workout_logs WHERE plan_id IS NULL AND user_id = :'A') = 1, 'F2 deleting a plan nulls log.plan_id and keeps the log');

-- ON DELETE CASCADE: deleting an auth user removes all of their data.
INSERT INTO auth.users (id, email) VALUES ('cccccccc-0000-4000-8000-000000000003', 'temp@example.com');
INSERT INTO profiles (id, age_range, weight_kg, goal, fitness_level, minutes_per_day) VALUES ('cccccccc-0000-4000-8000-000000000003', '18-24', 60, 'g', 1, 10);
INSERT INTO plans (user_id, schema_version, plan_json, provider) VALUES ('cccccccc-0000-4000-8000-000000000003', '1.0.0', '{}', 'x');
INSERT INTO workout_logs (user_id, day_number, exercises_completed, duration_minutes) VALUES ('cccccccc-0000-4000-8000-000000000003', 1, '[]', 5);
INSERT INTO assistant_messages (user_id, role, content) VALUES ('cccccccc-0000-4000-8000-000000000003', 'user', 'x');
DELETE FROM auth.users WHERE id = 'cccccccc-0000-4000-8000-000000000003';
SELECT t_check(
  (SELECT count(*) FROM profiles WHERE id = 'cccccccc-0000-4000-8000-000000000003') = 0
  AND (SELECT count(*) FROM plans WHERE user_id = 'cccccccc-0000-4000-8000-000000000003') = 0
  AND (SELECT count(*) FROM workout_logs WHERE user_id = 'cccccccc-0000-4000-8000-000000000003') = 0
  AND (SELECT count(*) FROM assistant_messages WHERE user_id = 'cccccccc-0000-4000-8000-000000000003') = 0,
  'F3 deleting auth user cascades to profile, plans, logs, messages');

-- ---------------------------------------------------------------- storage bucket
SELECT t_check((SELECT public FROM storage.buckets WHERE id = 'exercise-media') = true, 'S1 exercise-media bucket is public');
INSERT INTO storage.buckets (id, name, public) VALUES ('private-test', 'private-test', false);
INSERT INTO storage.objects (bucket_id, name) VALUES ('exercise-media', 'videos/squat.mp4'), ('private-test', 'secret.txt');
SET ROLE anon;
SELECT t_check((SELECT count(*) FROM storage.objects WHERE bucket_id = 'exercise-media') = 1, 'S2 anon can read exercise-media objects');
SELECT t_check((SELECT count(*) FROM storage.objects WHERE bucket_id = 'private-test') = 0, 'S3 anon cannot read other buckets');
SELECT t_expect_error($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('exercise-media', 'videos/evil.mp4')$q$, '42501', 'S4 anon cannot write exercise-media');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'A', false);
SELECT t_expect_error($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('exercise-media', 'videos/evil2.mp4')$q$, '42501', 'S5 authenticated user cannot write exercise-media (no policy)');
RESET ROLE;

-- ---------------------------------------------------------------- done
SELECT 'ALL CHECKS PASSED' AS result;
