-- Users can delete their own chat messages ("Clear chat" in the app).
-- Messages are written by the assistant service; users still cannot change one.

CREATE POLICY "Users can delete own messages"
  ON assistant_messages FOR DELETE
  USING (auth.uid() = user_id);
