import React, { useState } from "react";
import { View, Text } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen } from "@src/components/Screen";
import { TextField } from "@src/components/TextField";
import { WizardFooter } from "@src/components/WizardFooter";
import { useTheme } from "@src/theme/ThemeProvider";
import { useOnboardingStore } from "@src/store/onboardingStore";

const STEP = 0;
const TOTAL = 6;

export default function NameStep() {
  const theme = useTheme();
  const draft = useOnboardingStore((s) => s.draft);
  const setDraft = useOnboardingStore((s) => s.setDraft);
  const [value, setValue] = useState(draft.name);
  const { t } = useTranslation();

  const valid = value.trim().length > 0;

  const onNext = () => {
    setDraft({ name: value.trim() });
    router.push("/onboarding/photo");
  };

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center" }}>
        <Text
          style={{
            fontSize: 26,
            fontWeight: "700",
            color: theme.colors.text,
            marginBottom: theme.spacing.md,
          }}
        >
          {t('onboarding.name.title')}
        </Text>
        <Text
          style={{
            fontSize: 15,
            color: theme.colors.textMuted,
            marginBottom: theme.spacing.lg,
          }}
        >
          {t('onboarding.name.subtitle')}
        </Text>
        <TextField
          placeholder={t('onboarding.name.placeholder')}
          value={value}
          onChangeText={setValue}
          autoFocus
          returnKeyType="next"
          maxLength={40}
          onSubmitEditing={valid ? onNext : undefined}
        />
      </View>
      <WizardFooter
        step={STEP}
        total={TOTAL}
        nextDisabled={!valid}
        onNext={onNext}
        onBack={() => router.back()}
      />
    </Screen>
  );
}
