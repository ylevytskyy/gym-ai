/**
 * Sitting nudges on the phone: the user's settings, and keeping the scheduled notifications in
 * step with the steps the health store reports.
 *
 * A notification cannot check anything when it fires, so the times are fixed in advance
 * (planNudges in health-core) and planned again on every refresh: when the app opens, when new
 * steps are delivered and when the periodic background task runs. Nothing here throws; a
 * failure leaves the user without a nudge, never with a broken screen.
 */

import { DEFAULT_NUDGE_SETTINGS, planNudges, SEDENTARY_WINDOW_MINUTES, type NudgeSettings } from '@aura-fit/health-core';

import type { HealthController, Preferences } from '@/health/controller';

import type { NotificationPermission, Notifier } from './notifier';

const SETTINGS = 'nudges.settings';
/** Times (ms) of the nudges planned today: the ones already shown and the ones still waiting. */
const PLANNED = 'nudges.planned';
const NOT_BEFORE = 'nudges.notBefore';
const BACKGROUND = 'nudges.background';
/** While a workout or break is open (ms): nothing is planned before this moment unless the session ends first. */
const HELD_UNTIL = 'nudges.heldUntil';
/** A hold ends by itself, in case the app is closed in the middle of a session. */
const HOLD_MS = 2 * 3_600_000;

const HISTORY_MS = 36 * 3_600_000;

/** What the user may change. The step threshold, daily limit and gap are fixed. */
export type NudgeChoices = Partial<Pick<NudgeSettings, 'startHour' | 'endHour' | 'weekdaysOnly'>>;

export interface NudgeStatus {
  settings: NudgeSettings;
  permission: NotificationPermission;
  /** When the next nudge will show if the user does not move; null when none is planned. */
  next: Date | null;
  /** Whether the app may read steps while it is closed. Without it, nudges follow the last time the app was open. */
  background: boolean;
}

export interface NudgeController {
  /** Asks for notification permission, and turns nudges on when it is given. */
  turnOn(): Promise<NudgeStatus>;
  turnOff(): Promise<NudgeStatus>;
  save(choices: NudgeChoices): Promise<NudgeStatus>;
  /** Plans again from the steps of the last hour. */
  refresh(): Promise<NudgeStatus>;
  /** A workout or break is open: waiting nudges are cancelled and none is planned until it ends. */
  hold(): Promise<void>;
  /** The session was closed without being started: planning goes on as before. */
  release(): Promise<NudgeStatus>;
  /** The user just moved (a workout or a break ended): no nudge for the next hour. */
  moved(): Promise<NudgeStatus>;
}

const isHour = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

/** Stored settings as valid settings; anything unusable falls back to the defaults. */
export function sanitizeSettings(raw: unknown): NudgeSettings {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_NUDGE_SETTINGS;
  const stored = raw as Record<string, unknown>;
  const hoursValid = isHour(stored['startHour'], 0, 23) && isHour(stored['endHour'], 1, 24) && stored['startHour'] < stored['endHour'];
  return {
    ...DEFAULT_NUDGE_SETTINGS,
    enabled: stored['enabled'] === true,
    ...(hoursValid ? { startHour: stored['startHour'] as number, endHour: stored['endHour'] as number } : {}),
    ...(typeof stored['weekdaysOnly'] === 'boolean' ? { weekdaysOnly: stored['weekdaysOnly'] } : {}),
  };
}

export interface NudgeDeps {
  health: Pick<HealthController, 'state' | 'readRecentSteps' | 'setBackground'>;
  notifier: Notifier;
  preferences: Preferences;
  now: () => Date;
  timeZone: () => string;
}

export function createNudgeController({ health, notifier, preferences, now, timeZone }: NudgeDeps): NudgeController {
  const read = async (key: string): Promise<string | null> => {
    try {
      return await preferences.get(key);
    } catch {
      return null;
    }
  };
  const write = async (key: string, value: string): Promise<void> => {
    try {
      await preferences.set(key, value);
    } catch {
      // Lost on restart; the next refresh plans from what it can read.
    }
  };

  async function loadSettings(): Promise<NudgeSettings> {
    try {
      return sanitizeSettings(JSON.parse((await read(SETTINGS)) ?? 'null'));
    } catch {
      return DEFAULT_NUDGE_SETTINGS;
    }
  }

  async function loadPlanned(at: Date): Promise<number[]> {
    try {
      const stored: unknown = JSON.parse((await read(PLANNED)) ?? '[]');
      if (!Array.isArray(stored)) return [];
      return stored.filter((time): time is number => typeof time === 'number' && Number.isFinite(time) && time > at.getTime() - HISTORY_MS);
    } catch {
      return [];
    }
  }

  async function permission(): Promise<NotificationPermission> {
    try {
      return await notifier.permission();
    } catch {
      return 'denied';
    }
  }

  /** Cancels what is waiting and forgets it; nudges already shown stay counted. */
  async function cancelWaiting(at: Date): Promise<void> {
    const planned = await loadPlanned(at);
    const waiting = planned.some((time) => time >= at.getTime());
    try {
      await notifier.cancel();
    } catch {
      // Nothing more can be done; the next refresh tries again.
    }
    if (waiting) await write(PLANNED, JSON.stringify(planned.filter((time) => time < at.getTime())));
  }

  async function plan(): Promise<NudgeStatus> {
    const at = now();
    const settings = await loadSettings();
    const allowed = await permission();
    const background = (await read(BACKGROUND)) === 'true';
    const status = (next: number | undefined): NudgeStatus => ({ settings, permission: allowed, next: next === undefined ? null : new Date(next), background });

    let connected = false;
    try {
      connected = (await health.state()) === 'connected';
    } catch {
      connected = false;
    }
    const heldUntil = Number(await read(HELD_UNTIL));
    const held = Number.isFinite(heldUntil) && at.getTime() < heldUntil;
    if (!settings.enabled || allowed !== 'granted' || !connected || held) {
      await cancelWaiting(at);
      return status(undefined);
    }

    const planned = await loadPlanned(at);
    const sent = planned.filter((time) => time < at.getTime());
    const waiting = planned.filter((time) => time >= at.getTime()).sort((a, b) => a - b);

    let steps: Awaited<ReturnType<typeof health.readRecentSteps>>;
    try {
      steps = await health.readRecentSteps(at);
    } catch {
      steps = null;
    }
    // Steps cannot be read right now (a locked phone, a failed read): what is scheduled stays.
    if (steps === null) return status(waiting[0]);

    const notBefore = Number(await read(NOT_BEFORE));
    const times = planNudges({
      now: at,
      tz: timeZone(),
      settings,
      recentSteps: steps,
      sent: sent.map((time) => new Date(time)),
      ...(Number.isFinite(notBefore) && notBefore > 0 ? { notBefore: new Date(notBefore) } : {}),
    }).map((time) => time.getTime());

    const unchanged = times.length === waiting.length && times.every((time, i) => time === waiting[i]);
    if (unchanged) return status(times[0]);

    try {
      // Only the ones still ahead: a nudge whose time has just passed may not have been shown
      // yet, and it already counts as sent.
      await notifier.cancel(at);
      for (const time of times) await notifier.schedule(new Date(time));
    } catch {
      await cancelWaiting(at);
      await write(PLANNED, JSON.stringify(sent));
      return status(undefined);
    }
    await write(PLANNED, JSON.stringify([...sent, ...times]));
    return status(times[0]);
  }

  // Each operation cancels and schedules, so two must never interleave: one waits for the other.
  let queue: Promise<unknown> = Promise.resolve();
  function inOrder<T>(operation: () => Promise<T>): Promise<T> {
    const next = queue.then(operation, operation);
    queue = next.catch(() => undefined);
    return next;
  }

  const fallback = async (): Promise<NudgeStatus> => ({ settings: await loadSettings(), permission: await permission(), next: null, background: false });
  const safely = (operation: () => Promise<NudgeStatus>) => inOrder(() => operation().catch(fallback));

  return {
    turnOn: () =>
      safely(async () => {
        let answer: NotificationPermission;
        try {
          answer = await notifier.request();
        } catch {
          answer = 'denied';
        }
        if (answer !== 'granted') return plan();
        await write(SETTINGS, JSON.stringify({ ...(await loadSettings()), enabled: true }));
        let background = false;
        try {
          background = await health.setBackground(true);
        } catch {
          background = false;
        }
        await write(BACKGROUND, String(background));
        return plan();
      }),

    turnOff: () =>
      safely(async () => {
        await write(SETTINGS, JSON.stringify({ ...(await loadSettings()), enabled: false }));
        await write(BACKGROUND, 'false');
        try {
          await health.setBackground(false);
        } catch {
          // Reading in the background stops mattering once nothing is planned.
        }
        return plan();
      }),

    save: (choices) =>
      safely(async () => {
        const current = await loadSettings();
        const next = sanitizeSettings({
          ...current,
          ...(choices.startHour === undefined ? {} : { startHour: choices.startHour }),
          ...(choices.endHour === undefined ? {} : { endHour: choices.endHour }),
          ...(choices.weekdaysOnly === undefined ? {} : { weekdaysOnly: choices.weekdaysOnly }),
        });
        // Hours that do not make sense are not saved: sanitizeSettings would have dropped them.
        const hoursKept = (choices.startHour ?? next.startHour) === next.startHour && (choices.endHour ?? next.endHour) === next.endHour;
        await write(SETTINGS, JSON.stringify(hoursKept ? next : { ...next, startHour: current.startHour, endHour: current.endHour }));
        // What was planned under the old hours must not outlive them, also when steps cannot be read right now.
        await cancelWaiting(now());
        return plan();
      }),

    refresh: () => safely(plan),

    hold: () =>
      inOrder(async () => {
        const at = now();
        await write(HELD_UNTIL, String(at.getTime() + HOLD_MS));
        await cancelWaiting(at);
      }).catch(() => undefined),

    release: () =>
      safely(async () => {
        await write(HELD_UNTIL, '0');
        return plan();
      }),

    moved: () =>
      safely(async () => {
        await write(HELD_UNTIL, '0');
        await write(NOT_BEFORE, String(now().getTime() + SEDENTARY_WINDOW_MINUTES * 60_000));
        return plan();
      }),
  };
}
