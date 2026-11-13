import type { SupabaseClient } from '@supabase/supabase-js';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const MESSAGE_LIMIT = 50;
type Client = Pick<SupabaseClient, 'from'>;

/** The signed-in user's last messages, oldest first. The assistant service writes them; the app only reads and deletes. */
export async function loadMessages(client: Client, userId: string): Promise<ChatMessage[]> {
  const { data, error } = await client
    .from('assistant_messages')
    .select('id, role, content')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(MESSAGE_LIMIT);
  if (error) throw new Error('Could not load your conversation. Check your connection and try again.');
  return ((data ?? []) as Record<string, unknown>[])
    .flatMap((row) =>
      typeof row['id'] === 'string' && (row['role'] === 'user' || row['role'] === 'assistant') && typeof row['content'] === 'string'
        ? [{ id: row['id'], role: row['role'], content: row['content'] } as ChatMessage]
        : [],
    )
    .reverse();
}

export async function clearMessages(client: Client, userId: string): Promise<void> {
  const { error } = await client.from('assistant_messages').delete().eq('user_id', userId);
  if (error) throw new Error('Could not clear the conversation. Check your connection and try again.');
}
