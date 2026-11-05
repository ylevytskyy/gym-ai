-- Requirements 7.4, 7.5, 8.1, 8.9, 8.10
-- Assistant messages: chat history between a user and the assistant.

CREATE TABLE assistant_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assistant_messages_user_id ON assistant_messages(user_id);
CREATE INDEX idx_assistant_messages_created_at ON assistant_messages(created_at DESC);

-- Row Level Security: a user sees and creates only their own messages.
ALTER TABLE assistant_messages ENABLE ROW LEVEL SECURITY;

-- Users can read messages whose user_id matches their auth uid.
CREATE POLICY "Users can read own messages"
  ON assistant_messages FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create messages only for their own auth uid.
CREATE POLICY "Users can insert own messages"
  ON assistant_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);
