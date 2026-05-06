import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { Screen } from "@src/components/Screen";
import { Card } from "@src/components/Card";
import { Chip } from "@src/components/Chip";
import { ExerciseImagePlayer } from "@src/components/ExerciseImagePlayer";
import { ExerciseVideoPlayer } from "@src/components/ExerciseVideoPlayer";
import { useTheme } from "@src/theme/ThemeProvider";
import { exerciseById, exerciseText } from "@src/lib/catalog";
import { getExerciseVideo } from "@src/lib/exerciseVideos";
import { useSpeech, hasVoiceFor } from "@src/lib/speech";
import { useSettingsStore } from "@src/store/settingsStore";
import { resolveLanguage } from "@src/i18n";

export default function ExerciseDetailScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const languagePref = useSettingsStore((s) => s.language);
  const activeLang = useMemo(() => resolveLanguage(languagePref), [languagePref]);

  const exercise = id ? exerciseById(id) : undefined;
  const text = id ? exerciseText(id) : undefined;

  const { speaking, speakSteps, stop } = useSpeech();
  const [ukVoiceMissing, setUkVoiceMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (activeLang === "uk") {
      hasVoiceFor("uk").then((has) => {
        if (!cancelled) setUkVoiceMissing(!has);
      });
    } else {
      setUkVoiceMissing(false);
    }
    return () => {
      cancelled = true;
    };
  }, [activeLang]);

  // Stop speech if the user changes language while on this screen.
  useEffect(() => {
    stop();
  }, [activeLang, stop]);

  if (!exercise || !text) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "" }} />
        <Text style={{ color: theme.colors.text, marginTop: 24 }}>
          {t("app.notFound")}
        </Text>
      </Screen>
    );
  }

  const onTogglePlay = () => {
    if (speaking) {
      stop();
    } else {
      speakSteps(text.instructions, activeLang);
    }
  };

  const videoSource = getExerciseVideo(exercise.id);

  return (
    <Screen scrollable>
      <Stack.Screen options={{ title: text.name }} />

      <View style={{ marginTop: theme.spacing.md, alignItems: "center" }}>
        {videoSource !== undefined ? (
          <ExerciseVideoPlayer source={videoSource} />
        ) : (
          <ExerciseImagePlayer exerciseId={exercise.id} />
        )}
      </View>

      <View style={{ marginTop: theme.spacing.lg }}>
        <Pressable
          onPress={onTogglePlay}
          style={[
            styles.playButton,
            {
              backgroundColor: speaking
                ? theme.colors.surfaceAlt
                : theme.colors.primary,
              borderColor: speaking ? theme.colors.primary : "transparent",
              borderWidth: speaking ? 1 : 0,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            speaking ? t("exercises.stop") : t("exercises.playInstructions")
          }
        >
          <Ionicons
            name={speaking ? "stop" : "volume-high"}
            size={20}
            color={speaking ? theme.colors.primary : "#fff"}
          />
          <Text
            style={{
              marginLeft: 8,
              fontWeight: "700",
              color: speaking ? theme.colors.primary : "#fff",
            }}
          >
            {speaking ? t("exercises.stop") : t("exercises.playInstructions")}
          </Text>
        </Pressable>
        {ukVoiceMissing ? (
          <Text
            style={{
              marginTop: 6,
              fontSize: 12,
              color: theme.colors.textMuted,
            }}
          >
            {t("exercises.ukVoiceMissing")}
          </Text>
        ) : null}
      </View>

      <SectionHeading>{t("exercises.instructionsHeading")}</SectionHeading>
      <Card>
        {text.instructions.map((step, i) => (
          <View key={i} style={styles.numberedRow}>
            <Text style={[styles.number, { color: theme.colors.primary }]}>
              {i + 1}.
            </Text>
            <Text style={{ color: theme.colors.text, flex: 1, lineHeight: 20 }}>
              {step}
            </Text>
          </View>
        ))}
      </Card>

      {text.common_mistakes.length > 0 ? (
        <>
          <SectionHeading>{t("exercises.commonMistakesHeading")}</SectionHeading>
          <Card>
            {text.common_mistakes.map((m, i) => (
              <View key={i} style={styles.bulletRow}>
                <Text style={[styles.bullet, { color: theme.colors.textMuted }]}>
                  •
                </Text>
                <Text style={{ color: theme.colors.text, flex: 1, lineHeight: 20 }}>
                  {m}
                </Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {(text.modifications.easier || text.modifications.harder) ? (
        <>
          <SectionHeading>{t("exercises.modificationsHeading")}</SectionHeading>
          {text.modifications.easier ? (
            <Card>
              <Text
                style={[styles.modLabel, { color: theme.colors.primary }]}
              >
                {t("exercises.easier")}
              </Text>
              <Text
                style={{ color: theme.colors.text, marginTop: 4, lineHeight: 20 }}
              >
                {text.modifications.easier}
              </Text>
            </Card>
          ) : null}
          {text.modifications.harder ? (
            <Card style={{ marginTop: theme.spacing.sm }}>
              <Text
                style={[styles.modLabel, { color: theme.colors.primary }]}
              >
                {t("exercises.harder")}
              </Text>
              <Text
                style={{ color: theme.colors.text, marginTop: 4, lineHeight: 20 }}
              >
                {text.modifications.harder}
              </Text>
            </Card>
          ) : null}
        </>
      ) : null}

      <MetaRow
        bodyParts={exercise.body_parts}
        difficulty={exercise.difficulty}
      />
    </Screen>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <Text
      style={{
        color: theme.colors.textMuted,
        fontSize: 11,
        fontWeight: "700",
        letterSpacing: 0.8,
        marginTop: 18,
        marginBottom: 6,
      }}
    >
      {typeof children === "string" ? children.toUpperCase() : children}
    </Text>
  );
}

function MetaRow({
  bodyParts,
  difficulty,
}: {
  bodyParts: string[];
  difficulty: number;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <View style={{ marginTop: 18 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {bodyParts.map((p) => (
          <Chip key={p} label={t(`enums:bodyParts.${p}`)} />
        ))}
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginTop: 10,
        }}
      >
        <Text
          style={{
            color: theme.colors.textMuted,
            fontSize: 12,
            fontWeight: "700",
            letterSpacing: 0.8,
            marginRight: 8,
          }}
        >
          {t("exercises.difficultyLabel").toUpperCase()}
        </Text>
        {[1, 2, 3, 4, 5].map((n) => (
          <View
            key={n}
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              marginRight: 4,
              backgroundColor:
                n <= difficulty ? theme.colors.primary : theme.colors.surfaceAlt,
            }}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  playButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 999,
  },
  numberedRow: {
    flexDirection: "row",
    paddingVertical: 6,
  },
  number: {
    fontWeight: "700",
    width: 22,
  },
  bulletRow: {
    flexDirection: "row",
    paddingVertical: 4,
  },
  bullet: {
    width: 16,
    fontSize: 16,
    lineHeight: 20,
  },
  modLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
});
