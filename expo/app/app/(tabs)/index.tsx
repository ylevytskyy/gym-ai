import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { Screen } from "@src/components/Screen";
import { Card } from "@src/components/Card";
import { Button } from "@src/components/Button";
import { DayStrip } from "@src/components/DayStrip";
import { SessionCard } from "@src/components/SessionCard";
import { UpNextCard } from "@src/components/UpNextCard";
import { useTheme } from "@src/theme/ThemeProvider";
import { useProfileStore } from "@src/store/profileStore";
import { usePlanStore } from "@src/store/planStore";
import { useSettingsStore } from "@src/store/settingsStore";
import { pickNextUp } from "@src/lib/session-picker";
import { todayYYYYMMDD } from "@src/lib/dates";
import { rescheduleAll } from "@src/lib/scheduler";
import type { Day, Session } from "@src/types";

export default function PlanDashboard() {
  const theme = useTheme();
  const profile = useProfileStore((s) => s.profile);
  const plan = usePlanStore((s) => s.plan);
  const postponeSession = usePlanStore((s) => s.postponeSession);
  const postponeMinutes = useSettingsStore((s) => s.postponeMinutes);
  const { t } = useTranslation();

  const today = todayYYYYMMDD();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const selected: Day | null = useMemo(() => {
    if (!plan) return null;
    const desired =
      selectedDate ??
      plan.plan.days.find((d) => d.date === today)?.date ??
      plan.plan.days[0]?.date ??
      null;
    return plan.plan.days.find((d) => d.date === desired) ?? null;
  }, [plan, selectedDate, today]);

  const nextUp = useMemo(() => {
    if (!selected) return null;
    return pickNextUp(selected);
  }, [selected]);

  // ─── empty state ──────────────────────────────────────────────────
  if (!plan) {
    return (
      <Screen>
        <Header name={profile?.name ?? ""} photoUri={profile?.photo_uri ?? null} />
        <View style={styles.emptyWrap}>
          <Ionicons
            name="calendar-clear-outline"
            size={80}
            color={theme.colors.textMuted}
          />
          <Text
            style={[
              styles.emptyTitle,
              { color: theme.colors.text, marginTop: theme.spacing.md },
            ]}
          >
            {t('dashboard.emptyTitle')}
          </Text>
          <Text
            style={[
              styles.emptySub,
              { color: theme.colors.textMuted, marginTop: theme.spacing.sm },
            ]}
          >
            {t('dashboard.emptySubtitle')}
          </Text>
          <View style={{ width: "100%", marginTop: theme.spacing.xl }}>
            <Button
              label={t('dashboard.generateCta')}
              onPress={() => router.push("/plan/generate")}
              size="lg"
            />
          </View>
        </View>
      </Screen>
    );
  }

  // ─── loaded state ─────────────────────────────────────────────────
  const handleStart = (session: Session) => {
    router.push(`/plan/preview/${session.session_id}`);
  };

  const handlePostpone = async (session: Session) => {
    postponeSession(session.session_id, postponeMinutes);
    // reschedule notifications for the whole plan to pick up the new time
    const fresh = usePlanStore.getState().plan;
    if (fresh) rescheduleAll(fresh).catch(() => {});
  };

  return (
    <Screen scrollable>
      <Header name={profile?.name ?? ""} photoUri={profile?.photo_uri ?? null} />

      <View style={{ marginTop: theme.spacing.lg }}>
        <DayStrip
          days={plan.plan.days}
          selectedDate={selected?.date ?? plan.plan.days[0].date}
          onSelect={setSelectedDate}
        />
      </View>

      {selected ? (
        <>
          {selected.is_rest_day ? (
            <Card style={{ marginTop: theme.spacing.lg }}>
              <View style={{ alignItems: "center", padding: theme.spacing.md }}>
                <Ionicons
                  name="moon-outline"
                  size={40}
                  color={theme.colors.textMuted}
                />
                <Text
                  style={{
                    color: theme.colors.text,
                    fontSize: 18,
                    fontWeight: "700",
                    marginTop: theme.spacing.md,
                  }}
                >
                  {t('dashboard.restDay')}
                </Text>
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontSize: 14,
                    marginTop: 4,
                  }}
                >
                  {t('dashboard.restDaySubtitle')}
                </Text>
              </View>
            </Card>
          ) : (
            <>
              {nextUp ? (
                <View style={{ marginTop: theme.spacing.lg }}>
                  <UpNextCard
                    nextUp={nextUp}
                    onStart={handleStart}
                    onPostpone={handlePostpone}
                  />
                </View>
              ) : null}

              <CalorieBar day={selected} />

              <View style={{ marginTop: theme.spacing.lg }}>
                <Text
                  style={[
                    styles.sectionTitle,
                    { color: theme.colors.textMuted },
                  ]}
                >
                  {t('dashboard.allSessionsToday')}
                </Text>
                <View style={{ marginTop: theme.spacing.sm }}>
                  {selected.sessions.map((s) => (
                    <SessionCard
                      key={s.session_id}
                      session={s}
                      onPress={() => router.push(`/plan/preview/${s.session_id}`)}
                    />
                  ))}
                </View>
              </View>
            </>
          )}
        </>
      ) : null}
    </Screen>
  );
}

function Header({ name, photoUri }: { name: string; photoUri: string | null }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const initials = name
    ? name
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("")
    : "?";
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>
          {t('dashboard.hello')}
        </Text>
        <Text
          style={{
            color: theme.colors.text,
            fontSize: 22,
            fontWeight: "700",
            marginTop: 2,
          }}
        >
          {name || t('dashboard.friend')}
        </Text>
      </View>
      <View
        style={[
          styles.avatar,
          {
            backgroundColor: theme.colors.surfaceAlt,
            borderColor: theme.colors.border,
          },
        ]}
      >
        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
          />
        ) : (
          <Text style={{ fontWeight: "700", color: theme.colors.textMuted }}>
            {initials}
          </Text>
        )}
      </View>
    </View>
  );
}

function CalorieBar({ day }: { day: Day }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const maxK = Math.max(day.estimated_calories_max, 1);
  const doneK = day.actual_calories_total;
  const pct = Math.max(0, Math.min(1, doneK / maxK));
  return (
    <View style={{ marginTop: theme.spacing.lg }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: theme.colors.textMuted, fontSize: 12, fontWeight: "700" }}>
          {t('dashboard.caloriesToday')}
        </Text>
        <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: "700" }}>
          {Math.round(doneK)} / {Math.round(day.estimated_calories_max)} kcal
        </Text>
      </View>
      <View
        style={{
          height: 8,
          backgroundColor: theme.colors.surfaceAlt,
          borderRadius: 4,
          marginTop: 6,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${pct * 100}%`,
            height: "100%",
            backgroundColor: theme.colors.primary,
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    overflow: "hidden",
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  emptyTitle: { fontSize: 22, fontWeight: "700" },
  emptySub: { fontSize: 14, textAlign: "center", lineHeight: 20 },
  sectionTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8 },
});
