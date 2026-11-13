-- A finished workout is also written to the phone's health store. health_record_id is the id
-- the health store gave that record, so the app can tell the workout was already written, never
-- write it twice, and delete it there when the log is deleted here.

ALTER TABLE workout_logs ADD COLUMN health_record_id TEXT
  CHECK (health_record_id IS NULL OR char_length(health_record_id) BETWEEN 1 AND 128);

-- One health-store record backs at most one log of a user. Record ids are only unique inside
-- one health store, so two users may hold the same id.
CREATE UNIQUE INDEX idx_workout_logs_health_record
  ON workout_logs(user_id, health_record_id)
  WHERE health_record_id IS NOT NULL;

-- The id is attached after the log exists (the health store may be unavailable or the write may
-- be retried later), so a user needs to update their own logs.
CREATE POLICY "Users can update own logs"
  ON workout_logs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Deleting a log was not possible before; the app needs it to remove a workout everywhere.
CREATE POLICY "Users can delete own logs"
  ON workout_logs FOR DELETE
  USING (auth.uid() = user_id);
