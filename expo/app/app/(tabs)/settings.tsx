import React from "react";
import { View, Text, Switch, StyleSheet, Pressable, Alert } from "react-native";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
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
  type LanguagePref,
} from "@src/store/settingsStore";
import { cancelAll, requestPermission } from "@src/lib/scheduler";
import { supabase } from "@src/lib/supabase";

const THEMES: ThemePreference[] = ["system", "light", "dark"];
const LANGUAGES: LanguagePref[] = ["system", "en", "uk"];

export default function SettingsTab() {
  const theme = useTheme();
  const { t } = useTranslation();
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
          t('errors.permissionDeniedTitle'),
          t('errors.permissionDeniedBody'),
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
      t('settings.confirmReset.title'),
      t('settings.confirmReset.body'),
      [
        { text: t('settings.confirmReset.cancel'), style: "cancel" },
        {
          text: t('settings.confirmReset.confirm'),
          style: "destructive",
          onPress: () => {
            Alert.alert(
              t('settings.confirmReset.finalTitle'),
              t('settings.confirmReset.finalBody'),
              [
                { text: t('settings.confirmReset.cancel'), style: "cancel" },
                {
                  text: t('settings.confirmReset.finalConfirm'),
                  style: "destructive",
                  onPress: async () => {
                    await cancelAll();
                    clearProfile();
                    clearPlan();
                    router.replace("/onboarding/welcome");
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  const languageLabel = (l: LanguagePref) =>
    l === 'system'
      ? t('settings.language.system')
      : l === 'en'
      ? t('settings.language.english')
      : t('settings.language.ukrainian');

  return (
    <Screen scrollable>
      <Text style={[styles.header, { color: theme.colors.text }]}>
        {t('settings.title')}
      </Text>

      <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
        {t('settings.sections.profile')}
      </Text>
      <Card>
        <NavRow
          icon="person-circle-outline"
          label={t('settings.profileRow.label')}
          subtitle={profile?.name ?? t('settings.profileRow.notSet')}
          onPress={() => router.push("/profile/edit")}
        />
        <Separator />
        <NavRow
          icon="barbell-outline"
          label={plan ? t('settings.planRow.edit') : t('settings.planRow.generate')}
          subtitle={
            plan
              ? t('settings.planRow.editSubtitle')
              : t('settings.planRow.generateSubtitle')
          }
          onPress={() => router.push("/plan/generate")}
        />
      </Card>

      <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
        {t('settings.sections.appearance')}
      </Text>
      <Card>
        <Text style={[styles.rowTitle, { color: theme.colors.text }]}>
          {t('settings.theme')}
        </Text>
        <View
          style={{
            flexDirection: "row",
            gap: theme.spacing.sm,
            marginTop: theme.spacing.sm,
          }}
        >
          {THEMES.map((tp) => (
            <Chip
              key={tp}
              label={t(`settings.themeOptions.${tp}`)}
              selected={settings.theme === tp}
              onPress={() => settings.setTheme(tp)}
            />
          ))}
        </View>
      </Card>

      <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
        {t('settings.sections.language')}
      </Text>
      <Card>
        <Text style={[styles.rowTitle, { color: theme.colors.text }]}>
          {t('settings.language.label')}
        </Text>
        <View
          style={{
            flexDirection: "row",
            gap: theme.spacing.sm,
            marginTop: theme.spacing.sm,
            flexWrap: "wrap",
          }}
        >
          {LANGUAGES.map((l) => (
            <Chip
              key={l}
              label={languageLabel(l)}
              selected={settings.language === l}
              onPress={() => settings.setLanguage(l)}
            />
          ))}
        </View>
      </Card>

      <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
        {t('settings.sections.reminders')}
      </Text>
      <Card>
        <ToggleRow
          icon="notifications-outline"
          label={t('settings.notifications.label')}
          subtitle={t('settings.notifications.subtitle')}
          value={settings.notificationsEnabled}
          onChange={onToggleNotifications}
        />
        <Separator />
        <ToggleRow
          icon="pulse-outline"
          label={t('settings.haptics.label')}
          subtitle={t('settings.haptics.subtitle')}
          value={settings.hapticsEnabled}
          onChange={settings.setHapticsEnabled}
        />
        <Separator />
        <ToggleRow
          icon="volume-high-outline"
          label={t('settings.audio.label')}
          subtitle={t('settings.audio.subtitle')}
          value={settings.audioEnabled}
          onChange={settings.setAudioEnabled}
        />
        <Separator />
        <ToggleRow
          icon="sunny-outline"
          label={t('settings.keepAwake.label')}
          subtitle={t('settings.keepAwake.subtitle')}
          value={settings.keepAwakeEnabled}
          onChange={settings.setKeepAwakeEnabled}
        />
      </Card>

      <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
        {t('settings.sections.postpone')}
      </Text>
      <Card>
        <Text style={[styles.rowTitle, { color: theme.colors.text }]}>
          {t('settings.postponeBy')}
        </Text>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: 12,
            marginTop: 2,
          }}
        >
          {t('settings.postponeHint')}
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
              label={t('settings.postponeMinutes', { count: m })}
              selected={settings.postponeMinutes === m}
              onPress={() => settings.setPostponeMinutes(m)}
            />
          ))}
        </View>
      </Card>

      <View style={{ marginTop: theme.spacing.xl, gap: theme.spacing.sm }}>
        <Button
          label={t('auth.signOut')}
          onPress={async () => {
            await supabase.auth.signOut();
            router.replace("/sign-in");
          }}
          variant="ghost"
        />
        <Button label={t('settings.clearAll')} onPress={confirmReset} variant="danger" />
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
