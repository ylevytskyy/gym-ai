import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Screen } from "@src/components/Screen";
import { Card } from "@src/components/Card";
import { Button } from "@src/components/Button";
import { useTheme } from "@src/theme/ThemeProvider";
import { usePlanStore } from "@src/store/planStore";
import { findSessionInPlan } from "@src/lib/session-picker";
import { exerciseById } from "@src/lib/catalog";
import {
  PRIORITY_LABELS,
  SESSION_TYPE_LABELS,
  type PlannedExercise,
} from "@src/types";
import { formatTimeWindow } from "@src/lib/dates";

export default function SessionPreview() {
  const theme = useTheme();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const plan = usePlanStore((s) => s.plan);

  const found = useMemo(() => {
    if (!plan || !sessionId) return null;
    return findSessionInPlan(plan.plan.days, sessionId);
  }, [plan, sessionId]);

  if (!plan || !found) {
    return (
      <Screen>
        <Text style={{ color: theme.colors.text, fontSize: 18 }}>
          Session not found.
        </Text>
        <Button
          label="Back"
          variant="ghost"
          onPress={() => router.back()}
          fullWidth={false}
        />
      </Screen>
    );
  }

  const { session } = found;

  const priorityColor =
    session.priority === "required"
      ? theme.colors.required
      : session.priority === "preferred"
        ? theme.colors.preferred
        : theme.colors.optional;

  return (
    <Screen scrollable>
      <Text style={[styles.title, { color: theme.colors.text }]}>
        {SESSION_TYPE_LABELS[session.type]}
      </Text>
      <View style={[styles.metaRow, { marginTop: 4 }]}>
        <View
          style={[
            styles.pill,
            {
              backgroundColor: priorityColor + "22",
              borderRadius: theme.radius.pill,
            },
          ]}
        >
          <Text style={{ color: priorityColor, fontWeight: "700", fontSize: 11 }}>
            {PRIORITY_LABELS[session.priority].toUpperCase()}
          </Text>
        </View>
        <Text style={{ color: theme.colors.textMuted, marginLeft: 8 }}>
          {formatTimeWindow(session.time_window)} · {session.duration_minutes} min · ~{Math.round(
            session.estimated_calories_total,
          )} kcal · {session.intensity} intensity
        </Text>
      </View>

      {session.blocks.map((block, bIdx) => (
        <View key={bIdx} style={{ marginTop: 16 }}>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontSize: 11,
              fontWeight: "700",
              letterSpacing: 0.8,
              marginBottom: 6,
            }}
          >
            {block.block_type.toUpperCase()} · {block.rounds}{" "}
            {block.rounds === 1 ? "round" : "rounds"}
          </Text>
          <Card>
            {block.exercises.map((ex, eIdx) => (
              <ExerciseRow
                key={`${bIdx}-${eIdx}`}
                ex={ex}
                isLast={eIdx === block.exercises.length - 1}
              />
            ))}
          </Card>
        </View>
      ))}

      <View style={{ marginTop: 24, marginBottom: 24 }}>
        <Button
          label="Start Workout"
          size="lg"
          onPress={() => router.push(`/workout/${session.session_id}`)}
          leftIcon={
            <Ionicons name="play" size={18} color={theme.colors.textInverse} />
          }
        />
      </View>
    </Screen>
  );
}

function ExerciseRow({
  ex,
  isLast,
}: {
  ex: PlannedExercise;
  isLast: boolean;
}) {
  const theme = useTheme();
  const catEx = exerciseById(ex.exercise_id);
  const [open, setOpen] = useState(false);
  if (!catEx) {
    return (
      <Text style={{ color: theme.colors.danger }}>
        Unknown exercise: {ex.exercise_id}
      </Text>
    );
  }
  const amountLabel =
    ex.unit === "reps"
      ? `${ex.amount} reps`
      : ex.unit === "seconds"
        ? `${ex.amount}s`
        : `${ex.amount} m climbed`;

  return (
    <View
      style={{
        paddingVertical: 10,
        borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.border,
      }}
    >
      <Pressable
        onPress={() => setOpen(!open)}
        style={{ flexDirection: "row", alignItems: "center" }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: theme.colors.text,
              fontSize: 15,
              fontWeight: "600",
            }}
          >
            {catEx.name}
          </Text>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontSize: 13,
              marginTop: 2,
            }}
          >
            {ex.sets} × {amountLabel} · rest {ex.rest_seconds}s · ~
            {Math.round(ex.estimated_calories)} kcal
          </Text>
        </View>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={18}
          color={theme.colors.textMuted}
        />
      </Pressable>
      {open ? (
        <View
          style={{
            marginTop: 8,
            borderLeftWidth: 3,
            borderLeftColor: theme.colors.primary + "55",
            paddingLeft: 10,
          }}
        >
          {catEx.instructions.map((step, i) => (
            <Text
              key={i}
              style={{
                color: theme.colors.text,
                fontSize: 13,
                lineHeight: 18,
                marginTop: 2,
              }}
            >
              {i + 1}. {step}
            </Text>
          ))}
          {catEx.common_mistakes.length > 0 ? (
            <Text
              style={{
                color: theme.colors.warning,
                fontSize: 12,
                marginTop: 6,
                fontStyle: "italic",
              }}
            >
              Watch out: {catEx.common_mistakes.join(", ")}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: "700", marginTop: 4 },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  pill: { paddingHorizontal: 10, paddingVertical: 4 },
});
