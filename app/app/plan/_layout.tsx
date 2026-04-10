import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@src/theme/ThemeProvider";

export default function PlanLayout() {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { color: theme.colors.text, fontWeight: "700" },
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="generate" options={{ title: t('plan.generateHeader') }} />
      <Stack.Screen name="paste" options={{ title: t('plan.pasteHeader') }} />
      <Stack.Screen
        name="preview/[sessionId]"
        options={{ title: t('plan.previewHeader') }}
      />
    </Stack>
  );
}
