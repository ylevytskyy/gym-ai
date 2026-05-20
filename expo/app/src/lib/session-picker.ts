// Picks the "next up" session on a day, honoring time windows and gaps.

import type { Day, Session } from "@src/types";
import { timeOnDay, windowContainsNow } from "./dates";

export interface NextUpResult {
  session: Session;
  reason: "now" | "soon" | "later";
  minutesUntilStart: number; // 0 if already within window
}

function isComplete(s: Session): boolean {
  return (
    s.execution.status === "completed" || s.execution.status === "skipped"
  );
}

// Rank sessions by priority (required > preferred > optional).
const PRIORITY_RANK: Record<Session["priority"], number> = {
  required: 0,
  preferred: 1,
  optional: 2,
};

export function pickNextUp(day: Day, now: Date = new Date()): NextUpResult | null {
  if (day.is_rest_day) return null;

  const candidates = day.sessions
    .filter((s) => !isComplete(s))
    .map((s) => {
      const startDate = timeOnDay(day.date, s.time_window.earliest);
      const endDate = timeOnDay(day.date, s.time_window.latest);
      const inWindow = windowContainsNow(day.date, s.time_window, now);
      const expired = now.getTime() > endDate.getTime();
      const minutesUntil = Math.max(
        0,
        Math.round((startDate.getTime() - now.getTime()) / 60000),
      );
      return { s, startDate, endDate, inWindow, expired, minutesUntil };
    })
    .filter((c) => !c.expired);

  if (candidates.length === 0) return null;

  // Prefer in-window; among those, prefer higher priority; among those, earliest start
  const inWindow = candidates.filter((c) => c.inWindow);
  if (inWindow.length > 0) {
    inWindow.sort(
      (a, b) =>
        PRIORITY_RANK[a.s.priority] - PRIORITY_RANK[b.s.priority] ||
        a.startDate.getTime() - b.startDate.getTime(),
    );
    const best = inWindow[0];
    return {
      session: best.s,
      reason: "now",
      minutesUntilStart: 0,
    };
  }

  // Otherwise pick soonest upcoming
  candidates.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const best = candidates[0];
  return {
    session: best.s,
    reason: best.minutesUntil <= 30 ? "soon" : "later",
    minutesUntilStart: best.minutesUntil,
  };
}

export function findSessionInPlan(
  days: Day[],
  sessionId: string,
): { session: Session; day: Day } | null {
  for (const day of days) {
    for (const session of day.sessions) {
      if (session.session_id === sessionId) return { session, day };
    }
  }
  return null;
}
