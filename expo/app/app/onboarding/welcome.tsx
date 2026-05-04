import React from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Screen } from "@src/components/Screen";
import { Button } from "@src/components/Button";
import { useTheme } from "@src/theme/ThemeProvider";
import { useOnboardingStore } from "@src/store/onboardingStore";

const logoDark = require("../../assets/images/logo-dark.png");
const logoLight = require("../../assets/images/logo-light.png");

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
        <Image
          source={theme.dark ? logoDark : logoLight}
          style={styles.logo}
          resizeMode="contain"
          accessibilityRole="image"
          accessibilityLabel={t('onboarding.welcome.title')}
        />
        <Text
          style={[
            styles.subtitle,
            { color: theme.colors.textMuted, marginTop: theme.spacing.lg },
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
  logo: { width: "100%", aspectRatio: 1536 / 1024, maxWidth: 360 },
  subtitle: { fontSize: 16, textAlign: "center", lineHeight: 22 },
});
