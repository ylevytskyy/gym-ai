import React from "react";
import { View, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { useProfileStore } from "@src/store/profileStore";
import { useTheme } from "@src/theme/ThemeProvider";

// Use <Redirect> rather than imperative router.replace() in a useEffect:
// the imperative API can fire before the root <Stack> has finished its first
// commit, which throws "Attempted to navigate before mounting the Root
// Layout component". <Redirect> is declarative and integrates with
// expo-router's mount lifecycle.
export default function IndexGate() {
  const theme = useTheme();
  const hasHydrated = useProfileStore.persist?.hasHydrated() ?? false;
  const profile = useProfileStore((s) => s.profile);

  if (!hasHydrated) {
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

  if (profile) {
    return <Redirect href="/(tabs)" />;
  }
  return <Redirect href="/onboarding/welcome" />;
}
