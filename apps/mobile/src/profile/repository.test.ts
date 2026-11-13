import { loadProfile, ProfileError, saveProfile, type ProfileClient } from './repository';
import type { ProfileValues } from './model';

function fakeClient(response: { data?: unknown; error?: unknown }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'upsert']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  for (const method of ['maybeSingle', 'single']) {
    builder[method] = async () => {
      calls.push({ method, args: [] });
      return response;
    };
  }
  const client = { from: (table: string) => (calls.push({ method: 'from', args: [table] }), builder) } as unknown as ProfileClient;
  return { client, calls };
}

const values: ProfileValues = { age_range: '25-34', weight_kg: 72, goal: 'move_more', fitness_level: 1, injuries: [], minutes_per_day: 15, language: 'en' };

describe('profile repository', () => {
  it('loads the row whose id is the user id', async () => {
    const { client, calls } = fakeClient({ data: { id: 'user-1', ...values }, error: null });
    expect(await loadProfile(client, 'user-1')).toEqual({ id: 'user-1', ...values });
    expect(calls).toContainEqual({ method: 'from', args: ['profiles'] });
    expect(calls).toContainEqual({ method: 'eq', args: ['id', 'user-1'] });
  });

  it('returns null for a user without a profile, and throws when the read fails', async () => {
    expect(await loadProfile(fakeClient({ data: null, error: null }).client, 'user-1')).toBeNull();
    await expect(loadProfile(fakeClient({ data: null, error: { message: 'JWT expired' } }).client, 'user-1')).rejects.toBeInstanceOf(ProfileError);
  });

  it('upserts the values under the user id and returns the stored row', async () => {
    const { client, calls } = fakeClient({ data: { id: 'user-1', ...values }, error: null });
    expect(await saveProfile(client, 'user-1', values)).toEqual({ id: 'user-1', ...values });
    expect(calls).toContainEqual({ method: 'upsert', args: [{ id: 'user-1', ...values }, { onConflict: 'id' }] });
  });

  it('throws a message fit for the user when the save fails, without the server text', async () => {
    const failing = fakeClient({ data: null, error: { message: 'new row violates check constraint "profiles_weight_kg_check"' } });
    await expect(saveProfile(failing.client, 'user-1', values)).rejects.toThrow('Could not save your profile.');
  });
});
