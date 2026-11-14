-- RevenueCat webhook: one function records an event and updates the entitlement in one
-- transaction. See docs/revenuecat-webhook-spec.md.

-- ---------------------------------------------------------------- processed events
-- One row per RevenueCat event id that has been handled. It stores no user id. Only the service
-- (secret key) writes it: RLS is on with no policy, and the privileges are removed as well.
CREATE TABLE revenuecat_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  environment TEXT NOT NULL,
  received_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE revenuecat_events ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON revenuecat_events FROM anon, authenticated;

-- The time of the last webhook event applied to this user's row (NULL for a manual row). Events
-- older than it are stale and ignored.
ALTER TABLE entitlements ADD COLUMN event_at TIMESTAMPTZ NULL;

-- ---------------------------------------------------------------- apply one event
-- The caller (the assistant service) has already verified the signature and mapped the RevenueCat
-- event type to an action:
--   'set_expiry'  grant or extend Pro: expires_at = p_expires_at (overwrites a manual row too)
--   'revoke'      expires_at = LEAST(expires_at, p_event_ts). With no row yet, an already-expired row is
--                 written, so the event time is kept: an older purchase that arrives later is then
--                 stale instead of granting Pro for a period that was refunded.
--   'none'        record the event only
--
-- Returns:
--   'unknown_user'  no profile for p_user_id. NOTHING is written, not even the event row: the spec
--                   says an unknown user writes nothing, and the webhook still answers 200, so
--                   RevenueCat does not retry. A repeat of such an event is simply unknown_user again.
--   'duplicate'     the event id was handled before; nothing changes.
--   'stale'         the event is older than entitlements.event_at; nothing changes. The event id is
--                   still recorded, so a retry of it is a duplicate.
--   'applied'       the action ran (including 'none').
--
-- The profile row is locked for the transaction, so two events for one user run one after another
-- and the stale check sees the earlier event. A failure anywhere rolls back the event row too, so
-- RevenueCat's retry is not mistaken for a duplicate.
--
-- SECURITY INVOKER (the default) is intended: only service_role may execute it, and that role
-- (the assistant's secret key) has the table privileges it needs. anon and authenticated cannot.
CREATE OR REPLACE FUNCTION apply_revenuecat_event(
  p_event_id TEXT,
  p_event_type TEXT,
  p_environment TEXT,
  p_user_id UUID,
  p_event_ts TIMESTAMPTZ,
  p_action TEXT,
  p_expires_at TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_inserted INT;
  v_event_at TIMESTAMPTZ;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('set_expiry', 'revoke', 'none') THEN
    RAISE EXCEPTION 'unknown RevenueCat action: %', p_action USING ERRCODE = '22023';
  END IF;
  IF p_action = 'set_expiry' AND p_expires_at IS NULL THEN
    RAISE EXCEPTION 'set_expiry needs an expiry time' USING ERRCODE = '22023';
  END IF;
  IF p_event_id IS NULL OR p_event_type IS NULL OR p_environment IS NULL OR p_event_ts IS NULL THEN
    RAISE EXCEPTION 'event id, type, environment and time are required' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM profiles WHERE id = p_user_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RETURN 'unknown_user';
  END IF;

  INSERT INTO revenuecat_events (event_id, event_type, environment)
  VALUES (p_event_id, p_event_type, p_environment)
  ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RETURN 'duplicate';
  END IF;

  SELECT event_at INTO v_event_at FROM entitlements WHERE user_id = p_user_id;
  IF v_event_at IS NOT NULL AND p_event_ts < v_event_at THEN
    RETURN 'stale';
  END IF;

  IF p_action = 'set_expiry' THEN
    INSERT INTO entitlements (user_id, tier, expires_at, source, event_at)
    VALUES (p_user_id, 'pro', p_expires_at, 'revenuecat', p_event_ts)
    ON CONFLICT (user_id) DO UPDATE
      SET tier = 'pro', expires_at = EXCLUDED.expires_at, source = 'revenuecat', event_at = EXCLUDED.event_at;
  ELSIF p_action = 'revoke' THEN
    INSERT INTO entitlements (user_id, tier, expires_at, source, event_at)
    VALUES (p_user_id, 'pro', p_event_ts, 'revenuecat', p_event_ts)
    ON CONFLICT (user_id) DO UPDATE
      SET expires_at = LEAST(entitlements.expires_at, EXCLUDED.expires_at),
          source = 'revenuecat',
          event_at = EXCLUDED.event_at;
  END IF;

  RETURN 'applied';
END;
$$;

REVOKE EXECUTE ON FUNCTION apply_revenuecat_event(TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION apply_revenuecat_event(TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ, TEXT, TIMESTAMPTZ) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_revenuecat_event(TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ, TEXT, TIMESTAMPTZ) TO service_role;
