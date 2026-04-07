import React from "react";
import { View, Text, Switch, StyleSheet, Pressable, Alert } from "react-native";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Screen } from "@src/components/Screen";
import { Card } from "@src/components/Card";
import { Chip } from "@src/components/Chip";
import { Button } from "@src/components/Button";
import { useTheme } from "@src/theme/ThemeProvider";
import { useProfileStore } from "@src/store/profileStore";
import { usePlanStore } from "@src/store/planStore";
import {
  useSettingsStore,
  type ThemePreference,
} from "@src/store/settingsStore";
import { cancelAll, requestPermission } from "@src/lib/scheduler";

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export default function SettingsTab() {
  const theme = useTheme();
  const profile = useProfileStore((s) => s.profile);
  const clearProfile = useProfileStore((s) => s.clearProfile);
  const clearPlan = usePlanStore((s) => s.clearPlan);
  const plan = usePlanStore((s) => s.plan);

  const settings = useSettingsStore();

  const onToggleNotifications = async (v: boolean) => {
    if (v) {
      const ok = await requestPermission();
      if (!ok) {
        Alert.alert(
          "Permission denied",
          "Enable notifications in your system Settings to get reminders.",
        );
        return;
      }
    } else {
      await cancelAll();
    }
    settings.setNotificationsEnabled(v);
  };

  const confirmReset = () => {
    Alert.alert(
      "Clear everything?",
      "This deletes your profile, current plan, and all progress.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            Alert.alert("Really clear?", "This cannot be undone.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Yes, clear everything",
                style: "destructive",
                onPress: async () => {
                  await cancelAll();
                  clearProfile();
                  clearPlan();
                  router.replace("/onboarding/welcome");
                },
              },
            ]);
          },
        },
      ],
    );
  };

  return (
    <Screen scrollable>
      <Text style={[styles.header, { color: theme.colors.text }]}>Settings</Text>

      <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
        PROFILE
      </Text>
      <Card>
        <NavRow
          icon="person-circle-outline"
          label="User profile"
          subtitle={profile?.name ?? "Not set"}
          onPress={() => router.push("/profile/edit")}
        />
        <Separator />
        <NavRow
          icon="barbell-outline"
          label={plan ? "Edit plan" : "Generate plan"}
          subtitle={
            plan
              ? "Update schedule and re-generate"
              : "Create your first workout plan"
          }
          onPress={() => router.push("/plan/generate")}
        />
      </Card>

      <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
        APPEARANCE
      </Text>
      <Card>
        <Text style={[styles.rowTitle, { color: theme.colors.text }]}>
          Theme
        </Text>
        <View
          style={{
            flexDirection: "row",
            gap: theme.spacing.sm,
            marginTop: theme.spacing.sm,
          }}
        >
          {THEMES.map((t) => (
            <Chip
              key={t.value}
              label={t.label}
              selected={settings.theme === t.value}
              onPress={() => settings.setTheme(t.value)}
            />
          ))}
        </View>
      </Card>

      <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
        REMINDERS & POLISH
      </Text>
      <Card>
        <ToggleRow
          icon="notifications-outline"
          label="Notifications"
          subtitle="Reminders for desk breaks and workouts"
          value={settings.notificationsEnabled}
          onChange={onToggleNotifications}
        />
        <Separator />
        <ToggleRow
          icon="pulse-outline"
          label="Haptics"
          subtitle="Rumble on rep done, set complete"
          value={settings.hapticsEnabled}
          onChange={settings.setHapticsEnabled}
        />
        <Separator />
        <ToggleRow
          icon="volume-high-outline"
          label="Audio cues"
          subtitle="Countdown beeps during timed exercises"
          value={settings.audioEnabled}
          onChange={settings.setAudioEnabled}
        />
        <Separator />
        <ToggleRow
          icon="sunny-outline"
          label="Keep screen on during workouts"
          subtitle="Prevents dimming while you're lifting"
          value={settings.keepAwakeEnabled}
          onChange={settings.setKeepAwakeEnabled}
        />
      </Card>

      <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
        POSTPONE
      </Text>
      <Card>
        <Text style={[styles.rowTitle, { color: theme.colors.text }]}>
          Postpone by
        </Text>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: 12,
            marginTop: 2,
          }}
        >
          Used when you tap Postpone on an up-next card.
        </Text>
        <View
          style={{
            flexDirection: "row",
            gap: theme.spacing.sm,
            marginTop: theme.spacing.sm,
            flexWrap: "wrap",
          }}
        >
          {[5, 10, 15, 20, 30].map((m) => (
            <Chip
              key={m}
              label={`${m} min`}
              selected={settings.postponeMinutes === m}
              onPress={() => settings.setPostponeMinutes(m)}
            />
          ))}
        </View>
      </Card>

      <View style={{ marginTop: theme.spacing.xl }}>
        <Button label="Clear all data" onPress={confirmReset} variant="danger" />
      </View>
    </Screen>
  );
}

function NavRow({
  icon,
  label,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.navRow}>
      <Ionicons name={icon} size={22} color={theme.colors.primary} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: "600" }}>
          {label}
        </Text>
        {subtitle ? (
          <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </Pressable>
  );
}

function ToggleRow({
  icon,
  label,
  subtitle,
  value,
  onChange,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.navRow}>
      <Ionicons name={icon} size={22} color={theme.colors.primary} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: "600" }}>
          {label}
        </Text>
        {subtitle ? (
          <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: theme.colors.surfaceAlt, true: theme.colors.primary }}
      />
    </View>
  );
}

function Separator() {
  const theme = useTheme();
  return (
    <View
      style={{
        height: 1,
        backgroundColor: theme.colors.border,
        marginVertical: 8,
      }}
    />
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 28, fontWeight: "700", marginBottom: 8 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginTop: 18,
    marginBottom: 6,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  rowTitle: { fontSize: 16, fontWeight: "600" },
});
