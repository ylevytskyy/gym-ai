import "react-native-get-random-values"; // must be first (for uuid)
import React, { useEffect } from "react";
import { Stack, router } from "expo-router";
import * as Notifications from "expo-notifications";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ThemeProvider } from "@src/theme/ThemeProvider";
import { initScheduler } from "@src/lib/scheduler";

// Handles both: (1) app was backgrounded and user tapped notification,
// and (2) app was cold-started by notification tap.
function useNotificationDeepLink() {
  useEffect(() => {
    let mounted = true;

    const handleResponse = (
      response: Notifications.NotificationResponse | null | undefined,
    ) => {
      if (!response || !mounted) return;
      const data = response.notification.request.content.data as
        | { sessionId?: string }
        | undefined;
      if (data?.sessionId) {
        router.push(`/plan/preview/${data.sessionId}`);
      }
    };

    // Cold-start path
    Notifications.getLastNotificationResponseAsync()
      .then(handleResponse)
      .catch(() => {});

    // Live path
    const sub = Notifications.addNotificationResponseReceivedListener(
      handleResponse,
    );

    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
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
