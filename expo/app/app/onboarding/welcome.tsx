import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen } from "@src/components/Screen";
import { Button } from "@src/components/Button";
import { useTheme } from "@src/theme/ThemeProvider";
import { useOnboardingStore } from "@src/store/onboardingStore";

export default function Welcome() {
  const theme = useTheme();
  const reset = useOnboardingStore((s) => s.reset);
  const { t } = useTranslation();

  const start = () => {
    reset();
    router.push("/onboarding/name");
  };

  return (
    <Screen>
      <View style={styles.center}>
        <Text style={[styles.emoji]}>🏋️</Text>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {t('onboarding.welcome.title')}
        </Text>
        <Text
          style={[
            styles.subtitle,
            { color: theme.colors.textMuted, marginTop: theme.spacing.md },
          ]}
        >
          {t('onboarding.welcome.subtitle')}
        </Text>
      </View>
      <View style={{ paddingBottom: theme.spacing.md }}>
        <Button label={t('onboarding.welcome.cta')} onPress={start} size="lg" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emoji: { fontSize: 72 },
  title: { fontSize: 28, fontWeight: "700", marginTop: 24 },
  subtitle: { fontSize: 16, textAlign: "center", lineHeight: 22 },
});
