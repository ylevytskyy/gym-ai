-- Requirement 7.6: test data for local development.
-- Two users: a beginner with no injuries, and an intermediate user with a knee injury.
-- Their plans only reference catalog exercises that are safe for them.
-- Run with `supabase db reset` (applies migrations, then this file).

-- Test users. Local Supabase accepts these inserts; the auth.users columns
-- beyond id and email are left to their defaults.
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'test-beginner@example.com'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'test-knee@example.com');

INSERT INTO profiles (id, age_range, weight_kg, goal, fitness_level, injuries, minutes_per_day, language) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', '25-34', 72, 'move_more', 1, '{}', 15, 'en'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '35-44', 88, 'build_strength', 2, '{knee_injury}', 25, 'en');

-- One sample plan per user.
INSERT INTO plans (id, user_id, schema_version, plan_json, provider, status) VALUES
  (
    'a1a1a1a1-0000-4000-8000-000000000001',
    'aaaaaaaa-0000-4000-8000-000000000001',
    '1.0.0',
    '{
      "schema_version": "1.0.0",
      "id": "a1a1a1a1-0000-4000-8000-000000000001",
      "created_at": "2026-01-10T09:00:00Z",
      "goal": "move_more",
      "days": [
        {
          "day": 1,
          "title": "Full body starter",
          "minutes": 12,
          "blocks": [
            { "type": "warm_up", "items": [ { "exercise_id": "neck-rolls", "sets": 1, "amount": 30 } ] },
            { "type": "main", "items": [
                { "exercise_id": "squat", "sets": 2, "amount": 10, "rest_seconds": 45 },
                { "exercise_id": "push-up", "sets": 2, "amount": 8, "rest_seconds": 45 }
            ] }
          ]
        }
      ],
      "notes": "Beginner starter plan."
    }'::jsonb,
    'seed',
    'active'
  ),
  (
    'b2b2b2b2-0000-4000-8000-000000000002',
    'bbbbbbbb-0000-4000-8000-000000000002',
    '1.0.0',
    '{
      "schema_version": "1.0.0",
      "id": "b2b2b2b2-0000-4000-8000-000000000002",
      "created_at": "2026-01-12T18:30:00Z",
      "goal": "build_strength",
      "days": [
        {
          "day": 1,
          "title": "Core and mobility, knee-safe",
          "minutes": 20,
          "blocks": [
            { "type": "warm_up", "items": [ { "exercise_id": "arm-circles", "sets": 1, "amount": 30 } ] },
            { "type": "main", "items": [
                { "exercise_id": "plank", "sets": 3, "amount": 30, "rest_seconds": 60 },
                { "exercise_id": "glute-bridge", "sets": 3, "amount": 12, "rest_seconds": 45 }
            ] }
          ]
        }
      ],
      "notes": "Knee-safe plan: no squats, lunges or jumping."
    }'::jsonb,
    'seed',
    'active'
  );

-- Two or three workout logs per user, linked to their plan.
INSERT INTO workout_logs (user_id, plan_id, day_number, exercises_completed, duration_minutes, rating, notes, completed_at) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000001', 1,
   '[{"exercise_id": "neck-rolls", "sets_done": 1}, {"exercise_id": "squat", "sets_done": 2}]', 12, 4, 'Felt easy.', '2026-01-11T07:45:00Z'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000001', 1,
   '[{"exercise_id": "squat", "sets_done": 2}, {"exercise_id": "push-up", "sets_done": 1}]', 10, 3, NULL, '2026-01-13T07:40:00Z'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'b2b2b2b2-0000-4000-8000-000000000002', 1,
   '[{"exercise_id": "plank", "sets_done": 3}, {"exercise_id": "glute-bridge", "sets_done": 3}]', 20, 5, 'Knee was fine.', '2026-01-13T19:00:00Z'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'b2b2b2b2-0000-4000-8000-000000000002', 1,
   '[{"exercise_id": "glute-bridge", "sets_done": 3}]', 8, 2, 'Short session.', '2026-01-15T19:10:00Z');

-- Health days: user A wears a watch (full data), user B has a phone only.
INSERT INTO health_days (user_id, day, tz, platform, steps, active_energy_kcal, resting_hr_bpm, sleep_minutes, weight_kg, external_workouts) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', '2026-11-10', 'Europe/Kyiv', 'ios', 6120, 380.5, 59, 432, 72.4, '[]'),
  ('aaaaaaaa-0000-4000-8000-000000000001', '2026-11-11', 'Europe/Kyiv', 'ios', 8421, 512.4, 58, 441, 72.3,
   '[{"type": "running", "minutes": 42, "energy_kcal": 430.5}]');
INSERT INTO health_days (user_id, day, tz, platform, steps, sleep_minutes) VALUES
  ('bbbbbbbb-0000-4000-8000-000000000002', '2026-11-11', 'America/New_York', 'android', 2310, 395);
