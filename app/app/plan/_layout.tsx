import { Stack } from "expo-router";
import { useTheme } from "@src/theme/ThemeProvider";

export default function PlanLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { color: theme.colors.text, fontWeight: "700" },
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="generate" options={{ title: "Generate Plan" }} />
      <Stack.Screen name="paste" options={{ title: "Paste Plan" }} />
      <Stack.Screen
        name="preview/[sessionId]"
        options={{ title: "Session Preview" }}
      />
    </Stack>
  );
}
