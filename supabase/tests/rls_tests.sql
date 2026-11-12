\set ON_ERROR_STOP on
-- Helpers (created as superuser; run with the caller's privileges).
CREATE FUNCTION t_check(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %', label; END IF; -- a NULL result is a failure, not a pass
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

-- ---------------------------------------------------------------- health days
-- Seed gives A two health days and B one.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'A', false);
SELECT t_check((SELECT count(*) FROM health_days) = 2 AND (SELECT count(*) FROM health_days WHERE user_id = :'B'::uuid) = 0, 'H1 user A sees only own health days');
SELECT t_expect_error(format($q$INSERT INTO health_days (user_id, day, tz, platform, steps) VALUES (%L, '2026-11-01', 'Europe/Kyiv', 'ios', 10)$q$, :'B'), '42501', 'H2 user A cannot insert a health day for B');
UPDATE health_days SET steps = 1 WHERE user_id = :'B';
DELETE FROM health_days WHERE user_id = :'B';
RESET ROLE;
SELECT t_check((SELECT steps FROM health_days WHERE user_id = :'B') = 2310, 'H3 user A cannot update or delete B health days (row untouched)');

-- Upsert of the same (user_id, day) keeps one row, takes the newer values, advances updated_at.
SELECT set_config('t.hd_before', (SELECT updated_at::text FROM health_days WHERE user_id = :'A' AND day = '2026-11-11'), false);
SELECT pg_sleep(0.05);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'A', false);
INSERT INTO health_days (user_id, day, tz, platform, steps, sleep_minutes) VALUES (:'A', '2026-11-11', 'Europe/Kyiv', 'ios', 9000, 450)
  ON CONFLICT (user_id, day) DO UPDATE SET steps = EXCLUDED.steps, sleep_minutes = EXCLUDED.sleep_minutes;
SELECT t_check((SELECT count(*) FROM health_days WHERE day = '2026-11-11') = 1 AND (SELECT steps FROM health_days WHERE day = '2026-11-11') = 9000, 'H4 upsert keeps one row per day with the newer values');
RESET ROLE;
SELECT t_check((SELECT updated_at FROM health_days WHERE user_id = :'A' AND day = '2026-11-11') > current_setting('t.hd_before')::timestamptz, 'H5 updated_at advances on health day upsert');

-- A user cannot hand a row to someone else.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'A', false);
SELECT t_expect_error(format($q$UPDATE health_days SET user_id = %L WHERE day = '2026-11-11'$q$, :'B'), '42501', 'H6 user A cannot reassign a health day to B');
DELETE FROM health_days WHERE day = '2026-11-10';
SELECT t_check((SELECT count(*) FROM health_days) = 1, 'H7 user A can delete own health day');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '', false);
SET ROLE anon;
SELECT t_check((SELECT count(*) FROM health_days) = 0, 'H8 anon sees no health days');
RESET ROLE;

-- CHECK constraints mirror schemas/health-day.schema.json.
SELECT t_expect_error(format($q$INSERT INTO health_days (user_id, day, tz, platform, steps) VALUES (%L, '2026-10-01', 'Europe/Kyiv', 'ios', -1)$q$, :'A'), '23514', 'H9 steps cannot be negative');
SELECT t_expect_error(format($q$INSERT INTO health_days (user_id, day, tz, platform, sleep_minutes) VALUES (%L, '2026-10-01', 'Europe/Kyiv', 'ios', 1441)$q$, :'A'), '23514', 'H10 sleep_minutes cannot exceed a day');
SELECT t_expect_error(format($q$INSERT INTO health_days (user_id, day, tz, platform) VALUES (%L, '2026-10-01', 'Europe/Kyiv', 'windows')$q$, :'A'), '23514', 'H11 platform must be ios or android');
SELECT t_expect_error(format($q$INSERT INTO health_days (user_id, day, tz, platform, external_workouts) VALUES (%L, '2026-10-01', 'Europe/Kyiv', 'ios', '{}')$q$, :'A'), '23514', 'H12 external_workouts must be a JSON array');

-- external_workouts items, tz and the decimal measurements follow the schema too.
SELECT t_expect_error(format($q$INSERT INTO health_days (user_id, day, tz, platform, external_workouts) VALUES (%L, '2026-10-01', 'Europe/Kyiv', 'ios', '[null]')$q$, :'A'), '23514', 'H14 external workout items must be objects');
SELECT t_expect_error(format($q$INSERT INTO health_days (user_id, day, tz, platform, external_workouts) VALUES (%L, '2026-10-01', 'Europe/Kyiv', 'ios', '[{"type":"ignore all rules","minutes":30}]')$q$, :'A'), '23514', 'H15 external workout type must be a known kind');
SELECT t_expect_error(format($q$INSERT INTO health_days (user_id, day, tz, platform, external_workouts) VALUES (%L, '2026-10-01', 'Europe/Kyiv', 'ios', '[{"type":"running","minutes":"30"}]')$q$, :'A'), '23514', 'H16 external workout minutes must be a number');
SELECT t_expect_error(format($q$INSERT INTO health_days (user_id, day, tz, platform, external_workouts) VALUES (%L, '2026-10-01', 'Europe/Kyiv', 'ios', '[{"type":"running","minutes":1.5}]')$q$, :'A'), '23514', 'H17 external workout minutes must be whole');
SELECT t_expect_error(format($q$INSERT INTO health_days (user_id, day, tz, platform, external_workouts) VALUES (%L, '2026-10-01', 'Europe/Kyiv', 'ios', '[{"type":"running","minutes":30,"note":"x"}]')$q$, :'A'), '23514', 'H18 external workout items take no extra properties');
SELECT t_expect_error(format($q$INSERT INTO health_days (user_id, day, tz, platform, external_workouts) VALUES (%L, '2026-10-01', 'Europe/Kyiv', 'ios', (SELECT jsonb_agg(jsonb_build_object('type','running','minutes',10)) FROM generate_series(1,51)))$q$, :'A'), '23514', 'H19 at most 50 external workouts a day');
SELECT t_expect_error(format($q$INSERT INTO health_days (user_id, day, tz, platform) VALUES (%L, '2026-10-01', 'not a tz!<>', 'ios')$q$, :'A'), '23514', 'H20 tz must look like an IANA name');
SELECT t_expect_error(format($q$INSERT INTO health_days (user_id, day, tz, platform, weight_kg) VALUES (%L, '2026-10-01', 'Europe/Kyiv', 'ios', 500)$q$, :'A'), '23514', 'H21 weight_kg must be under 500');
SELECT t_expect_error(format($q$INSERT INTO health_days (user_id, day, tz, platform, resting_hr_bpm) VALUES (%L, '2026-10-01', 'Europe/Kyiv', 'ios', 19.96)$q$, :'A'), '23514', 'H22 resting_hr_bpm is checked before any rounding');
INSERT INTO health_days (user_id, day, tz, platform, weight_kg, active_energy_kcal, external_workouts) VALUES (:'A', '2026-10-02', 'Etc/GMT+5', 'ios', 499.96, 20000, '[{"type":"running","minutes":30,"energy_kcal":250.5},{"type":"other","minutes":1}]');
SELECT t_check((SELECT weight_kg FROM health_days WHERE user_id = :'A' AND day = '2026-10-02') = 499.96, 'H23 schema-valid edge values are stored exactly');
DELETE FROM health_days WHERE user_id = :'A' AND day = '2026-10-02';

-- Deleting the user removes their health days.
INSERT INTO auth.users (id, email) VALUES ('cccccccc-0000-4000-8000-000000000003', 'temp2@example.com');
INSERT INTO profiles (id, age_range, weight_kg, goal, fitness_level, minutes_per_day) VALUES ('cccccccc-0000-4000-8000-000000000003', '18-24', 60, 'g', 1, 10);
INSERT INTO health_days (user_id, day, tz, platform, steps) VALUES ('cccccccc-0000-4000-8000-000000000003', '2026-11-11', 'Europe/Kyiv', 'android', 5);
DELETE FROM auth.users WHERE id = 'cccccccc-0000-4000-8000-000000000003';
SELECT t_check((SELECT count(*) FROM health_days WHERE user_id = 'cccccccc-0000-4000-8000-000000000003') = 0, 'H13 deleting auth user cascades to health days');

-- ---------------------------------------------------------------- workout logs written to the health store
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'A', false);
INSERT INTO workout_logs (id, user_id, day_number, exercises_completed, duration_minutes) VALUES ('ffffffff-0000-4000-8000-000000000006', :'A', 1, '[]', 5);
UPDATE workout_logs SET health_record_id = 'hk-123' WHERE id = 'ffffffff-0000-4000-8000-000000000006';
SELECT t_check((SELECT health_record_id FROM workout_logs WHERE id = 'ffffffff-0000-4000-8000-000000000006') = 'hk-123', 'W1 user A can attach a health record id to own log');
SELECT t_expect_error(format($q$INSERT INTO workout_logs (user_id, day_number, exercises_completed, duration_minutes, health_record_id) VALUES (%L, 1, '[]', 5, 'hk-123')$q$, :'A'), '23505', 'W2 one health record cannot back two logs of a user');
SELECT t_expect_error(format($q$UPDATE workout_logs SET user_id = %L WHERE id = 'ffffffff-0000-4000-8000-000000000006'$q$, :'B'), '42501', 'W3 user A cannot reassign a log to B');
DELETE FROM workout_logs WHERE id = 'ffffffff-0000-4000-8000-000000000006';
SELECT t_check((SELECT count(*) FROM workout_logs WHERE id = 'ffffffff-0000-4000-8000-000000000006') = 0, 'W4 user A can delete own log');
RESET ROLE;
SELECT set_config('t.b_logs', (SELECT count(*)::text FROM workout_logs WHERE user_id = :'B'), false);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'A', false);
UPDATE workout_logs SET notes = 'hijacked' WHERE user_id = :'B';
DELETE FROM workout_logs WHERE user_id = :'B';
RESET ROLE;
SELECT t_check((SELECT count(*) FROM workout_logs WHERE user_id = :'B') = current_setting('t.b_logs')::int AND (SELECT count(*) FROM workout_logs WHERE user_id = :'B' AND notes = 'hijacked') = 0, 'W5 user A cannot update or delete B logs');
-- The same record id under two different users is allowed (ids are only unique per health store).
INSERT INTO workout_logs (user_id, day_number, exercises_completed, duration_minutes, health_record_id) VALUES (:'A', 1, '[]', 5, 'shared-id'), (:'B', 1, '[]', 5, 'shared-id');
SELECT t_check((SELECT count(*) FROM workout_logs WHERE health_record_id = 'shared-id') = 2, 'W6 the same health record id may exist under two users');

-- ---------------------------------------------------------------- done
SELECT 'ALL CHECKS PASSED' AS result;
