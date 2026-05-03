import "react-native-get-random-values"; // must be first (for uuid)
import React, { useEffect, useRef, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { Stack, router, useRootNavigationState } from "expo-router";
import * as Notifications from "expo-notifications";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ThemeProvider, useTheme } from "@src/theme/ThemeProvider";
import { initScheduler } from "@src/lib/scheduler";
import { initI18n } from "@src/i18n";
import { useSettingsStore } from "@src/store/settingsStore";
import { useInitAuth } from "@src/store/authStore";

// Handles both: (1) app was backgrounded and user tapped notification,
// and (2) app was cold-started by notification tap. We gate the
// navigation on `useRootNavigationState().key` so we never call
// router.push() before the root <Stack> has mounted.
function useNotificationDeepLink() {
  const navState = useRootNavigationState();
  const ready = !!navState?.key;
  const pendingSessionIdRef = useRef<string | null>(null);

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

  useEffect(() => {
    if (!ready) return;
    const id = pendingSessionIdRef.current;
    if (id) {
      pendingSessionIdRef.current = null;
      router.push(`/plan/preview/${id}`);
    }
  }, [ready]);
}

function Splash() {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ActivityIndicator color={theme.colors.primary} />
    </View>
  );
}

export default function RootLayout() {
  useInitAuth();
  useNotificationDeepLink();
  const languagePref = useSettingsStore((s) => s.language);
  const [i18nReady, setI18nReady] = useState(false);

  useEffect(() => {
    initI18n(languagePref)
      .then(() => setI18nReady(true))
      .catch(() => setI18nReady(true)); // fail-open: worst case, keys render
    // languagePref is read once at mount; subsequent changes are handled by
    // settingsStore.setLanguage -> i18n.changeLanguage directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    initScheduler().catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        {i18nReady ? (
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: "transparent" },
            }}
          />
        ) : (
          <Splash />
        )}
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
