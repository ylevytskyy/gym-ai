-- Pro entitlement and AI usage limits. See docs/usage-limits-spec.md and docs/monetization.md.
-- The assistant service (secret key) reserves a use before every model call and finishes it
-- after; users can read their own rows but never write them.

-- ---------------------------------------------------------------- time zone for the daily limit
ALTER TABLE profiles ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC';

-- A CHECK cannot look up pg_timezone_names, so a trigger rejects names Postgres does not know.
CREATE OR REPLACE FUNCTION check_profile_timezone()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.timezone) THEN
    RAISE EXCEPTION 'unknown time zone: %', NEW.timezone USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_profiles_timezone
  BEFORE INSERT OR UPDATE OF timezone ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION check_profile_timezone();

-- ---------------------------------------------------------------- entitlements
-- One row per user who has (or had) Pro. Pro while expires_at is in the future.
CREATE TABLE entitlements (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('pro')),
  expires_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual', 'revenuecat')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER update_entitlements_updated_at
  BEFORE UPDATE ON entitlements
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own entitlement"
  ON entitlements FOR SELECT
  USING (auth.uid() = user_id);

-- No write policy; privileges are removed as well, so a missing policy is not the only guard.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON entitlements FROM anon, authenticated;

-- ---------------------------------------------------------------- AI usage
-- One row per counted AI action. Rows are never deleted by the service; a failed model call
-- marks its row 'released' so it does not count.
CREATE TABLE ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('chat_message', 'new_plan')),
  request_id TEXT NOT NULL CHECK (length(request_id) BETWEEN 1 AND 128),
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'used', 'released')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, request_id)
);

CREATE INDEX idx_ai_usage_user_action_created ON ai_usage(user_id, action, created_at);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own AI usage"
  ON ai_usage FOR SELECT
  USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ai_usage FROM anon, authenticated;

-- ---------------------------------------------------------------- reserve and finish
-- Checks the user's allowance for one action and, if there is room, records a 'reserved' use.
-- The profile row is locked for the transaction, so parallel requests for one user are counted
-- one after another.
--
-- Allowance: free 10 chat_message per local day, 2 new_plan per rolling 7 days;
-- Pro 150 chat_message per local day, 20 new_plan per rolling 30 days.
-- The local day follows profiles.timezone, which the user can change. So that changing it cannot
-- multiply the allowance, chat_message is also capped at twice the daily limit per rolling 24 hours.
--
-- A request id seen before and not released is a duplicate: it is refused (allowed false,
-- duplicate true), so a replayed request never runs the model twice. A request id whose earlier
-- use was released (the model call failed) is counted again.
--
-- p_now is for tests only; the service leaves it out.
-- Returns { allowed, duplicate, use_id, tier, limit, remaining, resets_at }.
CREATE OR REPLACE FUNCTION reserve_ai_use(
  p_user_id UUID,
  p_action TEXT,
  p_request_id TEXT,
  p_now TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_tz TEXT;
  v_tier TEXT;
  v_limit INT;
  v_period INTERVAL;
  v_since TIMESTAMPTZ;
  v_count INT;
  v_resets_at TIMESTAMPTZ;
  v_cap INT;
  v_count_24h INT;
  v_existing ai_usage%ROWTYPE;
  v_use_id UUID;
  v_allowed BOOLEAN;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('chat_message', 'new_plan') THEN
    RAISE EXCEPTION 'unknown AI action: %', p_action USING ERRCODE = '22023';
  END IF;
  IF p_request_id IS NULL OR length(p_request_id) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'request id must be 1 to 128 characters' USING ERRCODE = '22023';
  END IF;

  -- NO KEY UPDATE serializes reserves for one user without blocking inserts into tables that
  -- reference profiles.
  SELECT timezone INTO v_tz FROM profiles WHERE id = p_user_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no profile for user %', p_user_id USING ERRCODE = 'P0002';
  END IF;
  -- The time is read after the lock, not at the start of the transaction: a request that waited
  -- must see every use stored by the requests that went before it. Tests pass a fixed time.
  p_now := COALESCE(p_now, clock_timestamp());

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM entitlements WHERE user_id = p_user_id AND tier = 'pro' AND expires_at > p_now
  ) THEN 'pro' ELSE 'free' END INTO v_tier;

  IF p_action = 'chat_message' THEN
    v_limit := CASE v_tier WHEN 'pro' THEN 150 ELSE 10 END;
    -- The local day starts at local midnight (inclusive), as an instant.
    v_since := date_trunc('day', p_now AT TIME ZONE v_tz) AT TIME ZONE v_tz;
    SELECT count(*) INTO v_count FROM ai_usage
    WHERE user_id = p_user_id AND action = p_action AND status IN ('reserved', 'used')
      AND created_at >= v_since AND created_at <= p_now;
    v_period := INTERVAL '24 hours';
    v_cap := 2 * v_limit;
    SELECT count(*) INTO v_count_24h FROM ai_usage
    WHERE user_id = p_user_id AND action = p_action AND status IN ('reserved', 'used')
      AND created_at > p_now - v_period AND created_at <= p_now;
  ELSE
    v_limit := CASE v_tier WHEN 'pro' THEN 20 ELSE 2 END;
    v_period := CASE v_tier WHEN 'pro' THEN INTERVAL '30 days' ELSE INTERVAL '7 days' END;
    v_cap := v_limit;
    SELECT count(*) INTO v_count FROM ai_usage
    WHERE user_id = p_user_id AND action = p_action AND status IN ('reserved', 'used')
      AND created_at > p_now - v_period AND created_at <= p_now;
    v_count_24h := v_count;
  END IF;

  v_allowed := v_count < v_limit AND v_count_24h < v_cap;

  -- When the user may ask again: the latest of the limits that block them now. A rolling window
  -- has room again once enough of its oldest uses have left it: with n counted and a cap of c,
  -- when the (n - c + 1)-th oldest is one period old. With room left, it is local midnight for a
  -- coach message and the oldest plan leaving the window for a plan.
  IF v_count_24h >= v_cap OR p_action = 'new_plan' THEN
    SELECT created_at + v_period INTO v_resets_at FROM ai_usage
    WHERE user_id = p_user_id AND action = p_action AND status IN ('reserved', 'used')
      AND created_at > p_now - v_period AND created_at <= p_now
    ORDER BY created_at
    OFFSET GREATEST(v_count_24h - v_cap, 0)
    LIMIT 1;
  END IF;
  IF p_action = 'chat_message' AND (v_count >= v_limit OR v_count_24h < v_cap) THEN
    v_resets_at := GREATEST(v_resets_at, (date_trunc('day', p_now AT TIME ZONE v_tz) + INTERVAL '1 day') AT TIME ZONE v_tz);
  END IF;
  v_resets_at := COALESCE(v_resets_at, p_now + v_period);

  SELECT * INTO v_existing FROM ai_usage WHERE user_id = p_user_id AND request_id = p_request_id;
  IF FOUND AND v_existing.status <> 'released' THEN
    RETURN jsonb_build_object('allowed', false, 'duplicate', true, 'use_id', v_existing.id, 'tier', v_tier,
      'limit', v_limit, 'remaining', GREATEST(v_limit - v_count, 0), 'resets_at', v_resets_at);
  END IF;

  IF NOT v_allowed THEN
    RETURN jsonb_build_object('allowed', false, 'duplicate', false, 'use_id', NULL, 'tier', v_tier,
      'limit', v_limit, 'remaining', 0, 'resets_at', v_resets_at);
  END IF;

  IF FOUND THEN
    -- A retry of a request whose model call failed: count it again.
    UPDATE ai_usage SET status = 'reserved', action = p_action, created_at = p_now
    WHERE id = v_existing.id RETURNING id INTO v_use_id;
  ELSE
    INSERT INTO ai_usage (user_id, action, request_id, created_at)
    VALUES (p_user_id, p_action, p_request_id, p_now)
    RETURNING id INTO v_use_id;
  END IF;

  IF p_action = 'new_plan' AND v_count = 0 THEN
    v_resets_at := p_now + v_period;
  END IF;

  RETURN jsonb_build_object('allowed', true, 'duplicate', false, 'use_id', v_use_id, 'tier', v_tier,
    'limit', v_limit, 'remaining', LEAST(v_limit - v_count, v_cap - v_count_24h) - 1, 'resets_at', v_resets_at);
END;
$$;

-- Marks a reserved use as used (the model answered) or released (the call failed, so the user
-- is not charged). A use that is already finished is left as it is.
CREATE OR REPLACE FUNCTION finish_ai_use(p_use_id UUID, p_ok BOOLEAN)
RETURNS VOID
LANGUAGE sql
AS $$
  UPDATE ai_usage
  SET status = CASE WHEN p_ok THEN 'used' ELSE 'released' END
  WHERE id = p_use_id AND status = 'reserved';
$$;

-- Only the service (secret key) may run these.
REVOKE EXECUTE ON FUNCTION reserve_ai_use(UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION reserve_ai_use(UUID, TEXT, TEXT, TIMESTAMPTZ) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION reserve_ai_use(UUID, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
REVOKE EXECUTE ON FUNCTION finish_ai_use(UUID, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION finish_ai_use(UUID, BOOLEAN) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION finish_ai_use(UUID, BOOLEAN) TO service_role;
