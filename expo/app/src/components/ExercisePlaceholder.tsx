// Layout-stable stand-in for ExerciseVideoPlayer. Shown on the detail screen
// when an exercise has no Blender render yet. Same 220×220 card, same radius,
// same surfaceAlt background — only the inner content differs (a single
// body-part-bucket icon instead of a video).

import React from "react";
import { StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@src/theme/ThemeProvider";

interface ExercisePlaceholderProps {
  bodyParts: string[];
  size?: number;
}

const ICON_BY_BUCKET = {
  legs: "walk-outline",
  core: "body-outline",
  upper: "barbell-outline",
  full_body: "fitness-outline",
  mobility: "accessibility-outline",
} as const;

type Bucket = keyof typeof ICON_BY_BUCKET;

const BUCKET_BY_BODY_PART: Record<string, Bucket> = {
  // legs
  calves: "legs",
  glutes: "legs",
  hamstrings: "legs",
  hip_flexors: "legs",
  hips: "legs",
  inner_thighs: "legs",
  quads: "legs",
  ankles: "legs",
  // core
  abs: "core",
  core: "core",
  obliques: "core",
  lower_back: "core",
  // upper
  chest: "upper",
  shoulders: "upper",
  triceps: "upper",
  upper_back: "upper",
  forearms: "upper",
  wrists: "upper",
  // full body
  full_body: "full_body",
  // mobility
  neck: "mobility",
  eyes: "mobility",
};

const FALLBACK_ICON: keyof typeof Ionicons.glyphMap = "fitness-outline";

export function ExercisePlaceholder({
  bodyParts,
  size = 220,
}: ExercisePlaceholderProps) {
  const theme = useTheme();
  const primary = bodyParts[0];
  const bucket = primary ? BUCKET_BY_BODY_PART[primary] : undefined;
  const icon: keyof typeof Ionicons.glyphMap = bucket
    ? ICON_BY_BUCKET[bucket]
    : FALLBACK_ICON;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: theme.radius.lg,
          backgroundColor: theme.colors.surfaceAlt,
        },
      ]}
    >
      <Ionicons name={icon} size={64} color={theme.colors.textMuted} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
});
