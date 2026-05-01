// Auto-cycles through an exercise's step images at a fixed interval, looping
// forever. Shows the current step's instruction text below the image (to match
// the prior carousel UX). No interactive controls — the component plays for as
// long as it is mounted. Reusable from anywhere an exercise's images need to
// animate (detail screen, session previews, etc.).

import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { useTheme } from "@src/theme/ThemeProvider";
import { getExerciseImages } from "@src/lib/exerciseImages";
import { exerciseText } from "@src/lib/catalog";

interface ExerciseImagePlayerProps {
  exerciseId: string;
  /** Size in px of the square image area. Defaults to 220. */
  size?: number;
  /** Delay between frames in ms. Defaults to 1200. */
  delayMs?: number;
}

const DEFAULT_SIZE = 220;
const DEFAULT_DELAY_MS = 1200;

export function ExerciseImagePlayer({
  exerciseId,
  size = DEFAULT_SIZE,
  delayMs = DEFAULT_DELAY_MS,
}: ExerciseImagePlayerProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const images = getExerciseImages(exerciseId);
  const text = exerciseText(exerciseId);

  const frames = images.allSteps();
  const total = frames.length;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    // Reset when the exercise changes and only cycle when there are multiple
    // frames to show.
    setIndex(0);
    if (!images.hasImages || total <= 1) return;
    const handle = setInterval(() => {
      setIndex((i) => (i + 1) % total);
    }, delayMs);
    return () => clearInterval(handle);
  }, [exerciseId, total, delayMs, images.hasImages]);

  const currentStepText = images.hasImages ? text.instructions[index] : undefined;

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.imageBox,
          {
            width: size,
            height: size,
            backgroundColor: theme.colors.surfaceAlt,
            borderRadius: theme.radius.lg,
          },
        ]}
      >
        <Image
          source={frames[index] ?? frames[0]}
          style={{ width: size - 16, height: size - 16 }}
          contentFit="contain"
          transition={200}
        />
      </View>

      {currentStepText ? (
        <View style={styles.textWrap}>
          <Text style={[styles.stepLabel, { color: theme.colors.primary }]}>
            {t("workout.stepOf", { current: index + 1, total })}
          </Text>
          <Text
            style={[styles.stepText, { color: theme.colors.textMuted }]}
            numberOfLines={3}
          >
            {currentStepText}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  imageBox: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  textWrap: {
    marginTop: 8,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  stepText: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    textAlign: "center",
  },
});
