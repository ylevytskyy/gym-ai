import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@src/theme/ThemeProvider";
import { HeaderBackButton } from "@src/components/HeaderBackButton";

export default function ProfileLayout() {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { color: theme.colors.text, fontWeight: "700" },
        headerBackVisible: false,
        headerLeft: () => <HeaderBackButton />,
      }}
    >
      <Stack.Screen name="edit" options={{ title: t('profileEdit.headerTitle') }} />
    </Stack>
  );
}
