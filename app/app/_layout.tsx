import "react-native-get-random-values"; // must be first (for uuid)
import React, { useEffect, useRef } from "react";
import { Stack, router, useRootNavigationState } from "expo-router";
import * as Notifications from "expo-notifications";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ThemeProvider } from "@src/theme/ThemeProvider";
import { initScheduler } from "@src/lib/scheduler";

// Handles both: (1) app was backgrounded and user tapped notification,
// and (2) app was cold-started by notification tap. We gate the
// navigation on `useRootNavigationState().key` so we never call
// router.push() before the root <Stack> has mounted.
function useNotificationDeepLink() {
  const navState = useRootNavigationState();
  const ready = !!navState?.key;
  const pendingSessionIdRef = useRef<string | null>(null);

  // Subscribe to notification responses on mount, but only enqueue them
  // (we navigate from a separate effect that fires once the navigator is ready).
  useEffect(() => {
    let mounted = true;

    const enqueue = (
      response: Notifications.NotificationResponse | null | undefined,
    ) => {
      if (!response || !mounted) return;
      const data = response.notification.request.content.data as
        | { sessionId?: string }
        | undefined;
      if (data?.sessionId) {
        pendingSessionIdRef.current = data.sessionId;
      }
    };

    Notifications.getLastNotificationResponseAsync()
      .then(enqueue)
      .catch(() => {});

    const sub = Notifications.addNotificationResponseReceivedListener(enqueue);

    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  // Drain the pending sessionId once the root navigator is ready.
  useEffect(() => {
    if (!ready) return;
    const id = pendingSessionIdRef.current;
    if (id) {
      pendingSessionIdRef.current = null;
      router.push(`/plan/preview/${id}`);
    }
  }, [ready]);
}

export default function RootLayout() {
  useNotificationDeepLink();

  useEffect(() => {
    initScheduler().catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "transparent" },
          }}
        />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
