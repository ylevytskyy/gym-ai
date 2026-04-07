import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import * as Haptics from "expo-haptics";

import { Screen } from "@src/components/Screen";
import { Button } from "@src/components/Button";
import { ProgressRing } from "@src/components/ProgressRing";
import { useTheme } from "@src/theme/ThemeProvider";
import { usePlanStore } from "@src/store/planStore";
import { useProfileStore } from "@src/store/profileStore";
import { useSettingsStore } from "@src/store/settingsStore";
import { findSessionInPlan } from "@src/lib/session-picker";
import { buildRunnerSteps, countSetSteps, type RunnerStep } from "@src/lib/runner";
import { cancelSession } from "@src/lib/scheduler";
import { nowIso } from "@src/lib/dates";

export default function WorkoutRunner() {
  const theme = useTheme();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const plan = usePlanStore((s) => s.plan);
  const markExerciseExecution = usePlanStore((s) => s.markExerciseExecution);
  const markSessionExecution = usePlanStore((s) => s.markSessionExecution);
  const hapticsOn = useSettingsStore((s) => s.hapticsEnabled);
  const audioOn = useSettingsStore((s) => s.audioEnabled);
  const keepAwake = useSettingsStore((s) => s.keepAwakeEnabled);

  // Keep screen on during the workout. Hook must be called unconditionally;
  // we use the imperative API so we can respect the user's setting.
  useEffect(() => {
    if (!keepAwake) return;
    activateKeepAwakeAsync("workout-runner").catch(() => {});
    return () => {
      deactivateKeepAwake("workout-runner");
    };
  }, [keepAwake]);

  const found = useMemo(() => {
    if (!plan || !sessionId) return null;
    return findSessionInPlan(plan.plan.days, sessionId);
  }, [plan, sessionId]);

  const session = found?.session ?? null;

  const steps = useMemo<RunnerStep[]>(
    () => (session ? buildRunnerSteps(session) : []),
    [session],
  );
  const totalSets = useMemo(() => countSetSteps(steps), [steps]);

  const [stepIdx, setStepIdx] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [timerLeft, setTimerLeft] = useState(0);
  const [done, setDone] = useState(false);
  const startedAtRef = useRef<string>(nowIso());
  const stepStartRef = useRef<number>(Date.now());
  const setsCompleted = useRef(0);

  // ─── audio (stubs — sound files not yet bundled; settings toggle reserved)
  const playBeep = () => {
    // TODO: wire up expo-audio when countdown.mp3 / set-complete.mp3 are added
    void audioOn;
  };
  const playDing = () => {
    void audioOn;
  };

  // ─── haptics ───────────────────────────────────────────────────────
  const haptic = (style: Haptics.ImpactFeedbackStyle) => {
    if (!hapticsOn) return;
    Haptics.impactAsync(style).catch(() => {});
  };
  const success = () => {
    if (!hapticsOn) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );
  };

  // ─── no plan / session found ──────────────────────────────────────
  useEffect(() => {
    if (!session) return;
    markSessionExecution(session.session_id, {
      status: "partial",
      actual_start_time: startedAtRef.current,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = steps[stepIdx];

  // ─── countdown tick ────────────────────────────────────────────────
  useEffect(() => {
    if (done) return;
    if (!current || current.kind !== "countdown") return;
    setCountdown(3);
    let count = 3;
    const id = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdown(count);
        playBeep();
        haptic(Haptics.ImpactFeedbackStyle.Medium);
      } else {
        clearInterval(id);
        success();
        advance();
      }
    }, 800);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx, current?.kind]);

  // ─── timed-set tick ────────────────────────────────────────────────
  useEffect(() => {
    if (done) return;
    if (!current || current.kind !== "set" || current.unit !== "seconds")
      return;
    stepStartRef.current = Date.now();
    setTimerLeft(current.amount);
    const id = setInterval(() => {
      setTimerLeft((prev) => {
        const next = prev - 1;
        if (next === 3 || next === 2 || next === 1) {
          playBeep();
          haptic(Haptics.ImpactFeedbackStyle.Light);
        }
        if (next <= 0) {
          clearInterval(id);
          completeSet();
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx]);

  // ─── rest tick ─────────────────────────────────────────────────────
  useEffect(() => {
    if (done) return;
    if (!current || current.kind !== "rest") return;
    setTimerLeft(current.seconds);
    if (current.seconds <= 0) {
      advance();
      return;
    }
    const id = setInterval(() => {
      setTimerLeft((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          advance();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx]);

  // ─── helpers ───────────────────────────────────────────────────────
  const advance = () => {
    if (stepIdx + 1 >= steps.length) {
      finish();
    } else {
      setStepIdx(stepIdx + 1);
    }
  };

  const completeSet = () => {
    if (!session || !current || current.kind !== "set") return;
    const elapsed = Math.max(
      1,
      Math.round((Date.now() - stepStartRef.current) / 1000),
    );
    const prior =
      session.blocks[current.blockIdx].exercises[current.exIdx].execution;

    const amount =
      current.unit === "seconds" ? current.amount : current.amount;
    const nextAmounts = [...prior.actual_amount_per_set, amount];
    const actualWorkSec =
      current.unit === "seconds"
        ? (prior.actual_work_seconds || 0) + elapsed
        : (prior.actual_work_seconds || 0);

    const sessionsSetsForThisExercise = current.totalSets * current.totalRounds;
    const newSetsCompleted = Math.min(
      (prior.actual_sets_completed || 0) + 1,
      sessionsSetsForThisExercise,
    );
    const status =
      newSetsCompleted >= sessionsSetsForThisExercise ? "completed" : "partial";

    markExerciseExecution(session.session_id, current.blockIdx, current.exIdx, {
      status,
      actual_sets_completed: newSetsCompleted,
      actual_amount_per_set: nextAmounts,
      actual_work_seconds: actualWorkSec,
      completed_at: nowIso(),
    });

    setsCompleted.current += 1;
    success();
    playDing();
    advance();
  };

  const skipCurrent = () => {
    if (!current) return;
    if (current.kind === "set") {
      if (!session) return;
      const prior =
        session.blocks[current.blockIdx].exercises[current.exIdx].execution;
      const isLastSet =
        (prior.actual_sets_completed || 0) + 1 >=
        current.totalSets * current.totalRounds;
      if (isLastSet && prior.actual_sets_completed === 0) {
        markExerciseExecution(
          session.session_id,
          current.blockIdx,
          current.exIdx,
          {
            status: "skipped",
          },
        );
      }
    }
    advance();
  };

  const finish = async () => {
    if (!session) return;
    setDone(true);
    markSessionExecution(session.session_id, {
      status: "completed",
      actual_duration_minutes: Math.round(
        (Date.now() - new Date(startedAtRef.current).getTime()) / 60000,
      ),
    });
    await cancelSession(session.session_id);
  };

  // ─── exit handler ──────────────────────────────────────────────────
  const confirmExit = () => {
    Alert.alert(
      "Exit workout?",
      "Your progress so far will be saved.",
      [
        { text: "Keep going", style: "cancel" },
        {
          text: "Exit",
          style: "destructive",
          onPress: async () => {
            if (session) {
              markSessionExecution(session.session_id, {
                status: "partial",
                actual_duration_minutes: Math.round(
                  (Date.now() - new Date(startedAtRef.current).getTime()) /
                    60000,
                ),
              });
            }
            router.back();
          },
        },
      ],
    );
  };

  // ─── render ────────────────────────────────────────────────────────
  if (!session) {
    return (
      <Screen>
        <Text style={{ color: theme.colors.text }}>Session not found.</Text>
      </Screen>
    );
  }

  if (done) {
    return <SummaryScreen totalSets={totalSets} sessionId={session.session_id} />;
  }

  if (!current) return null;

  return (
    <Screen padded bottomSafeArea>
      <View style={styles.topRow}>
        <Pressable onPress={confirmExit} style={styles.exitBtn}>
          <Ionicons name="close" size={28} color={theme.colors.text} />
        </Pressable>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: 13,
            fontWeight: "700",
          }}
        >
          {setsCompleted.current} / {totalSets} sets
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={{ flex: 1, justifyContent: "center" }}>
        {current.kind === "countdown" ? (
          <CountdownView number={countdown} exerciseName={current.exerciseName} />
        ) : current.kind === "rest" ? (
          <RestView
            seconds={timerLeft}
            nextName={current.nextExerciseName}
            onSkip={advance}
          />
        ) : (
          <SetView
            step={current}
            secondsLeft={timerLeft}
            onDone={completeSet}
            onSkip={skipCurrent}
          />
        )}
      </View>
    </Screen>
  );
}

// ─── sub-components ────────────────────────────────────────────────

function CountdownView({
  number,
  exerciseName,
}: {
  number: number;
  exerciseName: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: "center" }}>
      <Text
        style={{ color: theme.colors.textMuted, fontSize: 14, fontWeight: "700" }}
      >
        GET READY
      </Text>
      <Text
        style={{
          color: theme.colors.text,
          fontSize: 22,
          fontWeight: "700",
          marginTop: 8,
          textAlign: "center",
        }}
      >
        {exerciseName}
      </Text>
      <Text
        style={{
          color: theme.colors.primary,
          fontSize: 148,
          fontWeight: "800",
          marginTop: 24,
        }}
      >
        {number}
      </Text>
    </View>
  );
}

function SetView({
  step,
  secondsLeft,
  onDone,
  onSkip,
}: {
  step: Extract<RunnerStep, { kind: "set" }>;
  secondsLeft: number;
  onDone: () => void;
  onSkip: () => void;
}) {
  const theme = useTheme();
  const progress =
    step.unit === "seconds" && step.amount > 0
      ? 1 - secondsLeft / step.amount
      : 0;

  return (
    <View style={{ alignItems: "center", paddingHorizontal: 12 }}>
      <Text
        style={{ color: theme.colors.textMuted, fontSize: 13, fontWeight: "700" }}
      >
        {step.totalRounds > 1
          ? `ROUND ${step.roundIdx + 1}/${step.totalRounds} · `
          : ""}
        SET {step.setIdx + 1} OF {step.totalSets}
      </Text>
      <Text
        style={{
          color: theme.colors.text,
          fontSize: 26,
          fontWeight: "700",
          marginTop: 8,
          textAlign: "center",
        }}
      >
        {step.exerciseName}
      </Text>

      <View style={{ marginTop: 32 }}>
        {step.unit === "seconds" ? (
          <ProgressRing
            progress={progress}
            label={String(secondsLeft)}
            sublabel="seconds"
          />
        ) : step.unit === "reps" ? (
          <ProgressRing
            progress={0}
            label={String(step.amount)}
            sublabel="reps · tap Done when finished"
          />
        ) : (
          <ProgressRing
            progress={0}
            label={String(step.amount)}
            sublabel="meters climbed"
          />
        )}
      </View>

      <View style={{ marginTop: 32, width: "100%", gap: 10 }}>
        {step.unit !== "seconds" ? (
          <Button label="Done" onPress={onDone} size="lg" />
        ) : null}
        <Button label="Skip" variant="ghost" onPress={onSkip} />
      </View>

      {step.instructions.length > 0 ? (
        <View
          style={{
            marginTop: 24,
            borderLeftWidth: 3,
            borderLeftColor: theme.colors.primary + "55",
            paddingLeft: 10,
            alignSelf: "stretch",
          }}
        >
          {step.instructions.slice(0, 3).map((line, i) => (
            <Text
              key={i}
              style={{
                color: theme.colors.textMuted,
                fontSize: 12,
                lineHeight: 17,
              }}
            >
              • {line}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function RestView({
  seconds,
  nextName,
  onSkip,
}: {
  seconds: number;
  nextName: string | null;
  onSkip: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: "center" }}>
      <Text
        style={{ color: theme.colors.textMuted, fontSize: 14, fontWeight: "700" }}
      >
        REST
      </Text>
      <Text
        style={{
          color: theme.colors.text,
          fontSize: 84,
          fontWeight: "700",
          marginTop: 8,
        }}
      >
        {seconds}
      </Text>
      {nextName ? (
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: 16,
            marginTop: 12,
          }}
        >
          Up next: {nextName}
        </Text>
      ) : null}
      <View style={{ marginTop: 24, width: "60%" }}>
        <Button label="Skip rest" variant="secondary" onPress={onSkip} />
      </View>
    </View>
  );
}

function SummaryScreen({
  totalSets,
  sessionId,
}: {
  totalSets: number;
  sessionId: string;
}) {
  const theme = useTheme();
  const plan = usePlanStore((s) => s.plan);
  const session = plan
    ? findSessionInPlan(plan.plan.days, sessionId)?.session
    : null;

  if (!session) return null;

  const done = session.blocks.flatMap((b) =>
    b.exercises.filter((e) => e.execution.status === "completed"),
  ).length;

  const kcal = Math.round(session.execution.actual_calories_total);
  const mins = session.execution.actual_duration_minutes;
  const pct = Math.round(session.execution.completion_percentage);

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ fontSize: 72 }}>🎉</Text>
        <Text
          style={{
            color: theme.colors.text,
            fontSize: 28,
            fontWeight: "700",
            marginTop: 12,
          }}
        >
          Nice work!
        </Text>
        <View style={{ marginTop: 32, gap: 12, alignItems: "center" }}>
          <Stat label="Actual calories" value={`${kcal} kcal`} />
          <Stat label="Duration" value={`${mins} min`} />
          <Stat label="Exercises completed" value={`${done}`} />
          <Stat label="Session completion" value={`${pct}%`} />
        </View>
      </View>
      <View>
        <Button
          label="Done"
          size="lg"
          onPress={() => router.replace("/(tabs)")}
        />
      </View>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>
        {label}
      </Text>
      <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: "700" }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  exitBtn: {
    padding: 4,
  },
});
