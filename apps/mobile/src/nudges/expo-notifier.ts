/** Sitting nudges as local notifications. Nothing is sent to a server and no push token is requested. */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { NotificationPermission, Notifier } from './notifier';

const KIND = 'sitting-nudge';
const CHANNEL = 'sitting-nudges';
/** A time that has just passed is shown a moment from now rather than rejected. */
const LEAD_MS = 1000;

type Permissions = Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>;

function toPermission(permissions: Permissions): NotificationPermission {
  if (permissions.granted) return 'granted';
  return permissions.canAskAgain ? 'undetermined' : 'denied';
}

/** Android shows notifications through a channel, which must exist before the permission request. */
async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Break reminders',
    // AndroidImportance.DEFAULT: shown in the shade and the status bar, with the default sound of the channel.
    importance: 5 as Notifications.AndroidImportance,
  });
}

const isNudge = (data: unknown): boolean => typeof data === 'object' && data !== null && (data as Record<string, unknown>)['kind'] === KIND;

/** A nudge is shown as a banner also while the app is open; it never plays a sound or sets a badge. */
export function showNudgesInForeground(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

export function createExpoNotifier(): Notifier {
  return {
    async permission() {
      return toPermission(await Notifications.getPermissionsAsync());
    },

    async request() {
      await ensureChannel();
      const current = await Notifications.getPermissionsAsync();
      if (current.granted || !current.canAskAgain) return toPermission(current);
      return toPermission(await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: false, allowBadge: false } }));
    },

    async schedule(at) {
      await ensureChannel();
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Time for a short break',
          body: 'You have been sitting for a while. Two minutes of easy movement?',
          data: { kind: KIND, at: at.getTime() },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(Math.max(at.getTime(), Date.now() + LEAD_MS)),
          channelId: CHANNEL,
        },
      });
    },

    async cancel(from) {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      const planned = (data: unknown) => Number((data as Record<string, unknown>)['at']);
      await Promise.all(
        scheduled
          .filter((request) => isNudge(request.content.data) && !(from && planned(request.content.data) < from.getTime()))
          .map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)),
      );
    },

    onTap(handler) {
      const tapped = (response: Notifications.NotificationResponse | null) => {
        if (response && isNudge(response.notification.request.content.data)) handler();
      };
      try {
        // The tap that opened the app happened before anyone was listening.
        tapped(Notifications.getLastNotificationResponse());
        Notifications.clearLastNotificationResponse();
      } catch {
        // Not available on this platform.
      }
      const subscription = Notifications.addNotificationResponseReceivedListener(tapped);
      return () => subscription.remove();
    },
  };
}
