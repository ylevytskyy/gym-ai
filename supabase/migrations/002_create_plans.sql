-- Requirements 7.2, 7.5, 8.1, 8.5, 8.6, 8.10
-- Plans: generated workout plans, stored as validated JSON.

CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  schema_version TEXT NOT NULL,
  plan_json JSONB NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plans_user_id ON plans(user_id);
CREATE INDEX idx_plans_created_at ON plans(created_at DESC);

-- Row Level Security: a user sees and creates only their own plans.
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

-- Users can read plans whose user_id matches their auth uid.
CREATE POLICY "Users can read own plans"
  ON plans FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create plans only for their own auth uid.
CREATE POLICY "Users can insert own plans"
  ON plans FOR INSERT
  WITH CHECK (auth.uid() = user_id);
