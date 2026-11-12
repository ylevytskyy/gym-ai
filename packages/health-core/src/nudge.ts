/**
 * Sitting nudge: whether to offer a short desk break now.
 *
 * Pure decision only. Reading steps, scheduling and showing the local notification belong to
 * the app. Active hours and "today" are judged in the user's time zone.
 */

export interface NudgeSettings {
  /** Nudges are off until the user turns them on. */
  enabled: boolean;
  /** Fewer steps than this in the last hour counts as sitting. */
  stepThreshold: number;
  /** Active hours, local: from startHour (inclusive) to endHour (exclusive), 0-24. */
  startHour: number;
  endHour: number;
  weekdaysOnly: boolean;
  maxPerDay: number;
  minGapMinutes: number;
}

export const DEFAULT_NUDGE_SETTINGS: NudgeSettings = {
  enabled: false,
  stepThreshold: 250,
  startHour: 9,
  endHour: 18,
  weekdaysOnly: true,
  maxPerDay: 3,
  minGapMinutes: 90,
};

export interface NudgeInput {
  stepsLastHour: number;
  now: Date;
  /** IANA time zone of the user. */
  tz: string;
  /** When earlier nudges were sent; entries from other local days are ignored. */
  sentToday: Date[];
  settings: NudgeSettings;
}

interface LocalTime {
  day: string; // YYYY-MM-DD
  hour: number;
  weekend: boolean;
}

/** The local calendar day, hour and weekend flag of an instant; undefined for a bad time zone. */
function localTime(instant: Date, tz: string): LocalTime | undefined {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    }).formatToParts(instant);
  } catch {
    return undefined;
  }
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '';
  const hour = Number(get('hour'));
  if (!Number.isFinite(hour)) return undefined;
  const weekday = get('weekday');
  return {
    day: `${get('year')}-${get('month')}-${get('day')}`,
    hour,
    weekend: weekday === 'Sat' || weekday === 'Sun',
  };
}

export function nudgeDue(input: NudgeInput): boolean {
  const { settings, now } = input;
  if (!settings.enabled) return false;
  // An unknown step count is not a sedentary hour: no data is never read as zero.
  if (!Number.isFinite(input.stepsLastHour) || input.stepsLastHour < 0) return false;
  if (input.stepsLastHour >= settings.stepThreshold) return false;

  const local = localTime(now, input.tz);
  if (!local) return false;
  if (settings.weekdaysOnly && local.weekend) return false;
  if (local.hour < settings.startHour || local.hour >= settings.endHour) return false;

  const sent = input.sentToday.filter((at) => localTime(at, input.tz)?.day === local.day);
  if (sent.length >= settings.maxPerDay) return false;

  const gapMs = settings.minGapMinutes * 60_000;
  return sent.every((at) => now.getTime() - at.getTime() >= gapMs);
}
