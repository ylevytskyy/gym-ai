/** Local calendar days on the device. A health day is cut in the phone's own time zone. */

const pad = (n: number): string => String(n).padStart(2, '0');

/** The local calendar day (YYYY-MM-DD) of an instant. */
export function localDayOf(instant: Date): string {
  return `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}`;
}

/** Local midnight at the start of a day. */
export function startOfDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y ?? NaN, (m ?? NaN) - 1, d ?? NaN);
}

/** Local midnight at the end of a day (the start of the next one). Correct across DST changes. */
export function endOfDay(day: string): Date {
  const start = startOfDay(day);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
}

/** Every day from `from` to `to`, inclusive, oldest first. Empty when `to` is before `from`. */
export function daysInRange(from: string, to: string): string[] {
  const days: string[] = [];
  const end = startOfDay(to).getTime();
  for (let cursor = startOfDay(from); cursor.getTime() <= end; ) {
    days.push(localDayOf(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }
  return days;
}

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
