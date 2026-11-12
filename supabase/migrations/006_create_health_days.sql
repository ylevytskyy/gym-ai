-- Health days: one row per user per local calendar day, holding that day's totals from the
-- phone's health store (HealthKit or Health Connect). This is the only health data the server
-- holds; raw samples stay on the phone (docs/adr/0001-health-days-on-server.md).
-- The columns and their ranges mirror schemas/health-day.schema.json. Decimal measurements are
-- plain NUMERIC so a value is checked as sent, not after rounding. A NULL measurement means the
-- health store had no data for it, never zero.

-- The app writes this table directly (under Row Level Security), so these checks are the only
-- thing between a modified client and the plan generator's prompt. They follow the schema's
-- rules for external_workouts: at most 50 items, each an object with a known type, whole minutes
-- from 1 to 1440, an optional energy_kcal from 0 to 20000, and nothing else.
CREATE FUNCTION health_external_workouts_valid(items JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  item JSONB;
  minutes NUMERIC;
BEGIN
  IF items IS NULL OR jsonb_typeof(items) <> 'array' OR jsonb_array_length(items) > 50 THEN
    RETURN FALSE;
  END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(items) LOOP
    IF jsonb_typeof(item) <> 'object' THEN RETURN FALSE; END IF;
    IF (item - 'type' - 'minutes' - 'energy_kcal') <> '{}'::jsonb THEN RETURN FALSE; END IF;
    IF jsonb_typeof(item -> 'type') IS DISTINCT FROM 'string'
       OR (item ->> 'type') NOT IN ('walking', 'running', 'cycling', 'swimming', 'strength', 'hiit', 'yoga', 'sport', 'other') THEN
      RETURN FALSE;
    END IF;
    IF jsonb_typeof(item -> 'minutes') IS DISTINCT FROM 'number' THEN RETURN FALSE; END IF;
    minutes := (item ->> 'minutes')::numeric;
    IF minutes < 1 OR minutes > 1440 OR minutes <> trunc(minutes) THEN RETURN FALSE; END IF;
    IF item ? 'energy_kcal' THEN
      IF jsonb_typeof(item -> 'energy_kcal') <> 'number' THEN RETURN FALSE; END IF;
      IF (item ->> 'energy_kcal')::numeric < 0 OR (item ->> 'energy_kcal')::numeric > 20000 THEN RETURN FALSE; END IF;
    END IF;
  END LOOP;
  RETURN TRUE;
END $$;

CREATE TABLE health_days (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  tz TEXT NOT NULL CHECK (char_length(tz) <= 64 AND tz ~ '^[A-Za-z0-9_+-]+(/[A-Za-z0-9_+-]+)*$'),
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  steps INTEGER CHECK (steps >= 0 AND steps <= 200000),
  active_energy_kcal NUMERIC CHECK (active_energy_kcal >= 0 AND active_energy_kcal <= 20000),
  resting_hr_bpm NUMERIC CHECK (resting_hr_bpm >= 20 AND resting_hr_bpm <= 250),
  sleep_minutes INTEGER CHECK (sleep_minutes >= 0 AND sleep_minutes <= 1440),
  weight_kg NUMERIC CHECK (weight_kg > 0 AND weight_kg < 500),
  external_workouts JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (health_external_workouts_valid(external_workouts)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, day)
);

-- Keep updated_at current on every update, including the update half of an upsert.
CREATE TRIGGER update_health_days_updated_at
  BEFORE UPDATE ON health_days
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security: a user reads, writes and deletes only their own health days.
ALTER TABLE health_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own health days"
  ON health_days FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own health days"
  ON health_days FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- WITH CHECK stops a user from handing a row to someone else.
CREATE POLICY "Users can update own health days"
  ON health_days FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- "Delete my health data" in the app deletes through this policy.
CREATE POLICY "Users can delete own health days"
  ON health_days FOR DELETE
  USING (auth.uid() = user_id);
