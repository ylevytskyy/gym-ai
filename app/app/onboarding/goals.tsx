import React from "react";
import { View, Text } from "react-native";
import { router } from "expo-router";
import { Screen } from "@src/components/Screen";
import { Chip } from "@src/components/Chip";
import { WizardFooter } from "@src/components/WizardFooter";
import { useTheme } from "@src/theme/ThemeProvider";
import { useOnboardingStore } from "@src/store/onboardingStore";
import { useProfileStore } from "@src/store/profileStore";
import { ALL_GOALS, type Goal } from "@src/types";
import { useTranslation } from "react-i18next";

const STEP = 5;
const TOTAL = 6;

export default function GoalsStep() {
  const theme = useTheme();
  const { t } = useTranslation();
  const draft = useOnboardingStore((s) => s.draft);
  const setDraft = useOnboardingStore((s) => s.setDraft);
  const toProfile = useOnboardingStore((s) => s.toProfile);
  const reset = useOnboardingStore((s) => s.reset);
  const setProfile = useProfileStore((s) => s.setProfile);

  const toggle = (g: Goal) => {
    const has = draft.primary_goals.includes(g);
    const next = has
      ? draft.primary_goals.filter((x) => x !== g)
      : [...draft.primary_goals, g];
    setDraft({ primary_goals: next });
  };

  const valid = draft.primary_goals.length >= 1;

  const finish = () => {
    const profile = toProfile();
    if (!profile) return;
    setProfile(profile);
    reset();
    router.replace("/(tabs)");
  };

  return (
    <Screen scrollable>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 26,
            fontWeight: "700",
            color: theme.colors.text,
            marginTop: theme.spacing.xl,
            marginBottom: theme.spacing.md,
          }}
        >
          What are you here for?
        </Text>
        <Text
          style={{
            fontSize: 15,
            color: theme.colors.textMuted,
            marginBottom: theme.spacing.xl,
          }}
        >
          Pick one or more. Shapes how your plan is put together.
        </Text>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: theme.spacing.sm,
          }}
        >
          {ALL_GOALS.map((goal) => (
            <Chip
              key={goal}
              label={t(`enums:goals.${goal}`)}
              selected={draft.primary_goals.includes(goal)}
              onPress={() => toggle(goal)}
            />
          ))}
        </View>
      </View>
      <View style={{ marginTop: theme.spacing.xl }}>
        <WizardFooter
          step={STEP}
          total={TOTAL}
          nextLabel="Finish setup"
          nextDisabled={!valid}
          onNext={finish}
          onBack={() => router.back()}
        />
      </View>
    </Screen>
  );
}
