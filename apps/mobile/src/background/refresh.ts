/**
 * What the app does when the phone wakes it without the user: plan the sitting nudges again
 * from the latest steps, and send the health days to the server.
 *
 * It runs with no screen, possibly on a locked phone, so it never throws and never syncs a
 * read in which something failed.
 */

import { addDays } from '@aura-fit/health-core';

import { createHealthSync, HISTORY_DAYS, type SyncResult } from '@/health/sync';
import type { Services } from '@/services';

export interface RefreshResult {
  /** Whether the nudges could be planned again. */
  nudges: boolean;
  sync: SyncResult | 'skipped';
}

type Deps = Pick<Services, 'nudges' | 'health' | 'supabase' | 'today'>;

async function syncDays({ health, supabase, today }: Deps): Promise<SyncResult | 'skipped'> {
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return 'skipped';
    if ((await health.state()) !== 'connected') return 'skipped';
    const to = today();
    const read = await health.readDaysChecked(addDays(to, -HISTORY_DAYS), to);
    if (!read.complete) return 'skipped';
    return await createHealthSync(supabase)(userId, read.days);
  } catch {
    return 'skipped';
  }
}

export async function backgroundRefresh(deps: Deps): Promise<RefreshResult> {
  let nudges = true;
  try {
    await deps.nudges.refresh();
  } catch {
    nudges = false;
  }
  return { nudges, sync: await syncDays(deps) };
}

/**
 * What to do when the phone delivers new steps. While the app is open the screens already
 * plan and sync, so this only acts when it is not; deliveries that arrive while one refresh is
 * still running are folded into it.
 */
export function createStepHandler(deps: Deps, appIsOpen: () => boolean): () => Promise<void> {
  let running: Promise<void> | null = null;
  return () => {
    if (appIsOpen()) return Promise.resolve();
    running ??= backgroundRefresh(deps)
      .then(() => undefined)
      .finally(() => {
        running = null;
      });
    return running;
  };
}
