import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Alert,
  Modal,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { format, addDays, parse } from "date-fns";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { Screen } from "@src/components/Screen";
import { Card } from "@src/components/Card";
import { Chip } from "@src/components/Chip";
import { Button } from "@src/components/Button";
import { useTheme } from "@src/theme/ThemeProvider";
import { useProfileStore } from "@src/store/profileStore";
import {
  ALL_LIMITATIONS,
  ALL_MEETING_DENSITIES,
  type Limitation,
  type MeetingDensity,
  type PeriodType,
} from "@src/types";
import { useTranslation } from "react-i18next";
import { buildPrompt, type PeriodChoice } from "@src/lib/prompt";
import { todayYYYYMMDD } from "@src/lib/dates";
import { getCatalog, exerciseText } from "@src/lib/catalog";
import { generateWorkoutPlan } from "@src/lib/api";
import { validatePlan } from "@src/lib/validate";
import { usePlanStore } from "@src/store/planStore";
import { rescheduleAll } from "@src/lib/scheduler";

export default function GeneratePlan() {
  const theme = useTheme();
  const { t } = useTranslation();
  const profile = useProfileStore((s) => s.profile);
  const updateProfile = useProfileStore((s) => s.updateProfile);
  const setPlan = usePlanStore((s) => s.setPlan);

  // ─── local form state (prefilled from profile where available) ─────
  const [availableMinutes, setAvailableMinutes] = useState<number>(
    profile?.available_minutes_per_day ?? 25,
  );
  const ws = profile?.work_schedule;
  const [workStart, setWorkStart] = useState<string>(
    ws?.work_hours.start ?? "09:00",
  );
  const [workEnd, setWorkEnd] = useState<string>(ws?.work_hours.end ?? "18:00");
  const [meetingDensity, setMeetingDensity] = useState<MeetingDensity>(
    ws?.typical_meeting_density ?? "medium",
  );
  const [lunchEnabled, setLunchEnabled] = useState<boolean>(
    Boolean(ws?.lunch_break),
  );
  const [lunchStart, setLunchStart] = useState<string>(
    ws?.lunch_break?.start ?? "13:00",
  );
  const [lunchEnd, setLunchEnd] = useState<string>(
    ws?.lunch_break?.end ?? "14:00",
  );
  const [limitations, setLimitations] = useState<Limitation[]>(
    profile?.limitations ?? [],
  );
  const [dislikedIds, setDislikedIds] = useState<string[]>(
    profile?.disliked_exercise_ids ?? [],
  );

  // Period selection
  const [periodType, setPeriodType] = useState<PeriodType>("weekly");
  const [startDate, setStartDate] = useState<string>(todayYYYYMMDD());
  const computeEndFor = (type: PeriodType, start: string): string => {
    const base = parse(start, "yyyy-MM-dd", new Date());
    if (type === "weekly") return format(addDays(base, 6), "yyyy-MM-dd");
    if (type === "monthly") return format(addDays(base, 27), "yyyy-MM-dd");
    return format(addDays(base, 13), "yyyy-MM-dd");
  };
  const [endDate, setEndDate] = useState<string>(
    computeEndFor("weekly", startDate),
  );
  const setPeriodAndDates = (type: PeriodType) => {
    setPeriodType(type);
    setEndDate(computeEndFor(type, startDate));
  };

  // ─── submit ────────────────────────────────────────────────────────
  const [isGenerating, setIsGenerating] = useState(false);

  const buildCurrentPrompt = () => {
    if (!profile) {
      throw new Error("Profile is missing.");
    }

    const updatedProfile = {
      ...profile,
      available_minutes_per_day: availableMinutes,
      limitations,
      disliked_exercise_ids: dislikedIds,
      work_schedule: {
        work_hours: { start: workStart, end: workEnd },
        typical_meeting_density: meetingDensity,
        ...(lunchEnabled
          ? { lunch_break: { start: lunchStart, end: lunchEnd } }
          : {}),
      },
    };
    updateProfile(updatedProfile);

    const period: PeriodChoice = {
      type: periodType,
      start_date: startDate,
      end_date: endDate,
    };

    return buildPrompt(updatedProfile, period);
  };

  const buildAndGenerate = async () => {
    setIsGenerating(true);
    try {
      const prompt = buildCurrentPrompt();
      const response = await generateWorkoutPlan(prompt);
      const result = validatePlan(JSON.stringify(response.plan));

      if (!result.ok) {
        const preview = result.errors
          .slice(0, 3)
          .map((e) => `${e.path}: ${e.message}`)
          .join("\n");
        Alert.alert(t('plan.generate.validationErrorTitle'), preview);
        return;
      }

      setPlan(result.plan);
      rescheduleAll(result.plan).catch((err) => {
        console.warn("[generate] rescheduleAll failed", err);
      });
      router.replace("/(tabs)");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(t('plan.generate.generateErrorTitle'), msg);
    } finally {
      setIsGenerating(false);
    }
  };

  // ─── form view ────────────────────────────────────────────────────
  const catalog = getCatalog();

  return (
    <Screen scrollable>
      <Text style={[styles.title, { color: theme.colors.text }]}>
        {t('plan.generate.title')}
      </Text>
      <Text
        style={{ color: theme.colors.textMuted, fontSize: 14, marginTop: 4 }}
      >
        {t('plan.generate.subtitle')}
      </Text>

      <SectionLabel>{t('plan.generate.sections.timeBudget')}</SectionLabel>
      <Card>
        <Text style={{ color: theme.colors.text, fontWeight: "600" }}>
          {t('plan.generate.timeBudgetValue', { minutes: availableMinutes })}
        </Text>
        <Text
          style={{ color: theme.colors.textMuted, fontSize: 12, marginTop: 2 }}
        >
          {t('plan.generate.timeBudgetHint')}
        </Text>
        <View
          style={{
            flexDirection: "row",
            gap: theme.spacing.sm,
            marginTop: theme.spacing.sm,
            flexWrap: "wrap",
          }}
        >
          {[15, 20, 25, 30, 45, 60].map((m) => (
            <Chip
              key={m}
              label={t('plan.generate.timeBudgetMinutes', { count: m })}
              selected={availableMinutes === m}
              onPress={() => setAvailableMinutes(m)}
            />
          ))}
        </View>
      </Card>

      <SectionLabel>{t('plan.generate.sections.workHours')}</SectionLabel>
      <Card>
        <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
          <View style={{ flex: 1 }}>
            <TimePickerField
              label={t('plan.generate.workStart')}
              value={workStart}
              onChange={setWorkStart}
              maxTimeExclusive={workEnd}
            />
          </View>
          <View style={{ flex: 1 }}>
            <TimePickerField
              label={t('plan.generate.workEnd')}
              value={workEnd}
              onChange={setWorkEnd}
              minTimeExclusive={workStart}
            />
          </View>
        </View>
      </Card>

      <SectionLabel>{t('plan.generate.sections.meetingDensity')}</SectionLabel>
      <Card>
        <Text
          style={{ color: theme.colors.textMuted, fontSize: 12, marginBottom: theme.spacing.sm }}
        >
          {t('plan.generate.meetingDensityHint')}
        </Text>
        <View style={{ gap: theme.spacing.sm }}>
          {ALL_MEETING_DENSITIES.map((d) => (
            <Chip
              key={d}
              label={t(`enums:meetingDensity.${d}`)}
              selected={meetingDensity === d}
              onPress={() => setMeetingDensity(d)}
            />
          ))}
        </View>
      </Card>

      <SectionLabel>{t('plan.generate.sections.lunchBreak')}</SectionLabel>
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: theme.colors.text, fontWeight: "600" }}>
            {t('plan.generate.lunchToggle')}
          </Text>
          <Pressable
            onPress={() => setLunchEnabled(!lunchEnabled)}
            style={[
              {
                paddingHorizontal: 14,
                paddingVertical: 6,
                borderRadius: 20,
                backgroundColor: lunchEnabled
                  ? theme.colors.primary
                  : theme.colors.surfaceAlt,
              },
            ]}
          >
            <Text
              style={{
                color: lunchEnabled
                  ? theme.colors.textInverse
                  : theme.colors.textMuted,
                fontWeight: "700",
              }}
            >
              {lunchEnabled ? t('plan.generate.yes') : t('plan.generate.no')}
            </Text>
          </Pressable>
        </View>
        {lunchEnabled ? (
          <View
            style={{
              flexDirection: "row",
              gap: theme.spacing.md,
              marginTop: theme.spacing.md,
            }}
          >
            <View style={{ flex: 1 }}>
              <TimePickerField
                label={t('plan.generate.workStart')}
                value={lunchStart}
                onChange={setLunchStart}
                maxTimeExclusive={lunchEnd}
              />
            </View>
            <View style={{ flex: 1 }}>
              <TimePickerField
                label={t('plan.generate.workEnd')}
                value={lunchEnd}
                onChange={setLunchEnd}
                minTimeExclusive={lunchStart}
              />
            </View>
          </View>
        ) : null}
      </Card>

      <SectionLabel>{t('plan.generate.sections.limitations')}</SectionLabel>
      <Card>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: 12,
            marginBottom: theme.spacing.sm,
          }}
        >
          {t('plan.generate.limitationsHint')}
        </Text>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: theme.spacing.sm,
          }}
        >
          {ALL_LIMITATIONS.filter((l) => l !== "none").map((l) => (
            <Chip
              key={l}
              label={t(`enums:limitations.${l}`)}
              selected={limitations.includes(l)}
              onPress={() =>
                setLimitations((curr) =>
                  curr.includes(l) ? curr.filter((x) => x !== l) : [...curr, l],
                )
              }
            />
          ))}
        </View>
      </Card>

      <SectionLabel>{t('plan.generate.sections.disliked')}</SectionLabel>
      <Card>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: 12,
            marginBottom: theme.spacing.sm,
          }}
        >
          {t('plan.generate.dislikedHint')}
        </Text>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          {catalog.exercises.slice(0, 40).map((ex) => (
            <Chip
              key={ex.id}
              label={exerciseText(ex.id).name}
              selected={dislikedIds.includes(ex.id)}
              onPress={() =>
                setDislikedIds((curr) =>
                  curr.includes(ex.id)
                    ? curr.filter((x) => x !== ex.id)
                    : [...curr, ex.id],
                )
              }
            />
          ))}
        </View>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: 11,
            marginTop: theme.spacing.sm,
          }}
        >
          {t('plan.generate.dislikedCount', { shown: 40, total: catalog.exercises.length })}
        </Text>
      </Card>

      <SectionLabel>{t('plan.generate.sections.period')}</SectionLabel>
      <Card>
        <View
          style={{
            flexDirection: "row",
            gap: theme.spacing.sm,
          }}
        >
          {(["weekly", "monthly", "custom"] as PeriodType[]).map((p) => (
            <Chip
              key={p}
              label={t(`enums:periodTypes.${p}`)}
              selected={periodType === p}
              onPress={() => setPeriodAndDates(p)}
            />
          ))}
        </View>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: 13,
            marginTop: theme.spacing.md,
          }}
        >
          {startDate} → {endDate}
        </Text>
      </Card>

      <View style={{ marginTop: theme.spacing.xl, marginBottom: theme.spacing.xl }}>
        <Button
          label={t('plan.generate.generatePlan')}
          onPress={buildAndGenerate}
          loading={isGenerating}
          size="lg"
          leftIcon={
            <Ionicons
              name="sparkles-outline"
              size={18}
              color={theme.colors.textInverse}
            />
          }
        />
        <View style={{ marginTop: theme.spacing.sm }}>
          <Button
            label={t('plan.generate.pasteFallback')}
            variant="secondary"
            onPress={() => router.push("/plan/paste")}
            disabled={isGenerating}
          />
        </View>
      </View>
    </Screen>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <Text
      style={{
        color: theme.colors.textMuted,
        fontSize: 11,
        fontWeight: "700",
        letterSpacing: 0.8,
        marginTop: theme.spacing.xl,
        marginBottom: theme.spacing.sm,
      }}
    >
      {children}
    </Text>
  );
}

function hhmmToUtcDate(s: string): Date {
  const [h = 0, m = 0] = s.split(":").map(Number);
  const d = new Date(0);
  d.setUTCHours(h, m, 0, 0);
  return d;
}

function utcDateToHHmm(d: Date): string {
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function TimePickerField({
  label,
  value,
  onChange,
  minTimeExclusive,
  maxTimeExclusive,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  minTimeExclusive?: string;
  maxTimeExclusive?: string;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Date>(() => hhmmToUtcDate(value));

  const minDate = minTimeExclusive
    ? new Date(hhmmToUtcDate(minTimeExclusive).getTime() + 60_000)
    : undefined;
  const maxDate = maxTimeExclusive
    ? new Date(hhmmToUtcDate(maxTimeExclusive).getTime() - 60_000)
    : undefined;

  const clamp = (d: Date): Date => {
    if (minDate && d.getTime() < minDate.getTime()) return minDate;
    if (maxDate && d.getTime() > maxDate.getTime()) return maxDate;
    return d;
  };

  const openPicker = () => {
    setPending(clamp(hhmmToUtcDate(value)));
    setOpen(true);
  };

  const commit = () => {
    onChange(utcDateToHHmm(clamp(pending)));
    setOpen(false);
  };

  return (
    <>
      <Text
        style={{
          color: theme.colors.textMuted,
          fontSize: 12,
          marginBottom: 4,
        }}
      >
        {label}
      </Text>
      <Pressable
        onPress={openPicker}
        style={{
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          paddingVertical: 12,
          paddingHorizontal: 12,
          backgroundColor: theme.colors.surfaceAlt,
        }}
      >
        <Text style={{ color: theme.colors.text, fontSize: 16 }}>{value}</Text>
      </Pressable>
      {Platform.OS === "ios" && open ? (
        <Modal
          visible
          transparent
          animationType="slide"
          onRequestClose={() => setOpen(false)}
        >
          <View style={{ flex: 1 }}>
            <Pressable
              style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)" }}
              onPress={() => setOpen(false)}
            />
            <View style={{ backgroundColor: theme.colors.surface }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "flex-end",
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: theme.spacing.sm,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: theme.colors.border,
                }}
              >
                <Pressable onPress={commit} hitSlop={12}>
                  <Text
                    style={{
                      color: theme.colors.primary,
                      fontSize: 16,
                      fontWeight: "600",
                    }}
                  >
                    {t("app.done")}
                  </Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={pending}
                mode="time"
                display="spinner"
                timeZoneName="UTC"
                minimumDate={minDate}
                maximumDate={maxDate}
                onChange={(_e, picked) => {
                  if (picked) setPending(picked);
                }}
                themeVariant={theme.dark ? "dark" : "light"}
                style={{
                  width: "100%",
                  backgroundColor: theme.colors.surface,
                }}
              />
            </View>
          </View>
        </Modal>
      ) : Platform.OS === "android" && open ? (
        <DateTimePicker
          value={pending}
          mode="time"
          display="default"
          timeZoneName="UTC"
          minimumDate={minDate}
          maximumDate={maxDate}
          onChange={(_e, picked) => {
            setOpen(false);
            if (picked) onChange(utcDateToHHmm(clamp(picked)));
          }}
          themeVariant={theme.dark ? "dark" : "light"}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: "700", marginTop: 8 },
});
