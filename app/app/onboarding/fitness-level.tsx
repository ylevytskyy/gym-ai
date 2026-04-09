import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import { Screen } from "@src/components/Screen";
import { WizardFooter } from "@src/components/WizardFooter";
import { useTheme } from "@src/theme/ThemeProvider";
import { useOnboardingStore } from "@src/store/onboardingStore";
import { ALL_FITNESS_LEVELS } from "@src/types";
import { useTranslation } from "react-i18next";

const STEP = 4;
const TOTAL = 6;

export default function FitnessLevelStep() {
  const theme = useTheme();
  const { t } = useTranslation();
  const draft = useOnboardingStore((s) => s.draft);
  const setDraft = useOnboardingStore((s) => s.setDraft);

  const pick = (v: (typeof ALL_FITNESS_LEVELS)[number]) => {
    setDraft({ fitness_level: v });
  };

  const next = () => router.push("/onboarding/goals");

  return (
    <Screen>
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
          What's your fitness level?
        </Text>
        <Text
          style={{
            fontSize: 15,
            color: theme.colors.textMuted,
            marginBottom: theme.spacing.xl,
          }}
        >
          Shapes exercise difficulty and progression rate.
        </Text>
        <View style={{ gap: theme.spacing.md }}>
          {ALL_FITNESS_LEVELS.map((level) => {
            const selected = draft.fitness_level === level;
            return (
              <Pressable
                key={level}
                onPress={() => pick(level)}
                style={[
                  styles.option,
                  {
                    backgroundColor: selected
                      ? theme.colors.primaryMuted
                      : theme.colors.surface,
                    borderColor: selected
                      ? theme.colors.primary
                      : theme.colors.border,
                    borderRadius: theme.radius.lg,
                    padding: theme.spacing.lg,
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "700",
                    color: theme.colors.text,
                  }}
                >
                  {t(`enums:fitnessLevels.${level}`)}
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    color: theme.colors.textMuted,
                    marginTop: 4,
                  }}
                >
                  {t(`enums:fitnessLevelDescriptions.${level}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <WizardFooter
        step={STEP}
        total={TOTAL}
        nextDisabled={!draft.fitness_level}
        onNext={next}
        onBack={() => router.back()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: { borderWidth: 2 },
});
