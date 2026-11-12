import { describe, it, expect } from 'vitest';
import { DEFAULT_NUDGE_SETTINGS, nudgeDue } from '../src/index.js';

const on = { ...DEFAULT_NUDGE_SETTINGS, enabled: true };
const KYIV = 'Europe/Kyiv'; // UTC+2 in November

// Thursday 2026-11-12, 11:00 in Kyiv.
const thursday11 = new Date('2026-11-12T09:00:00Z');

function input(overrides: Partial<Parameters<typeof nudgeDue>[0]> = {}): Parameters<typeof nudgeDue>[0] {
  return { stepsLastHour: 100, now: thursday11, tz: KYIV, sentToday: [], settings: on, ...overrides };
}

describe('nudgeDue', () => {
  it('is due after a sedentary hour inside active hours with nothing sent', () => {
    expect(nudgeDue(input())).toBe(true);
  });

  it('is off by default', () => {
    expect(DEFAULT_NUDGE_SETTINGS.enabled).toBe(false);
    expect(nudgeDue(input({ settings: DEFAULT_NUDGE_SETTINGS }))).toBe(false);
  });

  it('is not due when the user moved enough', () => {
    expect(nudgeDue(input({ stepsLastHour: 249 }))).toBe(true);
    expect(nudgeDue(input({ stepsLastHour: 250 }))).toBe(false);
  });

  it('respects active hours in the user time zone, not UTC', () => {
    // 07:30 UTC is 09:30 in Kyiv (inside); 16:30 UTC is 18:30 in Kyiv (outside).
    expect(nudgeDue(input({ now: new Date('2026-11-12T07:30:00Z') }))).toBe(true);
    expect(nudgeDue(input({ now: new Date('2026-11-12T16:30:00Z') }))).toBe(false);
    // 09:00 UTC is 04:00 in New York: inside by UTC, outside for the user.
    expect(nudgeDue(input({ tz: 'America/New_York' }))).toBe(false);
  });

  it('treats the start hour as inside and the end hour as outside', () => {
    expect(nudgeDue(input({ now: new Date('2026-11-12T07:00:00Z') }))).toBe(true); // 09:00
    expect(nudgeDue(input({ now: new Date('2026-11-12T06:59:00Z') }))).toBe(false); // 08:59
    expect(nudgeDue(input({ now: new Date('2026-11-12T16:00:00Z') }))).toBe(false); // 18:00
  });

  it('is not due at the weekend unless weekends are allowed', () => {
    const saturday11 = new Date('2026-11-14T09:00:00Z');
    expect(nudgeDue(input({ now: saturday11 }))).toBe(false);
    expect(nudgeDue(input({ now: saturday11, settings: { ...on, weekdaysOnly: false } }))).toBe(true);
    // Sunday 23:30 UTC is already Monday 01:30 in Kyiv: a weekday, but outside active hours.
    expect(nudgeDue(input({ now: new Date('2026-11-15T23:30:00Z') }))).toBe(false);
  });

  it('stops after 3 nudges in the local day', () => {
    const sent = ['07:05', '08:40', '10:20'].map((t) => new Date(`2026-11-12T${t}:00Z`));
    expect(nudgeDue(input({ now: new Date('2026-11-12T12:30:00Z'), sentToday: sent }))).toBe(false);
    expect(nudgeDue(input({ now: new Date('2026-11-12T12:30:00Z'), sentToday: sent.slice(0, 2) }))).toBe(true);
  });

  it('does not count nudges sent on an earlier local day', () => {
    const yesterday = ['09:00', '11:00', '13:00'].map((t) => new Date(`2026-11-11T${t}:00Z`));
    expect(nudgeDue(input({ sentToday: yesterday }))).toBe(true);
  });

  it('waits 90 minutes after the last nudge', () => {
    expect(nudgeDue(input({ sentToday: [new Date('2026-11-12T07:31:00Z')] }))).toBe(false); // 89 min ago
    expect(nudgeDue(input({ sentToday: [new Date('2026-11-12T07:30:00Z')] }))).toBe(true); // 90 min ago
  });

  it('is not due when the step count is unknown: no data is not the same as no steps', () => {
    expect(nudgeDue(input({ stepsLastHour: Number.NaN }))).toBe(false);
    expect(nudgeDue(input({ stepsLastHour: undefined as unknown as number }))).toBe(false);
    expect(nudgeDue(input({ stepsLastHour: -1 }))).toBe(false);
  });

  it('is not due for an unknown time zone rather than throwing', () => {
    expect(nudgeDue(input({ tz: 'Not/AZone' }))).toBe(false);
  });
});
