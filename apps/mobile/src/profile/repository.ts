/** Reads and writes the signed-in user's profile row. Row Level Security limits both to their own row. */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { ProfileValues } from './model';

export type ProfileClient = Pick<SupabaseClient, 'from'>;

export interface StoredProfile extends ProfileValues {
  id: string;
  /** IANA name the server counts the AI allowance's days in; UTC until the app writes the device's. */
  timezone?: string;
}

export class ProfileError extends Error {}

/** The user's profile, or null when they have not finished onboarding. */
export async function loadProfile(client: ProfileClient, userId: string): Promise<StoredProfile | null> {
  const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw new ProfileError('Could not load your profile. Check your connection and try again.');
  return (data as StoredProfile | null) ?? null;
}

export async function saveProfile(client: ProfileClient, userId: string, values: ProfileValues): Promise<StoredProfile> {
  const { data, error } = await client
    .from('profiles')
    .upsert({ id: userId, ...values }, { onConflict: 'id' })
    .select('*')
    .single();
  if (error || !data) throw new ProfileError('Could not save your profile. Check your connection and try again.');
  return data as StoredProfile;
}

/** Writes the device time zone. The database refuses a name it does not know. */
export async function saveTimeZone(client: ProfileClient, userId: string, timeZone: string): Promise<StoredProfile> {
  const { data, error } = await client.from('profiles').update({ timezone: timeZone }).eq('id', userId).select('*').single();
  if (error || !data) throw new ProfileError('Could not save your time zone.');
  return data as StoredProfile;
}
