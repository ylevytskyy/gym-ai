import React, { useCallback, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image, ImageSource } from "expo-image";
import { useTheme } from "@src/theme/ThemeProvider";
import { getExerciseImages } from "@src/lib/exerciseImages";
import { exerciseText } from "@src/lib/catalog";
import { useTranslation } from "react-i18next";

interface ExerciseImageCarouselProps {
  exerciseId: string;
  activeStep?: number;              // controlled mode (0-indexed)
  onStepChange?: (step: number) => void;
}

const THUMB_SIZE = 52;
const THUMB_GAP = 6;
const DETAIL_SIZE = 220;

export function ExerciseImageCarousel({
  exerciseId,
  activeStep,
  onStepChange,
}: ExerciseImageCarouselProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const images = getExerciseImages(exerciseId);
  const text = exerciseText(exerciseId);

  const [internalStep, setInternalStep] = useState(0);
  const current = activeStep ?? internalStep;

  const allSteps = images.allSteps();
  const instructions = text.instructions;

  const selectStep = useCallback(
    (index: number) => {
      setInternalStep(index);
      onStepChange?.(index);
    },
    [onStepChange],
  );

  const renderThumb = useCallback(
    ({ item, index }: { item: ImageSource; index: number }) => {
      const isActive = index === current;
      return (
        <Pressable onPress={() => selectStep(index)}>
          <View
            style={[
              styles.thumb,
              {
                borderColor: isActive
                  ? theme.colors.primary
                  : theme.colors.border,
                borderWidth: isActive ? 2 : 1,
                borderRadius: theme.radius.sm,
                backgroundColor: theme.colors.surfaceAlt,
              },
            ]}
          >
            <Image
              source={item}
              style={styles.thumbImage}
              contentFit="contain"
            />
          </View>
        </Pressable>
      );
    },
    [current, theme, selectStep],
  );

  // Don't show thumbnail strip if only placeholder (no real images)
  const showThumbs = images.hasImages && allSteps.length > 1;

  return (
    <View style={styles.container}>
      {showThumbs ? (
        <FlatList
          data={allSteps}
          renderItem={renderThumb}
          keyExtractor={(_, i) => String(i)}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbList}
          ItemSeparatorComponent={() => <View style={{ width: THUMB_GAP }} />}
        />
      ) : null}

      <View
        style={[
          styles.detailContainer,
          {
            backgroundColor: theme.colors.surfaceAlt,
            borderRadius: theme.radius.lg,
          },
        ]}
      >
        <Image
          source={allSteps[current] ?? allSteps[0]}
          style={styles.detailImage}
          contentFit="contain"
          transition={150}
        />
      </View>

      {images.hasImages && instructions[current] ? (
        <View style={styles.stepTextContainer}>
          <Text
            style={[styles.stepLabel, { color: theme.colors.primary }]}
          >
            {t("workout.stepOf", {
              current: current + 1,
              total: allSteps.length,
            })}
          </Text>
          <Text
            style={[styles.stepText, { color: theme.colors.textMuted }]}
            numberOfLines={3}
          >
            {instructions[current]}
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
  thumbList: {
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbImage: {
    width: THUMB_SIZE - 6,
    height: THUMB_SIZE - 6,
  },
  detailContainer: {
    width: DETAIL_SIZE,
    height: DETAIL_SIZE,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  detailImage: {
    width: DETAIL_SIZE - 16,
    height: DETAIL_SIZE - 16,
  },
  stepTextContainer: {
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
