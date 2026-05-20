import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { useTheme } from "@src/theme/ThemeProvider";
import { useSettingsStore } from "@src/store/settingsStore";
import * as Haptics from "expo-haptics";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: ViewStyle;
  fullWidth?: boolean;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  disabled,
  loading,
  leftIcon,
  rightIcon,
  style,
  fullWidth = true,
}: ButtonProps) {
  const theme = useTheme();
  const hapticsOn = useSettingsStore((s) => s.hapticsEnabled);

  const handlePress = () => {
    if (disabled || loading) return;
    if (hapticsOn) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onPress();
  };

  const palette = (() => {
    switch (variant) {
      case "primary":
        return {
          bg: theme.colors.primary,
          fg: theme.colors.textInverse,
          border: theme.colors.primary,
        };
      case "secondary":
        return {
          bg: theme.colors.surface,
          fg: theme.colors.text,
          border: theme.colors.border,
        };
      case "ghost":
        return {
          bg: "transparent",
          fg: theme.colors.primary,
          border: "transparent",
        };
      case "danger":
        return {
          bg: theme.colors.danger,
          fg: theme.colors.textInverse,
          border: theme.colors.danger,
        };
    }
  })();

  const padV = size === "lg" ? 16 : size === "md" ? 12 : 8;
  const padH = size === "lg" ? 24 : size === "md" ? 18 : 12;
  const fontSize = size === "lg" ? 17 : size === "md" ? 16 : 14;

  return (
    <Pressable
      disabled={disabled || loading}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          paddingVertical: padV,
          paddingHorizontal: padH,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          alignSelf: fullWidth ? "stretch" : "flex-start",
        },
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={palette.fg} />
        ) : (
          <>
            {leftIcon}
            <Text
              style={[
                styles.label,
                { color: palette.fg, fontSize },
                leftIcon ? { marginLeft: 8 } : null,
                rightIcon ? { marginRight: 8 } : null,
              ]}
            >
              {label}
            </Text>
            {rightIcon}
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontWeight: "600",
  },
});
