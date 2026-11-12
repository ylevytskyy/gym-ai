/** Calendar-day arithmetic on YYYY-MM-DD strings. Days are local dates, so no time zone is involved. */

const DAY_MS = 86_400_000;

function toUtcMs(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y ?? NaN, (m ?? NaN) - 1, d ?? NaN);
}

/** Whole days from `from` to `to`; positive when `to` is later. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

/** The day `count` days after `day` (negative goes back). */
export function addDays(day: string, count: number): string {
  return new Date(toUtcMs(day) + count * DAY_MS).toISOString().slice(0, 10);
}

/** Median of a non-empty list; undefined for an empty one. */
export function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid];
  if (upper === undefined) return undefined;
  if (sorted.length % 2 === 1) return upper;
  const lower = sorted[mid - 1];
  return lower === undefined ? upper : (lower + upper) / 2;
}

/**
 * The calendar day (YYYY-MM-DD) of an instant in an IANA time zone. An unknown time zone falls
 * back to the UTC day, so a bad value from a client can shift a window by a day but never throws.
 */
export function localDay(instant: Date, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant);
    const get = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return instant.toISOString().slice(0, 10);
  }
}
