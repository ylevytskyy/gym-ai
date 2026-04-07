import React, { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { useProfileStore } from "@src/store/profileStore";
import { useTheme } from "@src/theme/ThemeProvider";

export default function IndexGate() {
  const theme = useTheme();
  const hasHydrated = useProfileStore.persist?.hasHydrated();
  const profile = useProfileStore((s) => s.profile);

  useEffect(() => {
    if (!hasHydrated) return;
    if (profile) {
      router.replace("/(tabs)");
    } else {
      router.replace("/onboarding/welcome");
    }
  }, [hasHydrated, profile]);

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
