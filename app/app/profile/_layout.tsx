import { Stack } from "expo-router";
import { useTheme } from "@src/theme/ThemeProvider";

export default function ProfileLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { color: theme.colors.text, fontWeight: "700" },
      }}
    >
      <Stack.Screen name="edit" options={{ title: "Profile" }} />
    </Stack>
  );
}
