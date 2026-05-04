import React from "react";
import { Pressable } from "react-native";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { useTheme } from "@src/theme/ThemeProvider";

export function HeaderBackButton() {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace("/(tabs)");
        }
      }}
      accessibilityRole="button"
      accessibilityLabel={t("app.back")}
      hitSlop={12}
      style={{ paddingHorizontal: 4 }}
    >
      <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
    </Pressable>
  );
}
