import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { router } from "expo-router";
import { Screen } from "@src/components/Screen";
import { TextField } from "@src/components/TextField";
import { WizardFooter } from "@src/components/WizardFooter";
import { useTheme } from "@src/theme/ThemeProvider";
import { useOnboardingStore } from "@src/store/onboardingStore";

const STEP = 3;
const TOTAL = 6;

export default function BodyStep() {
  const theme = useTheme();
  const draft = useOnboardingStore((s) => s.draft);
  const setDraft = useOnboardingStore((s) => s.setDraft);
  const [weight, setWeight] = useState(
    draft.weight_kg != null ? String(draft.weight_kg) : "",
  );
  const [height, setHeight] = useState(
    draft.height_cm != null ? String(draft.height_cm) : "",
  );

  const weightN = Number(weight);
  const heightN = Number(height);
  const weightErr =
    weight.length > 0 && (isNaN(weightN) || weightN < 20 || weightN > 300)
      ? "Between 20 and 300 kg"
      : undefined;
  const heightErr =
    height.length > 0 && (isNaN(heightN) || heightN < 100 || heightN > 250)
      ? "Between 100 and 250 cm"
      : undefined;

  const valid =
    weightN >= 20 &&
    weightN <= 300 &&
    heightN >= 100 &&
    heightN <= 250;

  const next = () => {
    setDraft({ weight_kg: weightN, height_cm: heightN });
    router.push("/onboarding/fitness-level");
  };

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
          A few body measurements
        </Text>
        <Text
          style={{
            fontSize: 15,
            color: theme.colors.textMuted,
            marginBottom: theme.spacing.xl,
          }}
        >
          Used to compute calorie burn during workouts.
        </Text>
        <View style={{ gap: theme.spacing.lg }}>
          <TextField
            label="Weight (kg)"
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
            placeholder="e.g. 75"
            error={weightErr}
          />
          <TextField
            label="Height (cm)"
            value={height}
            onChangeText={setHeight}
            keyboardType="number-pad"
            placeholder="e.g. 178"
            error={heightErr}
          />
        </View>
      </View>
      <WizardFooter
        step={STEP}
        total={TOTAL}
        nextDisabled={!valid}
        onNext={next}
        onBack={() => router.back()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({});
