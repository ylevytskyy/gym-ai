import type { SupabaseClient } from '@supabase/supabase-js';

/** Deletes every health day the server holds for the user. The caller turns sync off first, so nothing is sent again. */
export async function deleteHealthDays(client: Pick<SupabaseClient, 'from'>, userId: string): Promise<void> {
  const { error } = await client.from('health_days').delete().eq('user_id', userId);
  if (error) throw new Error('Your health data could not be deleted. Check your connection and try again.');
}
