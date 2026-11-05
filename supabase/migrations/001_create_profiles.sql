-- Requirements 7.1, 7.7, 8.1, 8.2, 8.3, 8.4, 8.10
-- Profiles: one row per auth user, holding fitness data used for plan generation.

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  age_range TEXT NOT NULL,
  weight_kg INTEGER NOT NULL CHECK (weight_kg > 0 AND weight_kg < 500),
  goal TEXT NOT NULL,
  fitness_level INTEGER NOT NULL CHECK (fitness_level IN (1, 2, 3)),
  injuries TEXT[] NOT NULL DEFAULT '{}',
  minutes_per_day INTEGER NOT NULL CHECK (minutes_per_day > 0 AND minutes_per_day <= 120),
  language TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Keep updated_at current on every update (Requirement 7.7).
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security: a user sees and changes only their own profile.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read the profile whose id matches their auth uid.
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can create only the profile row for their own auth uid.
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Users can update only their own profile row.
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);
