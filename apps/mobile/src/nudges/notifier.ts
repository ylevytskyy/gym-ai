/** The one surface the app uses for sitting-nudge notifications; the notification library sits behind it. */

export type NotificationPermission = 'granted' | 'denied' | 'undetermined';

export interface Notifier {
  permission(): Promise<NotificationPermission>;
  /** Shows the system request when it still can be shown; resolves to the answer. */
  request(): Promise<NotificationPermission>;
  /** Schedules one sitting nudge for `at`. */
  schedule(at: Date): Promise<void>;
  /**
   * Cancels the sitting nudges that have not been shown yet: all of them, or with `from` only
   * the ones planned for that moment or later. A nudge whose time has passed may still be on
   * its way (phones show them late), and with `from` it is left alone.
   */
  cancel(from?: Date): Promise<void>;
  /** Calls the handler when the user taps a sitting nudge, also the one that opened the app. Returns a stop function. */
  onTap(handler: () => void): () => void;
}

export interface FakeNotifier extends Notifier {
  /** Nudges waiting to be shown, oldest first. */
  readonly scheduled: Date[];
  requests: number;
  cancels: number;
  /** The user taps a nudge. */
  tap(): void;
}

/** An in-memory notifier for tests. */
export function createFakeNotifier(
  options: {
    initial?: NotificationPermission;
    answer?: NotificationPermission;
    scheduleFails?: boolean;
    /** The clock: a nudge whose time has passed was shown and is no longer waiting. */
    now?: () => Date;
    /** How late the phone shows a nudge, in ms (default 0). */
    lateMs?: number;
  } = {},
): FakeNotifier {
  let current = options.initial ?? 'undetermined';
  let waiting: Date[] = [];
  const tapHandlers = new Set<() => void>();
  const notifier: FakeNotifier = {
    get scheduled() {
      const now = options.now?.().getTime() ?? Number.NEGATIVE_INFINITY;
      waiting = waiting.filter((at) => at.getTime() + (options.lateMs ?? 0) >= now);
      return waiting;
    },
    requests: 0,
    cancels: 0,
    async permission() {
      return current;
    },
    async request() {
      notifier.requests += 1;
      if (current === 'undetermined') current = options.answer ?? 'granted';
      return current;
    },
    async schedule(at) {
      if (options.scheduleFails) throw new Error('cannot schedule');
      waiting.push(at);
      waiting.sort((a, b) => a.getTime() - b.getTime());
    },
    onTap(handler) {
      tapHandlers.add(handler);
      return () => void tapHandlers.delete(handler);
    },
    tap() {
      tapHandlers.forEach((handler) => handler());
    },
    async cancel(from) {
      notifier.cancels += 1;
      waiting = from ? notifier.scheduled.filter((at) => at.getTime() < from.getTime()) : [];
    },
  };
  return notifier;
}
