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
  minute: number;
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
      minute: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    }).formatToParts(instant);
  } catch {
    return undefined;
  }
  const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '';
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return undefined;
  const weekday = get('weekday');
  return {
    day: `${get('year')}-${get('month')}-${get('day')}`,
    hour,
    minute,
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

/** Steps counted over a short stretch of time that ended at `end`. */
export interface StepBucket {
  end: Date;
  steps: number;
}

export interface NudgePlanInput {
  now: Date;
  /** IANA time zone of the user. */
  tz: string;
  settings: NudgeSettings;
  /** Step totals of the last hour; an empty list is an hour without steps. Null when steps are unknown. */
  recentSteps: StepBucket[] | null;
  /** When earlier nudges were sent; entries from other local days are ignored. */
  sent: Date[];
  /** No nudge before this moment (for example an hour after a workout ended). */
  notBefore?: Date;
}

/** The stretch of time a sitting nudge looks back over. */
export const SEDENTARY_WINDOW_MINUTES = 60;
const WINDOW_MS = SEDENTARY_WINDOW_MINUTES * 60_000;
/** A bound on how many nudges one plan may hold, whatever the settings say. */
const MAX_PLANNED = 24;

/** Steps in the hour up to `at`, counting each total at the moment its stretch ended. */
export function stepsInLastHour(buckets: StepBucket[], at: Date): number {
  const until = at.getTime();
  return buckets.reduce((sum, bucket) => {
    const end = bucket.end.getTime();
    return end > until - WINDOW_MS && end <= until ? sum + bucket.steps : sum;
  }, 0);
}

/**
 * When to show sitting nudges for the rest of today, assuming the user does not move again.
 *
 * A local notification cannot check anything when it fires, so the times are fixed in advance
 * and planned again whenever new steps are seen. Every time returned satisfies `nudgeDue` for
 * the steps then in the last hour, with the nudges before it counted as sent.
 */
export function planNudges(input: NudgePlanInput): Date[] {
  const { settings, now, tz } = input;
  if (!settings.enabled || input.recentSteps === null) return [];
  if (!(settings.stepThreshold > 0)) return [];
  // One unreadable total makes the hour unknown, and unknown is never sitting.
  if (input.recentSteps.some((b) => !Number.isFinite(b.steps) || b.steps < 0 || !Number.isFinite(b.end.getTime()))) return [];

  const today = localTime(now, tz);
  if (!today) return [];

  // The last hour falls under the threshold either now or when one of its totals turns an hour old.
  // A total that ends after now cannot be trusted to be in the past hour at any later moment either.
  const buckets = input.recentSteps.filter((b) => b.end.getTime() <= now.getTime());
  const candidates = [now.getTime(), ...buckets.map((b) => b.end.getTime() + WINDOW_MS)].filter((t) => t >= now.getTime()).sort((a, b) => a - b);
  const sedentaryAt = candidates.find((t) => stepsInLastHour(buckets, new Date(t)) < settings.stepThreshold);
  if (sedentaryAt === undefined) return [];

  const gapMs = Math.max(1, settings.minGapMinutes) * 60_000;
  const sentToday = input.sent.filter((at) => localTime(at, tz)?.day === today.day);
  const limit = Math.min(settings.maxPerDay, MAX_PLANNED);

  let next = Math.max(sedentaryAt, input.notBefore?.getTime() ?? 0, ...sentToday.map((at) => at.getTime() + gapMs));
  let count = sentToday.length;
  const planned: Date[] = [];
  // Each pass either plans a nudge, moves to the start of active hours, or stops.
  for (let pass = 0; pass < MAX_PLANNED * 2 && count < limit; pass++) {
    const local = localTime(new Date(next), tz);
    if (!local || local.day !== today.day) break;
    if (settings.weekdaysOnly && local.weekend) break;
    if (local.hour >= settings.endHour) break;
    if (local.hour < settings.startHour) {
      const minutes = (settings.startHour - local.hour) * 60 - local.minute;
      let start = next - (next % 60_000) + minutes * 60_000;
      // On the day clocks go forward, counting clock minutes lands an hour late: step back
      // while the hour before is still inside active hours. (When clocks go back it lands
      // early, and the next pass moves forward again.)
      for (let back = localTime(new Date(start - 3_600_000), tz); back && back.day === today.day && back.hour >= settings.startHour && start - 3_600_000 > next; ) {
        start -= 3_600_000;
        back = localTime(new Date(start - 3_600_000), tz);
      }
      next = start;
      continue;
    }
    planned.push(new Date(next));
    count += 1;
    next += gapMs;
  }
  return planned;
}
