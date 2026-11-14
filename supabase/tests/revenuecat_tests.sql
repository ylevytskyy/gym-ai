\set ON_ERROR_STOP on
-- RevenueCat webhook function and tables (migration 011). Runs after usage_tests.sql, which defines
-- t_check and t_expect_error. See docs/revenuecat-webhook-spec.md. Item numbers (DoD n) are the spec's.

\set P '11111111-0000-4000-8000-000000000001'
\set Q '11111111-0000-4000-8000-000000000002'
\set R '11111111-0000-4000-8000-000000000003'
\set S '11111111-0000-4000-8000-000000000004'
\set NOBODY '11111111-0000-4000-8000-0000000000ff'
-- All reserve_ai_use calls below happen at this moment.
\set NOW_T '2026-11-14 12:00:00+00'

INSERT INTO auth.users (id, email) SELECT id, id || '@example.com' FROM (VALUES (:'P'::uuid), (:'Q'::uuid), (:'R'::uuid), (:'S'::uuid)) AS v(id);
INSERT INTO profiles (id, age_range, weight_kg, goal, fitness_level, minutes_per_day)
SELECT id, '18-24', 60, 'g', 1, 10 FROM (VALUES (:'P'::uuid), (:'Q'::uuid), (:'R'::uuid), (:'S'::uuid)) AS v(id);

-- ---------------------------------------------------------------- purchase (DoD 3)
SELECT t_check(apply_revenuecat_event('evt-p1', 'INITIAL_PURCHASE', 'PRODUCTION', :'P', '2026-11-14 10:00:00+00', 'set_expiry', '2026-12-14 10:00:00+00') = 'applied', 'RC1 a purchase is applied');
SELECT t_check((SELECT source = 'revenuecat' AND expires_at = '2026-12-14 10:00:00+00' AND event_at = '2026-11-14 10:00:00+00' FROM entitlements WHERE user_id = :'P'), 'RC2 the entitlement has the store expiry, source revenuecat and the event time');
SELECT t_check(reserve_ai_use(:'P', 'chat_message', 'w-chat-1', :'NOW_T')->>'tier' = 'pro' AND (reserve_ai_use(:'P', 'chat_message', 'w-chat-2', :'NOW_T')->>'limit')::int = 150, 'RC3 (DoD 3) after a purchase the tier is pro with 150 coach messages');

-- ---------------------------------------------------------------- duplicate (DoD 2)
SELECT t_check(apply_revenuecat_event('evt-p1', 'INITIAL_PURCHASE', 'PRODUCTION', :'P', '2026-11-14 10:00:00+00', 'set_expiry', '2027-01-01 00:00:00+00') = 'duplicate', 'RC4 the same event id again is a duplicate');
SELECT t_check((SELECT expires_at FROM entitlements WHERE user_id = :'P') = '2026-12-14 10:00:00+00' AND (SELECT count(*) FROM revenuecat_events WHERE event_id = 'evt-p1') = 1, 'RC5 (DoD 2) a duplicate changes nothing and leaves one event row');

-- ---------------------------------------------------------------- plain cancel (DoD 4)
SELECT t_check(apply_revenuecat_event('evt-p2', 'CANCELLATION', 'PRODUCTION', :'P', '2026-11-14 11:00:00+00', 'none', NULL) = 'applied', 'RC6 a plain cancel is recorded');
SELECT t_check((SELECT expires_at FROM entitlements WHERE user_id = :'P') = '2026-12-14 10:00:00+00', 'RC7 (DoD 4) a plain cancel leaves expires_at unchanged');
SELECT t_check(reserve_ai_use(:'P', 'chat_message', 'w-chat-3', :'NOW_T')->>'tier' = 'pro', 'RC8 the user is still Pro after a plain cancel');

-- ---------------------------------------------------------------- renewal extends
SELECT t_check(apply_revenuecat_event('evt-p3', 'RENEWAL', 'PRODUCTION', :'P', '2026-11-14 11:30:00+00', 'set_expiry', '2027-01-14 10:00:00+00') = 'applied', 'RC9 a renewal is applied');
SELECT t_check((SELECT expires_at FROM entitlements WHERE user_id = :'P') = '2027-01-14 10:00:00+00', 'RC9b a renewal moves expires_at to the new period end');

-- ---------------------------------------------------------------- stale (DoD 7)
SELECT t_check(apply_revenuecat_event('evt-p4', 'EXPIRATION', 'PRODUCTION', :'P', '2026-11-14 11:00:00+00', 'revoke', NULL) = 'stale', 'RC10 an event older than the last applied one is stale');
SELECT t_check((SELECT expires_at FROM entitlements WHERE user_id = :'P') = '2027-01-14 10:00:00+00' AND (SELECT event_at FROM entitlements WHERE user_id = :'P') = '2026-11-14 11:30:00+00', 'RC11 (DoD 7) a stale event changes nothing');
SELECT t_check((SELECT count(*) FROM revenuecat_events WHERE event_id = 'evt-p4') = 1, 'RC11b a stale event id is still recorded, so its retry is a duplicate');

-- ---------------------------------------------------------------- refund (DoD 5)
SELECT t_check(apply_revenuecat_event('evt-q1', 'INITIAL_PURCHASE', 'PRODUCTION', :'Q', '2026-11-14 10:00:00+00', 'set_expiry', '2026-12-14 10:00:00+00') = 'applied', 'RC12 user Q buys Pro');
SELECT t_check(reserve_ai_use(:'Q', 'chat_message', 'q-1', :'NOW_T')->>'tier' = 'pro', 'RC13 user Q is Pro');
SELECT t_check(apply_revenuecat_event('evt-q2', 'CANCELLATION', 'PRODUCTION', :'Q', '2026-11-14 11:00:00+00', 'revoke', NULL) = 'applied', 'RC14 a refund is applied');
SELECT t_check((SELECT expires_at FROM entitlements WHERE user_id = :'Q') = '2026-11-14 11:00:00+00', 'RC15 a refund sets expires_at to the event time');
SELECT t_check(reserve_ai_use(:'Q', 'chat_message', 'q-2', :'NOW_T')->>'tier' = 'free', 'RC16 (DoD 5) after a refund the tier is free at once');

-- ---------------------------------------------------------------- expiration (DoD 6)
SELECT apply_revenuecat_event('evt-r1', 'INITIAL_PURCHASE', 'PRODUCTION', :'R', '2026-11-14 10:00:00+00', 'set_expiry', '2026-12-14 10:00:00+00');
SELECT t_check(apply_revenuecat_event('evt-r2', 'EXPIRATION', 'PRODUCTION', :'R', '2026-11-14 11:00:00+00', 'revoke', NULL) = 'applied', 'RC17 an expiration is applied');
SELECT t_check(reserve_ai_use(:'R', 'chat_message', 'r-1', :'NOW_T')->>'tier' = 'free', 'RC18 (DoD 6) after an expiration the tier is free');
-- An expiration after the period end must not push expires_at later.
SELECT apply_revenuecat_event('evt-s1', 'INITIAL_PURCHASE', 'PRODUCTION', :'S', '2026-11-01 10:00:00+00', 'set_expiry', '2026-11-10 10:00:00+00');
SELECT apply_revenuecat_event('evt-s2', 'EXPIRATION', 'PRODUCTION', :'S', '2026-11-14 10:00:00+00', 'revoke', NULL);
SELECT t_check((SELECT expires_at FROM entitlements WHERE user_id = :'S') = '2026-11-10 10:00:00+00', 'RC19 a revoke never moves expires_at later');

-- ---------------------------------------------------------------- user without an entitlement row
SELECT t_check(apply_revenuecat_event('evt-n1', 'EXPIRATION', 'PRODUCTION', :'NOBODY', '2026-11-14 10:00:00+00', 'revoke', NULL) = 'unknown_user', 'RC20 (DoD 9) an unknown user is reported as unknown_user');
SELECT t_check((SELECT count(*) FROM entitlements WHERE user_id = :'NOBODY') = 0 AND (SELECT count(*) FROM revenuecat_events WHERE event_id = 'evt-n1') = 0, 'RC21 (DoD 9) an unknown user writes nothing, not even the event row');
INSERT INTO auth.users (id, email) VALUES ('11111111-0000-4000-8000-000000000005', 'norow@example.com');
INSERT INTO profiles (id, age_range, weight_kg, goal, fitness_level, minutes_per_day) VALUES ('11111111-0000-4000-8000-000000000005', '18-24', 60, 'g', 1, 10);
-- The row must be read in a later statement: a subquery in the same statement does not see the call's write.
SELECT t_check(apply_revenuecat_event('evt-n2', 'EXPIRATION', 'PRODUCTION', '11111111-0000-4000-8000-000000000005', '2026-11-14 10:00:00+00', 'revoke', NULL) = 'applied', 'RC22a a revoke with no entitlement row is applied');
SELECT t_check((SELECT expires_at = '2026-11-14 10:00:00+00' AND event_at = '2026-11-14 10:00:00+00' AND source = 'revenuecat' FROM entitlements WHERE user_id = '11111111-0000-4000-8000-000000000005'), 'RC22 a revoke with no entitlement row records an expired row with the event time');
-- A manual grant on the same user (event time cleared, as a manual row has none).
INSERT INTO entitlements (user_id, tier, expires_at, source, event_at) VALUES ('11111111-0000-4000-8000-000000000005', 'pro', '2099-01-01', 'manual', NULL)
  ON CONFLICT (user_id) DO UPDATE SET tier = 'pro', expires_at = '2099-01-01', source = 'manual', event_at = NULL;
SELECT apply_revenuecat_event('evt-n3', 'INITIAL_PURCHASE', 'PRODUCTION', '11111111-0000-4000-8000-000000000005', '2026-11-14 10:00:00+00', 'set_expiry', '2026-12-14 10:00:00+00');
SELECT t_check((SELECT source = 'revenuecat' AND expires_at = '2026-12-14 10:00:00+00' FROM entitlements WHERE user_id = '11111111-0000-4000-8000-000000000005'), 'RC23 a webhook purchase overwrites a manual row');

-- ---------------------------------------------------------------- a refund before its purchase
-- The purchase's retry can arrive after the refund. The refund's time must stop the older purchase.
INSERT INTO auth.users (id, email) VALUES ('11111111-0000-4000-8000-000000000006', 'refund-first@example.com');
INSERT INTO profiles (id, age_range, weight_kg, goal, fitness_level, minutes_per_day) VALUES ('11111111-0000-4000-8000-000000000006', '18-24', 60, 'g', 1, 10);
SELECT t_check(apply_revenuecat_event('evt-r-refund', 'CANCELLATION', 'PRODUCTION', '11111111-0000-4000-8000-000000000006', '2026-11-14 11:00:00+00', 'revoke', NULL) = 'applied', 'RC36 a refund with no earlier row is applied');
SELECT t_check(apply_revenuecat_event('evt-r-buy', 'INITIAL_PURCHASE', 'PRODUCTION', '11111111-0000-4000-8000-000000000006', '2026-11-14 10:00:00+00', 'set_expiry', '2026-12-14 10:00:00+00') = 'stale', 'RC37 an older purchase that arrives after its refund is stale');
SELECT t_check(reserve_ai_use('11111111-0000-4000-8000-000000000006', 'chat_message', 'refund-first-1', :'NOW_T')->>'tier' = 'free', 'RC38 the refunded user stays free');
SELECT t_check(apply_revenuecat_event('evt-r-buy2', 'INITIAL_PURCHASE', 'PRODUCTION', '11111111-0000-4000-8000-000000000006', '2026-11-14 13:00:00+00', 'set_expiry', '2027-01-14 13:00:00+00') = 'applied', 'RC39a a later purchase after the refund is applied');
SELECT t_check(reserve_ai_use('11111111-0000-4000-8000-000000000006', 'chat_message', 'refund-first-2', :'NOW_T')->>'tier' = 'pro', 'RC39 a later purchase after the refund makes the user Pro again');

-- ---------------------------------------------------------------- a failed write rolls the event back (DoD 10)
INSERT INTO auth.users (id, email) VALUES ('11111111-0000-4000-8000-000000000007', 'write-fails@example.com');
INSERT INTO profiles (id, age_range, weight_kg, goal, fitness_level, minutes_per_day) VALUES ('11111111-0000-4000-8000-000000000007', '18-24', 60, 'g', 1, 10);
CREATE FUNCTION fail_entitlement_write() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'simulated write failure' USING ERRCODE = 'XX000';
END;
$$;
CREATE TRIGGER fail_on_entitlement BEFORE INSERT ON entitlements FOR EACH ROW
  WHEN (NEW.user_id = '11111111-0000-4000-8000-000000000007') EXECUTE FUNCTION fail_entitlement_write();
-- The function inserts the event row, then the entitlement write fails. The error must roll both back.
DO $$
BEGIN
  PERFORM apply_revenuecat_event('evt-atomic', 'INITIAL_PURCHASE', 'PRODUCTION', '11111111-0000-4000-8000-000000000007', '2026-11-14 10:00:00+00', 'set_expiry', '2026-12-14 10:00:00+00');
  RAISE EXCEPTION 'the write should have failed';
EXCEPTION WHEN SQLSTATE 'XX000' THEN
  NULL;
END;
$$;
SELECT t_check((SELECT count(*) FROM revenuecat_events WHERE event_id = 'evt-atomic') = 0 AND (SELECT count(*) FROM entitlements WHERE user_id = '11111111-0000-4000-8000-000000000007') = 0, 'RC40 (DoD 10) a failed entitlement write leaves no event row and no entitlement');
DROP TRIGGER fail_on_entitlement ON entitlements;
DROP FUNCTION fail_entitlement_write();

-- ---------------------------------------------------------------- bad input
SELECT t_expect_error(format($q$SELECT apply_revenuecat_event('evt-bad', 'X', 'PRODUCTION', %L, now(), 'grant_forever', NULL)$q$, :'P'), '22023', 'RC24 an unknown action is rejected');
SELECT t_expect_error(format($q$SELECT apply_revenuecat_event('evt-bad2', 'X', 'PRODUCTION', %L, now(), 'set_expiry', NULL)$q$, :'P'), '22023', 'RC25 set_expiry without an expiry is rejected');
SELECT t_check((SELECT count(*) FROM revenuecat_events WHERE event_id IN ('evt-bad', 'evt-bad2')) = 0, 'RC26 a rejected call leaves no event row');

-- ---------------------------------------------------------------- the service role can call it
SET ROLE service_role;
SELECT t_check(apply_revenuecat_event('evt-svc', 'TEST', 'PRODUCTION', :'P', '2026-11-14 11:45:00+00', 'none', NULL) = 'applied', 'RC27 the service role can call apply_revenuecat_event');
RESET ROLE;

-- ---------------------------------------------------------------- what a signed-in user can do (DoD 11)
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'P', false);
SELECT t_expect_error(format($q$INSERT INTO entitlements (user_id, tier, expires_at, source) VALUES (%L, 'pro', '2099-01-01', 'manual')$q$, :'NOBODY'), '42501', 'RC28 (DoD 11) a user cannot insert an entitlement');
SELECT t_expect_error(format($q$UPDATE entitlements SET expires_at = '2099-01-01' WHERE user_id = %L$q$, :'P'), '42501', 'RC29 (DoD 11) a user cannot extend their entitlement');
SELECT t_expect_error($q$INSERT INTO revenuecat_events (event_id, event_type, environment) VALUES ('evil', 'X', 'PRODUCTION')$q$, '42501', 'RC30 (DoD 11) a user cannot insert a webhook event');
SELECT t_expect_error($q$UPDATE revenuecat_events SET event_type = 'Y'$q$, '42501', 'RC31 (DoD 11) a user cannot update a webhook event');
SELECT t_expect_error($q$DELETE FROM revenuecat_events$q$, '42501', 'RC32 a user cannot delete a webhook event');
SELECT t_check((SELECT count(*) FROM revenuecat_events) = 0, 'RC33 a user sees no webhook events (RLS on, no policy)');
SELECT t_expect_error(format($q$SELECT apply_revenuecat_event('evil2', 'INITIAL_PURCHASE', 'PRODUCTION', %L, now(), 'set_expiry', '2099-01-01')$q$, :'P'), '42501', 'RC34 a user cannot call apply_revenuecat_event');
RESET ROLE;
SET ROLE anon;
SELECT t_expect_error($q$SELECT apply_revenuecat_event('evil3', 'X', 'PRODUCTION', '11111111-0000-4000-8000-000000000001', now(), 'none', NULL)$q$, '42501', 'RC35 anon cannot call apply_revenuecat_event');
RESET ROLE;

SELECT 'ALL REVENUECAT CHECKS PASSED' AS result;
