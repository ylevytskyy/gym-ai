import React from "react";
import { Stack } from "expo-router";
import { useTheme } from "@src/theme/ThemeProvider";
import { HeaderBackButton } from "@src/components/HeaderBackButton";

export default function ExercisesLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { fontWeight: "700" },
        headerBackVisible: false,
        headerLeft: () => <HeaderBackButton />,
      }}
    />
  );
}
