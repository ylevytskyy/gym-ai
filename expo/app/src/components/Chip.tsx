import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { useTheme } from "@src/theme/ThemeProvider";

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  color?: string;
}

export function Chip({ label, selected, onPress, color }: ChipProps) {
  const theme = useTheme();
  const accent = color ?? theme.colors.primary;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: selected ? accent : theme.colors.border,
          backgroundColor: selected ? accent : theme.colors.surface,
          opacity: pressed ? 0.85 : 1,
          borderRadius: theme.radius.pill,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.sm,
        },
      ]}
    >
      <Text
        style={{
          color: selected ? theme.colors.textInverse : theme.colors.text,
          fontWeight: "600",
          fontSize: 14,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    alignSelf: "flex-start",
  },
});
