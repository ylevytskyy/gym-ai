/**
 * The AI allowance as the assistant service reports it (docs/usage-limits-spec.md), and the words
 * the app uses for it. Counts show only when 3 or fewer are left; Pro fair use never shows a count.
 */

import { endOfDay, localDayOf } from '@/health/local-day';

export interface Usage {
  tier: 'free' | 'pro';
  limit: number;
  remaining: number;
  /** ISO time when uses come back. */
  resetsAt: string;
}

/** Coach messages (counted per local day) or new plans (counted over a rolling window). */
export type UsageKind = 'chat' | 'plan';

const HINT_FROM = 3;

export function parseUsage(value: unknown): Usage | null {
  if (!value || typeof value !== 'object') return null;
  const usage = value as Record<string, unknown>;
  if (usage['tier'] !== 'free' && usage['tier'] !== 'pro') return null;
  if (typeof usage['limit'] !== 'number' || typeof usage['remaining'] !== 'number') return null;
  if (typeof usage['resetsAt'] !== 'string' || Number.isNaN(Date.parse(usage['resetsAt']))) return null;
  return { tier: usage['tier'], limit: usage['limit'], remaining: usage['remaining'], resetsAt: usage['resetsAt'] };
}

const timeOf = (at: Date) => at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/** When the allowance comes back, in local time: "at midnight", "at 15:30", "tomorrow at 09:15", "on Tue, 17 Nov at 08:00". */
export function resetsText(at: Date, now: Date): string {
  const today = localDayOf(now);
  const midnight = endOfDay(today);
  if (Math.abs(at.getTime() - midnight.getTime()) < 60_000) return 'at midnight';
  const day = localDayOf(at);
  if (day === today) return `at ${timeOf(at)}`;
  if (day === localDayOf(midnight)) return `tomorrow at ${timeOf(at)}`;
  return `on ${at.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} at ${timeOf(at)}`;
}

/** "2 coach messages left today." when 3 or fewer free uses remain; otherwise nothing. */
export function remainingHint(usage: Usage | null | undefined, kind: UsageKind): string | null {
  if (!usage || usage.tier !== 'free' || usage.remaining <= 0 || usage.remaining > HINT_FROM) return null;
  const n = usage.remaining;
  return kind === 'chat' ? `${n} coach ${n === 1 ? 'message' : 'messages'} left today.` : `${n} new ${n === 1 ? 'plan' : 'plans'} left this week.`;
}

export interface LimitNotice {
  text: string;
  /** One quiet line about Pro for free users; null for Pro. */
  pro: string | null;
}

/** What to say while the allowance is used up; null when it is not, or once it has come back. */
export function limitNotice(usage: Usage | null | undefined, kind: UsageKind, now: Date): LimitNotice | null {
  if (!usage || usage.remaining > 0) return null;
  const at = new Date(usage.resetsAt);
  if (at.getTime() <= now.getTime()) return null;
  const when = resetsText(at, now);
  if (usage.tier === 'pro') {
    return {
      text: kind === 'chat' ? `You have reached today’s limit for the coach. It comes back ${when}.` : `You have reached the limit for new plans for now. The next one can be made ${when}.`,
      pro: null,
    };
  }
  return {
    text: kind === 'chat' ? `You have used today’s coach messages. They come back ${when}.` : `You have made the new plans this week allows. The next one can be made ${when}.`,
    pro: 'Pro raises this limit.',
  };
}
