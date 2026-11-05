-- Requirements 14.1, 14.2, 14.3, 14.4, 14.5, 14.6
-- Public bucket for exercise media. Layout inside the bucket:
--   videos/<exercise_id>.mp4
--   posters/<exercise_id>.jpg
--   models/<exercise_id>.glb
-- The folders are created implicitly by uploads; nothing to create here.

INSERT INTO storage.buckets (id, name, public)
VALUES ('exercise-media', 'exercise-media', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone (anon or authenticated) can read objects in this bucket.
CREATE POLICY "Public read access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'exercise-media');

-- No INSERT/UPDATE/DELETE policy: only the service role can write media.
