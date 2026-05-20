// Date helpers. Keep everything in local time for display and window logic;
// use ISO strings with explicit timezones only for `generated_at`.

import {
  format,
  parseISO,
  parse,
  addMinutes,
  isBefore,
  isAfter,
  startOfDay,
  isSameDay as fnsSameDay,
  differenceInCalendarDays,
} from "date-fns";

import type { DayOfWeek, TimeWindow } from "@src/types";

const DOW: DayOfWeek[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export function todayYYYYMMDD(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function parseYYYYMMDD(s: string): Date {
  return parseISO(s);
}

export function dayOfWeekFromDate(s: string): DayOfWeek {
  return DOW[parseYYYYMMDD(s).getDay()];
}

export function isToday(s: string): boolean {
  return fnsSameDay(parseYYYYMMDD(s), new Date());
}

// Parse an HH:MM string on a given calendar day into a local Date.
export function timeOnDay(dayYYYYMMDD: string, hhmm: string): Date {
  return parse(`${dayYYYYMMDD} ${hhmm}`, "yyyy-MM-dd HH:mm", new Date());
}

export function windowContainsNow(
  dayYYYYMMDD: string,
  window: TimeWindow,
  now: Date = new Date(),
): boolean {
  if (!isSameDay(dayYYYYMMDD, now)) return false;
  const earliest = timeOnDay(dayYYYYMMDD, window.earliest);
  const latest = timeOnDay(dayYYYYMMDD, window.latest);
  return !isBefore(now, earliest) && !isAfter(now, latest);
}

export function isSameDay(yyyymmdd: string, date: Date): boolean {
  return fnsSameDay(parseYYYYMMDD(yyyymmdd), date);
}

export function minutesUntil(targetDay: string, hhmm: string): number {
  const target = timeOnDay(targetDay, hhmm);
  return Math.round((target.getTime() - Date.now()) / 60000);
}

// Add `minutes` to a HH:MM string, clamped within the day.
export function addMinutesToTime(hhmm: string, minutes: number): string {
  const today = format(new Date(), "yyyy-MM-dd");
  const d = parse(`${today} ${hhmm}`, "yyyy-MM-dd HH:mm", new Date());
  return format(addMinutes(d, minutes), "HH:mm");
}

export function isTimeAfter(a: string, b: string): boolean {
  return a > b; // HH:MM string compare works lexically
}

export function formatTimeWindow(w: TimeWindow): string {
  return `${w.earliest}–${w.latest}`;
}

export function formatHumanDate(yyyymmdd: string): string {
  const d = parseYYYYMMDD(yyyymmdd);
  return format(d, "EEE, MMM d");
}

export function daysFromNow(yyyymmdd: string): number {
  return differenceInCalendarDays(
    startOfDay(parseYYYYMMDD(yyyymmdd)),
    startOfDay(new Date()),
  );
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function computeAge(dob: string): number {
  const d = parseYYYYMMDD(dob);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}
