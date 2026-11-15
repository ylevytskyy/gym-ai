/**
 * The plan laid over the calendar. A plan has no dates: its days are done in order and it
 * repeats, and the next day comes only after a session is finished. So a past date shows what
 * was finished on it, and an upcoming date shows where the plan would be if the user trained
 * every day from today on. Pure functions over local calendar days (YYYY-MM-DD).
 */

import type { WorkoutDay } from '@aura-fit/health-core';

import { endOfDay, localDayOf, startOfDay } from '@/health/local-day';

import { todayPlan, type WorkoutLogRow, type WorkoutPlan } from './model';

export type DaySession =
  /** Today, as the Today screen shows it. */
  | { kind: 'today'; day: WorkoutDay; doneToday: boolean }
  /** A later date: the plan day it would be with one session a day from today. */
  | { kind: 'upcoming'; day: WorkoutDay }
  /** An earlier date with a finished session. No day when the plan no longer has that day number. */
  | { kind: 'done'; day?: WorkoutDay }
  /** An earlier date of this plan without a finished session. */
  | { kind: 'rest' }
  /** A date before this plan was made. */
  | { kind: 'before_plan' };

/** Whole calendar days from one local day to another; negative when `to` is earlier. Correct across DST. */
const daysBetween = (from: string, to: string): number => Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);

/**
 * `storedAt` is when the plan was saved (the plans row). The date inside the plan is written
 * by the model and is not trusted; without `storedAt` no date counts as before the plan.
 */
export function sessionOn(plan: WorkoutPlan, logs: WorkoutLogRow[], date: string, now: Date, storedAt?: string): DaySession {
  const today = localDayOf(now);
  const ordered = [...plan.days].sort((a, b) => a.day - b.day);
  const offset = daysBetween(today, date);

  if (offset === 0) return { kind: 'today', ...todayPlan(plan, logs, now) };

  if (offset > 0) {
    const current = todayPlan(plan, logs, now);
    const indexOf = (day: WorkoutDay) => Math.max(0, ordered.findIndex((d) => d.day === day.day));
    if (current.doneToday) {
      // Tomorrow is what Today will show tomorrow; this also starts over after a day the plan no longer has.
      const tomorrow = todayPlan(plan, logs, endOfDay(today));
      return { kind: 'upcoming', day: ordered[(indexOf(tomorrow.day) + offset - 1) % ordered.length] as WorkoutDay };
    }
    // Today is still to do: tomorrow is the day after it.
    return { kind: 'upcoming', day: ordered[(indexOf(current.day) + offset) % ordered.length] as WorkoutDay };
  }

  const finished = logs
    .filter((log) => Number.isFinite(Date.parse(log.completed_at)) && localDayOf(new Date(log.completed_at)) === date)
    .sort((a, b) => Date.parse(b.completed_at) - Date.parse(a.completed_at))[0];
  if (finished) {
    const day = ordered.find((d) => d.day === finished.day_number);
    return day ? { kind: 'done', day } : { kind: 'done' };
  }
  const made = storedAt === undefined ? NaN : Date.parse(storedAt);
  if (Number.isFinite(made) && date < localDayOf(new Date(made))) return { kind: 'before_plan' };
  return { kind: 'rest' };
}

/** The seven local days of the week holding `date`, Monday first. */
export function weekOf(date: string): string[] {
  const start = startOfDay(date);
  const monday = new Date(start.getFullYear(), start.getMonth(), start.getDate() - ((start.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => localDayOf(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)));
}
