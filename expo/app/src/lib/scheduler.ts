// All expo-notifications interaction lives here. The rest of the app calls
// these functions; it does not import expo-notifications directly.

import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import type { Session, WorkoutPlan } from "@src/types";
import { timeOnDay } from "./dates";
import { i18n } from "@src/i18n";

const NOTIF_MAP_KEY = "@fitness/notification-map";
const CHANNEL_ID = "fitness-reminders";

type NotifMap = Record<string, string>; // sessionId → notification identifier

// ─── setup ────────────────────────────────────────────────────────────────

let initialized = false;

export async function initScheduler(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // iOS in-app behavior when a notification arrives while the app is open.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Fitness reminders",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#ff7a59",
    });
  }
}

export async function requestPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

// ─── map persistence ──────────────────────────────────────────────────────

async function loadMap(): Promise<NotifMap> {
  const raw = await AsyncStorage.getItem(NOTIF_MAP_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as NotifMap;
  } catch {
    return {};
  }
}

async function saveMap(map: NotifMap): Promise<void> {
  await AsyncStorage.setItem(NOTIF_MAP_KEY, JSON.stringify(map));
}

// ─── scheduling ───────────────────────────────────────────────────────────

export interface ScheduleInput {
  session: Session;
  dayDate: string; // YYYY-MM-DD
  planId: string;
}

async function scheduleOne({
  session,
  dayDate,
  planId,
}: ScheduleInput): Promise<string | null> {
  const fireAt = timeOnDay(dayDate, session.time_window.earliest);
  if (fireAt.getTime() <= Date.now() + 5_000) return null;

  const typeLabel = i18n.t(`enums:sessionTypes.${session.type}`);
  const kcal = Math.round(session.estimated_calories_total);
  const body = i18n.t('notifications.body', {
    duration: session.duration_minutes,
    kcal,
    windowClose: session.time_window.latest,
  });

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: i18n.t('notifications.title', { sessionType: typeLabel }),
      body,
      data: { sessionId: session.session_id, planId },
      sound: "default",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
      channelId: CHANNEL_ID,
    },
  });
  return id;
}

export async function cancelAll(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await saveMap({});
}

export async function cancelSession(sessionId: string): Promise<void> {
  const map = await loadMap();
  const id = map[sessionId];
  if (id) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      // swallow — may already be gone
    }
    delete map[sessionId];
    await saveMap(map);
  }
}

// Schedule all required + preferred sessions in the plan from today forward.
export async function rescheduleAll(plan: WorkoutPlan): Promise<void> {
  await initScheduler();
  await cancelAll();

  const granted = await requestPermission();
  if (!granted) return;

  const map: NotifMap = {};
  const planId = plan.plan.id;

  for (const day of plan.plan.days) {
    for (const session of day.sessions) {
      if (session.priority === "optional") continue;
      if (
        session.execution.status === "completed" ||
        session.execution.status === "skipped"
      )
        continue;
      const id = await scheduleOne({
        session,
        dayDate: day.date,
        planId,
      });
      if (id) {
        map[session.session_id] = id;
      }
    }
  }

  await saveMap(map);
}

// Re-schedule a single session (used on postpone).
export async function rescheduleSession(
  session: Session,
  dayDate: string,
  planId: string,
): Promise<void> {
  await initScheduler();
  await cancelSession(session.session_id);
  if (session.priority === "optional") return;
  const id = await scheduleOne({ session, dayDate, planId });
  if (id) {
    const map = await loadMap();
    map[session.session_id] = id;
    await saveMap(map);
  }
}
