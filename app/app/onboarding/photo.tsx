import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, Alert } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { Screen } from "@src/components/Screen";
import { WizardFooter } from "@src/components/WizardFooter";
import { useTheme } from "@src/theme/ThemeProvider";
import { useOnboardingStore } from "@src/store/onboardingStore";
import { savePhotoToAppStorage } from "@src/lib/storage";

const STEP = 1;
const TOTAL = 6;

export default function PhotoStep() {
  const theme = useTheme();
  const draft = useOnboardingStore((s) => s.draft);
  const setDraft = useOnboardingStore((s) => s.setDraft);
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    setBusy(true);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        quality: 0.8,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (!res.canceled && res.assets[0]) {
        const stored = await savePhotoToAppStorage(res.assets[0].uri);
        setDraft({ photo_uri: stored });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      Alert.alert("Couldn't pick photo", msg);
    } finally {
      setBusy(false);
    }
  };

  const clear = () => setDraft({ photo_uri: null });

  const next = () => router.push("/onboarding/dob");

  const initials = draft.name
    ? draft.name
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("")
    : "?";

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text
          style={{
            fontSize: 26,
            fontWeight: "700",
            color: theme.colors.text,
            marginBottom: theme.spacing.md,
            textAlign: "center",
          }}
        >
          Add a profile photo?
        </Text>
        <Text
          style={{
            fontSize: 15,
            color: theme.colors.textMuted,
            marginBottom: theme.spacing.xxl,
            textAlign: "center",
          }}
        >
          Optional. Shown on the dashboard.
        </Text>

        <Pressable onPress={pick} disabled={busy}>
          <View
            style={[
              styles.avatar,
              {
                backgroundColor: theme.colors.surfaceAlt,
                borderColor: theme.colors.border,
              },
            ]}
          >
            {draft.photo_uri ? (
              <Image
                source={{ uri: draft.photo_uri }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
              />
            ) : (
              <Text
                style={{
                  fontSize: 56,
                  fontWeight: "700",
                  color: theme.colors.textMuted,
                }}
              >
                {initials}
              </Text>
            )}
          </View>
        </Pressable>

        <Pressable
          onPress={pick}
          disabled={busy}
          style={{ padding: theme.spacing.md }}
        >
          <Text style={{ color: theme.colors.primary, fontWeight: "600" }}>
            {draft.photo_uri ? "Replace photo" : "Choose from library"}
          </Text>
        </Pressable>
        {draft.photo_uri ? (
          <Pressable onPress={clear} style={{ padding: theme.spacing.sm }}>
            <Text style={{ color: theme.colors.textMuted }}>Remove</Text>
          </Pressable>
        ) : null}
      </View>
      <WizardFooter
        step={STEP}
        total={TOTAL}
        onNext={next}
        onBack={() => router.back()}
        onSkip={next}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
