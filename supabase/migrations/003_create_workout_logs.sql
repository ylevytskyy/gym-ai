-- Requirements 7.3, 7.5, 8.1, 8.7, 8.8, 8.10
-- Workout logs: completed sessions, optionally linked to the plan they came from.

CREATE TABLE workout_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES plans(id) ON DELETE SET NULL,
  day_number INTEGER NOT NULL CHECK (day_number > 0),
  exercises_completed JSONB NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  notes TEXT,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workout_logs_user_id ON workout_logs(user_id);
CREATE INDEX idx_workout_logs_completed_at ON workout_logs(completed_at DESC);

-- Row Level Security: a user sees and creates only their own logs.
ALTER TABLE workout_logs ENABLE ROW LEVEL SECURITY;

-- Users can read logs whose user_id matches their auth uid.
CREATE POLICY "Users can read own logs"
  ON workout_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create logs only for their own auth uid.
CREATE POLICY "Users can insert own logs"
  ON workout_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);
