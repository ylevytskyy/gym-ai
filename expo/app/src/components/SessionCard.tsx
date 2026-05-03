import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@src/theme/ThemeProvider";
import { formatTimeWindow } from "@src/lib/dates";
import type { Session, SessionType } from "@src/types";
import { useTranslation } from "react-i18next";
import { ExerciseImageThumbnail } from "./ExerciseImageThumbnail";
import { getExerciseImages } from "@src/lib/exerciseImages";

interface SessionCardProps {
  session: Session;
  onPress: () => void;
}

const ICON_BY_TYPE: Record<SessionType, keyof typeof Ionicons.glyphMap> = {
  main_workout: "barbell-outline",
  desk_break: "cafe-outline",
  stair_cardio: "trending-up-outline",
  stretching: "body-outline",
};

export function SessionCard({ session, onPress }: SessionCardProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  const priorityColor =
    session.priority === "required"
      ? theme.colors.required
      : session.priority === "preferred"
        ? theme.colors.preferred
        : theme.colors.optional;

  const done =
    session.execution.status === "completed" ||
    session.execution.status === "skipped";

  const firstExerciseId = session.blocks[0]?.exercises[0]?.exercise_id ?? null;
  const showThumb =
    firstExerciseId !== null && getExerciseImages(firstExerciseId).hasImages;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
          padding: theme.spacing.md,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={styles.row}>
        {showThumb && firstExerciseId ? (
          <ExerciseImageThumbnail exerciseId={firstExerciseId} size={44} />
        ) : (
          <View
            style={[
              styles.iconBg,
              {
                backgroundColor: theme.colors.surfaceAlt,
                borderRadius: theme.radius.md,
              },
            ]}
          >
            <Ionicons
              name={ICON_BY_TYPE[session.type]}
              size={22}
              color={priorityColor}
            />
          </View>
        )}
        <View style={{ flex: 1, marginLeft: theme.spacing.md }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={[styles.title, { color: theme.colors.text }]}>
              {t(`enums:sessionTypes.${session.type}`)}
            </Text>
            {done ? (
              <Ionicons
                name="checkmark-circle"
                size={18}
                color={theme.colors.success}
                style={{ marginLeft: 6 }}
              />
            ) : null}
          </View>
          <Text
            style={[styles.subtitle, { color: theme.colors.textMuted }]}
            numberOfLines={1}
          >
            {formatTimeWindow(session.time_window)} · {session.duration_minutes} min ·{" "}
            ~{Math.round(session.estimated_calories_total)} kcal
          </Text>
        </View>
        <View
          style={[
            styles.pill,
            {
              backgroundColor: priorityColor + "22",
              borderRadius: theme.radius.pill,
            },
          ]}
        >
          <Text style={[styles.pillText, { color: priorityColor }]}>
            {t(`enums:priorities.${session.priority}`)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center" },
  iconBg: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 16, fontWeight: "700" },
  subtitle: { fontSize: 13, marginTop: 2 },
  pill: { paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.4 },
});
