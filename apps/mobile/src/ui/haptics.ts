import * as Haptics from 'expo-haptics';

/**
 * Small taps of feedback. Haptics are a nicety: a device or test run without them must never
 * fail because of it, so every call swallows its own error.
 */
const safely = (run: () => Promise<void>) => {
  try {
    void run().catch(() => undefined);
  } catch {
    // No haptics engine here.
  }
};

export const haptic = {
  /** A light tap for a main action. */
  press: () => safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** The tick of choosing an option. */
  select: () => safely(() => Haptics.selectionAsync()),
  /** A firmer tap when the session moves to the next step. */
  step: () => safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** A session finished. */
  success: () => safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
};
