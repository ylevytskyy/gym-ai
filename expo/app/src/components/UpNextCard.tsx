import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Card } from "./Card";
import { Button } from "./Button";
import { useTheme } from "@src/theme/ThemeProvider";
import type { Session } from "@src/types";
import { useTranslation } from "react-i18next";
import { formatTimeWindow } from "@src/lib/dates";
import type { NextUpResult } from "@src/lib/session-picker";
import { ExerciseImageThumbnail } from "./ExerciseImageThumbnail";
import { getExerciseImages } from "@src/lib/exerciseImages";

interface UpNextCardProps {
  nextUp: NextUpResult;
  onStart: (session: Session) => void;
  onPostpone: (session: Session) => void;
}

export function UpNextCard({ nextUp, onStart, onPostpone }: UpNextCardProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { session, reason, minutesUntilStart } = nextUp;

  const firstExerciseId = session.blocks[0]?.exercises[0]?.exercise_id ?? null;
  const showThumb =
    firstExerciseId !== null && getExerciseImages(firstExerciseId).hasImages;

  const status =
    reason === "now"
      ? t('upNext.rightNow')
      : reason === "soon"
        ? t('upNext.inMinutes', { minutes: minutesUntilStart })
        : t('upNext.startsAt', { time: session.time_window.earliest });

  return (
    <Card>
      <View style={styles.head}>
        <Text style={[styles.eyebrow, { color: theme.colors.primary }]}>
          {t('upNext.eyebrow')} · {status}
        </Text>
      </View>
      <Text
        style={[
          styles.title,
          { color: theme.colors.text, marginTop: theme.spacing.xs },
        ]}
      >
        {t(`enums:sessionTypes.${session.type}`)}
      </Text>
      {showThumb && firstExerciseId ? (
        <View style={{ alignItems: "center", marginTop: theme.spacing.md }}>
          <ExerciseImageThumbnail exerciseId={firstExerciseId} size={72} />
        </View>
      ) : null}
      <View style={styles.metaRow}>
        <Meta
          icon="time-outline"
          text={`${session.duration_minutes} min`}
          color={theme.colors.textMuted}
        />
        <Meta
          icon="flame-outline"
          text={`~${Math.round(session.estimated_calories_total)} kcal`}
          color={theme.colors.textMuted}
        />
        <Meta
          icon="hourglass-outline"
          text={formatTimeWindow(session.time_window)}
          color={theme.colors.textMuted}
        />
      </View>
      <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.lg }}>
        <View style={{ flex: 1 }}>
          <Button
            label={t('upNext.start')}
            onPress={() => onStart(session)}
            leftIcon={<Ionicons name="play" size={16} color={theme.colors.textInverse} />}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label={t('upNext.postpone')}
            onPress={() => onPostpone(session)}
            variant="secondary"
            leftIcon={<Ionicons name="time-outline" size={16} color={theme.colors.text} />}
          />
        </View>
      </View>
    </Card>
  );
}

function Meta({
  icon,
  text,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  color: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginRight: 14 }}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={{ color, fontSize: 13, marginLeft: 4 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center" },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 10,
  },
});
