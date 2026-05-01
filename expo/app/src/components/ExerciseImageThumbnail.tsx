// src/components/ExerciseImageThumbnail.tsx

import React from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { useTheme } from "@src/theme/ThemeProvider";
import { getExerciseImages } from "@src/lib/exerciseImages";

interface ExerciseImageThumbnailProps {
  exerciseId: string;
  step?: number; // 0-indexed, defaults to 0 (first step / starting position)
  size?: number; // pixel size, defaults to 48
}

export function ExerciseImageThumbnail({
  exerciseId,
  step = 0,
  size = 48,
}: ExerciseImageThumbnailProps) {
  const theme = useTheme();
  const images = getExerciseImages(exerciseId);
  const source = images.getStep(step);

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.surfaceAlt,
        },
      ]}
    >
      <Image
        source={source}
        style={{ width: size, height: size, borderRadius: theme.radius.md }}
        contentFit="contain"
        transition={200}
      />
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
