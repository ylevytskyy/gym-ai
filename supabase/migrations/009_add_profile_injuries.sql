-- Adds injuries to a profile in one statement, so two requests at the same time cannot lose
-- one. Used by the assistant service only (when a user tells the coach about an injury):
-- injuries are appended, never removed, and never duplicated.

CREATE OR REPLACE FUNCTION add_profile_injuries(p_user_id UUID, p_injuries TEXT[])
RETURNS SETOF profiles
LANGUAGE sql
AS $$
  UPDATE profiles
  SET injuries = injuries || ARRAY(
    SELECT DISTINCT added FROM unnest(p_injuries) AS added WHERE added <> ALL (profiles.injuries)
  )
  WHERE id = p_user_id
  RETURNING *;
$$;

-- Not callable through the public API: only the service (secret key) may run it.
REVOKE EXECUTE ON FUNCTION add_profile_injuries(UUID, TEXT[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION add_profile_injuries(UUID, TEXT[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION add_profile_injuries(UUID, TEXT[]) TO service_role;
