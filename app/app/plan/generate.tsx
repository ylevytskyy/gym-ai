import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Alert,
  ScrollView,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { format, addDays, parse } from "date-fns";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { Screen } from "@src/components/Screen";
import { Card } from "@src/components/Card";
import { Chip } from "@src/components/Chip";
import { Button } from "@src/components/Button";
import { TextField } from "@src/components/TextField";
import { useTheme } from "@src/theme/ThemeProvider";
import { useProfileStore } from "@src/store/profileStore";
import {
  ALL_LIMITATIONS,
  ALL_MEETING_DENSITIES,
  LIMITATION_LABELS,
  MEETING_DENSITY_LABELS,
  type Limitation,
  type MeetingDensity,
  type PeriodType,
} from "@src/types";
import { buildPrompt, type PeriodChoice } from "@src/lib/prompt";
import { todayYYYYMMDD } from "@src/lib/dates";
import { getCatalog } from "@src/lib/catalog";

export default function GeneratePlan() {
  const theme = useTheme();
  const profile = useProfileStore((s) => s.profile);
  const updateProfile = useProfileStore((s) => s.updateProfile);

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
  const [prompt, setPrompt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const buildAndShow = () => {
    if (!profile) return;
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
    try {
      const period: PeriodChoice = {
        type: periodType,
        start_date: startDate,
        end_date: endDate,
      };
      const p = buildPrompt(updatedProfile, period);
      setPrompt(p);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Couldn't build prompt", msg);
    }
  };

  const copyPrompt = async () => {
    if (!prompt) return;
    await Clipboard.setStringAsync(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  // ─── prompt view ──────────────────────────────────────────────────
  if (prompt) {
    return (
      <Screen>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          Your prompt is ready
        </Text>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: 14,
            marginTop: 4,
          }}
        >
          Copy this, paste it into Claude (or another LLM), and bring the JSON
          response back here.
        </Text>
        <View
          style={[
            styles.promptBox,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.md,
              marginTop: theme.spacing.md,
            },
          ]}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 12 }}
          >
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: Platform.select({
                  ios: "Menlo",
                  android: "monospace",
                }),
                fontSize: 11,
                lineHeight: 15,
              }}
              selectable
            >
              {prompt.length > 8000
                ? prompt.slice(0, 8000) +
                  `\n\n... (${prompt.length - 8000} more characters; tap Copy to get the full prompt)`
                : prompt}
            </Text>
          </ScrollView>
        </View>
        <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.sm }}>
          <Button
            label={copied ? "Copied!" : "Copy prompt to clipboard"}
            onPress={copyPrompt}
            leftIcon={
              <Ionicons
                name={copied ? "checkmark" : "copy-outline"}
                size={16}
                color={theme.colors.textInverse}
              />
            }
          />
          <Button
            label="I have my plan — paste it"
            variant="secondary"
            onPress={() => router.push("/plan/paste")}
          />
          <Button
            label="Back to form"
            variant="ghost"
            onPress={() => setPrompt(null)}
          />
        </View>
      </Screen>
    );
  }

  // ─── form view ────────────────────────────────────────────────────
  const catalog = getCatalog();

  return (
    <Screen scrollable>
      <Text style={[styles.title, { color: theme.colors.text }]}>
        Plan settings
      </Text>
      <Text
        style={{ color: theme.colors.textMuted, fontSize: 14, marginTop: 4 }}
      >
        A few details about your workday so the plan fits around real life.
      </Text>

      <SectionLabel>DAILY TIME BUDGET</SectionLabel>
      <Card>
        <Text style={{ color: theme.colors.text, fontWeight: "600" }}>
          {availableMinutes} min / day
        </Text>
        <Text
          style={{ color: theme.colors.textMuted, fontSize: 12, marginTop: 2 }}
        >
          Main workout + desk breaks together.
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
              label={`${m} min`}
              selected={availableMinutes === m}
              onPress={() => setAvailableMinutes(m)}
            />
          ))}
        </View>
      </Card>

      <SectionLabel>WORK HOURS</SectionLabel>
      <Card>
        <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
          <View style={{ flex: 1 }}>
            <TimePickerField
              label="Start"
              value={workStart}
              onChange={setWorkStart}
            />
          </View>
          <View style={{ flex: 1 }}>
            <TimePickerField
              label="End"
              value={workEnd}
              onChange={setWorkEnd}
            />
          </View>
        </View>
      </Card>

      <SectionLabel>MEETING DENSITY</SectionLabel>
      <Card>
        <Text
          style={{ color: theme.colors.textMuted, fontSize: 12, marginBottom: theme.spacing.sm }}
        >
          How busy is your calendar on a typical day?
        </Text>
        <View style={{ gap: theme.spacing.sm }}>
          {ALL_MEETING_DENSITIES.map((d) => (
            <Chip
              key={d}
              label={MEETING_DENSITY_LABELS[d]}
              selected={meetingDensity === d}
              onPress={() => setMeetingDensity(d)}
            />
          ))}
        </View>
      </Card>

      <SectionLabel>LUNCH BREAK</SectionLabel>
      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: theme.colors.text, fontWeight: "600" }}>
            I take a lunch break
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
              {lunchEnabled ? "Yes" : "No"}
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
                label="Start"
                value={lunchStart}
                onChange={setLunchStart}
              />
            </View>
            <View style={{ flex: 1 }}>
              <TimePickerField
                label="End"
                value={lunchEnd}
                onChange={setLunchEnd}
              />
            </View>
          </View>
        ) : null}
      </Card>

      <SectionLabel>LIMITATIONS</SectionLabel>
      <Card>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: 12,
            marginBottom: theme.spacing.sm,
          }}
        >
          Any of these? Pick all that apply. Exercises with matching
          contraindications will be skipped.
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
              label={LIMITATION_LABELS[l]}
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

      <SectionLabel>DISLIKED EXERCISES</SectionLabel>
      <Card>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: 12,
            marginBottom: theme.spacing.sm,
          }}
        >
          Ones to never include. Tap to toggle.
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
              label={ex.name}
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
          (showing first 40 of {catalog.exercises.length})
        </Text>
      </Card>

      <SectionLabel>PERIOD</SectionLabel>
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
              label={p.charAt(0).toUpperCase() + p.slice(1)}
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
          label="Build prompt"
          onPress={buildAndShow}
          size="lg"
          leftIcon={
            <Ionicons
              name="sparkles-outline"
              size={18}
              color={theme.colors.textInverse}
            />
          }
        />
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

function TimePickerField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const asDate = parse(value, "HH:mm", new Date());
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
        onPress={() => setOpen(true)}
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
      {open ? (
        <DateTimePicker
          value={asDate}
          mode="time"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_e, picked) => {
            if (Platform.OS === "android") setOpen(false);
            if (picked) onChange(format(picked, "HH:mm"));
          }}
          themeVariant={theme.dark ? "dark" : "light"}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: "700", marginTop: 8 },
  promptBox: {
    borderWidth: 1,
    height: 260,
  },
});
