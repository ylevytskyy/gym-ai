import { limitNotice, parseUsage, remainingHint, resetsText, type Usage } from './usage';

// Tests run in Europe/Kyiv (jest.global-setup.js). 10:00 local on 12 November.
const now = new Date('2026-11-12T10:00:00');
const time = (at: Date) => at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const free = (remaining: number, resetsAt = '2026-11-12T22:00:00.000Z'): Usage => ({ tier: 'free', limit: 10, remaining, resetsAt });

describe('parseUsage', () => {
  it('reads the usage object the service sends', () => {
    expect(parseUsage({ tier: 'pro', limit: 150, remaining: 149, resetsAt: '2026-11-12T22:00:00.000Z' })).toEqual({
      tier: 'pro',
      limit: 150,
      remaining: 149,
      resetsAt: '2026-11-12T22:00:00.000Z',
    });
  });

  it('is null for anything else, so a bad body never shows a wrong count', () => {
    for (const value of [null, undefined, 5, {}, { tier: 'gold', limit: 1, remaining: 0, resetsAt: '2026-11-12T22:00:00Z' }, { tier: 'free', limit: '10', remaining: 1, resetsAt: '2026-11-12T22:00:00Z' }, { tier: 'free', limit: 10, remaining: 1, resetsAt: 'soon' }]) {
      expect(parseUsage(value)).toBeNull();
    }
  });
});

describe('resetsText', () => {
  it('says midnight when the allowance comes back at the end of the local day', () => {
    // Local midnight in Kyiv is 22:00 UTC in November.
    expect(resetsText(new Date('2026-11-12T22:00:00Z'), now)).toBe('at midnight');
  });

  it('gives the local time later today, tomorrow, or a date further away', () => {
    const later = new Date('2026-11-12T15:30:00');
    expect(resetsText(later, now)).toBe(`at ${time(later)}`);
    const tomorrow = new Date('2026-11-13T09:15:00');
    expect(resetsText(tomorrow, now)).toBe(`tomorrow at ${time(tomorrow)}`);
    const away = new Date('2026-11-17T08:00:00');
    expect(resetsText(away, now)).toBe(`on ${away.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} at ${time(away)}`);
  });
});

describe('remainingHint', () => {
  it('shows nothing while more than 3 are left', () => {
    expect(remainingHint(free(4), 'chat')).toBeNull();
    expect(remainingHint(free(9), 'plan')).toBeNull();
    expect(remainingHint(null, 'chat')).toBeNull();
  });

  it('counts what is left when 3 or fewer remain', () => {
    expect(remainingHint(free(3), 'chat')).toBe('3 coach messages left today.');
    expect(remainingHint(free(1), 'chat')).toBe('1 coach message left today.');
    expect(remainingHint({ ...free(1), limit: 2 }, 'plan')).toBe('1 new plan left this week.');
  });

  it('leaves the limit itself to the limit notice', () => {
    expect(remainingHint(free(0), 'chat')).toBeNull();
  });

  it('never shows Pro fair use as a count', () => {
    expect(remainingHint({ tier: 'pro', limit: 150, remaining: 2, resetsAt: '2026-11-12T22:00:00Z' }, 'chat')).toBeNull();
  });
});

describe('limitNotice', () => {
  it('is null until the allowance is used up, and again once it has come back', () => {
    expect(limitNotice(free(1), 'chat', now)).toBeNull();
    expect(limitNotice(free(0), 'chat', new Date('2026-11-13T00:00:01'))).toBeNull();
    expect(limitNotice(null, 'chat', now)).toBeNull();
  });

  it('says calmly when coach messages come back and mentions Pro once', () => {
    expect(limitNotice(free(0), 'chat', now)).toEqual({
      text: 'You have used today’s coach messages. They come back at midnight.',
      pro: 'Pro raises this limit.',
    });
  });

  it('says when the next new plan can be made', () => {
    const at = new Date('2026-11-17T08:00:00');
    const notice = limitNotice({ tier: 'free', limit: 2, remaining: 0, resetsAt: at.toISOString() }, 'plan', now);
    expect(notice?.text).toBe(`You have used this week’s new plans. The next one can be made ${resetsText(at, now)}.`);
    expect(notice?.pro).toBe('Pro raises this limit.');
  });

  it('does not offer Pro to someone who has it', () => {
    const notice = limitNotice({ tier: 'pro', limit: 150, remaining: 0, resetsAt: '2026-11-12T22:00:00Z' }, 'chat', now);
    expect(notice).toEqual({ text: 'You have reached today’s limit for the coach. It comes back at midnight.', pro: null });
    const plans = limitNotice({ tier: 'pro', limit: 20, remaining: 0, resetsAt: '2026-11-13T09:15:00' }, 'plan', now);
    expect(plans?.pro).toBeNull();
    expect(plans?.text).toMatch(/^You have reached the limit for new plans for now\. The next one can be made tomorrow at /);
  });
});
