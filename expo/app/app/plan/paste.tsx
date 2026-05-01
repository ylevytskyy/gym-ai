import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Pressable,
  Keyboard,
} from "react-native";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "react-i18next";

import { Screen } from "@src/components/Screen";
import { Button } from "@src/components/Button";
import { Card } from "@src/components/Card";
import { useTheme } from "@src/theme/ThemeProvider";
import { usePlanStore } from "@src/store/planStore";
import {
  validatePlan,
  planPreviewStats,
  type ValidationError,
} from "@src/lib/validate";
import { rescheduleAll } from "@src/lib/scheduler";
import type { WorkoutPlan } from "@src/types";

export default function PastePlan() {
  const theme = useTheme();
  const setPlan = usePlanStore((s) => s.setPlan);
  const { t } = useTranslation();

  const [raw, setRaw] = useState("");
  const [errors, setErrors] = useState<ValidationError[] | null>(null);
  const [valid, setValid] = useState<WorkoutPlan | null>(null);

  const pasteFromClipboard = async () => {
    const s = await Clipboard.getStringAsync();
    if (s) setRaw(s);
  };

  const runValidation = () => {
    Keyboard.dismiss();
    try {
      const result = validatePlan(raw);
      if (result.ok) {
        setErrors(null);
        setValid(result.plan);
      } else {
        setErrors(result.errors);
        setValid(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[paste] validatePlan threw:", e);
      setValid(null);
      setErrors([{ path: "(runtime)", message: `Validation crashed: ${msg}` }]);
    }
  };

  const savePlan = async () => {
    if (!valid) return;
    setPlan(valid);
    rescheduleAll(valid).catch(() => {});
    router.replace("/(tabs)");
  };

  return (
    <Screen scrollable>
      <Text style={[styles.title, { color: theme.colors.text }]}>
        {t('plan.paste.title')}
      </Text>
      <Text
        style={{
          color: theme.colors.textMuted,
          fontSize: 14,
          marginTop: 4,
          marginBottom: 16,
        }}
      >
        {t('plan.paste.subtitle')}
      </Text>

      <View
        style={[
          styles.inputWrap,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.md,
          },
        ]}
      >
        <TextInput
          value={raw}
          onChangeText={setRaw}
          placeholder={t('plan.paste.placeholder')}
          placeholderTextColor={theme.colors.textMuted}
          multiline
          textAlignVertical="top"
          style={{
            color: theme.colors.text,
            fontSize: 12,
            padding: 10,
            height: 220,
            fontFamily: "Menlo",
          }}
          autoCorrect={false}
          autoCapitalize="none"
          spellCheck={false}
        />
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
        <Button
          label={t('plan.paste.pasteFromClipboard')}
          variant="secondary"
          onPress={pasteFromClipboard}
          leftIcon={
            <Ionicons
              name="clipboard-outline"
              size={16}
              color={theme.colors.text}
            />
          }
        />
      </View>

      <View style={{ marginTop: 12 }}>
        <Button
          label={t('plan.paste.validate')}
          onPress={runValidation}
          disabled={raw.trim().length === 0}
        />
      </View>

      {errors && errors.length > 0 ? (
        <View style={{ marginTop: 16 }}>
          <Text
            style={{
              color: theme.colors.danger,
              fontWeight: "700",
              fontSize: 14,
              marginBottom: 8,
            }}
          >
            {t('plan.paste.errorsFound', { count: errors.length })}
          </Text>
          <Card>
            <ScrollView style={{ maxHeight: 320 }}>
              {errors.slice(0, 30).map((e, i) => (
                <View key={i} style={{ marginBottom: 10 }}>
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontSize: 13,
                      fontWeight: "600",
                    }}
                  >
                    {e.path}
                  </Text>
                  <Text
                    style={{
                      color: theme.colors.danger,
                      fontSize: 12,
                      marginTop: 2,
                    }}
                  >
                    {e.message}
                  </Text>
                  {e.hint ? (
                    <Text
                      style={{
                        color: theme.colors.textMuted,
                        fontSize: 12,
                        fontStyle: "italic",
                        marginTop: 2,
                      }}
                    >
                      {e.hint}
                    </Text>
                  ) : null}
                </View>
              ))}
              {errors.length > 30 ? (
                <Text
                  style={{
                    color: theme.colors.textMuted,
                    fontSize: 12,
                    fontStyle: "italic",
                  }}
                >
                  {t('plan.paste.moreErrors', { count: errors.length - 30 })}
                </Text>
              ) : null}
            </ScrollView>
          </Card>
        </View>
      ) : null}

      {valid ? (
        <View style={{ marginTop: 16 }}>
          <Text
            style={{
              color: theme.colors.success,
              fontWeight: "700",
              fontSize: 14,
              marginBottom: 8,
            }}
          >
            {t('plan.paste.looksGood')}
          </Text>
          <PlanPreviewCard plan={valid} />
          <View style={{ marginTop: 12 }}>
            <Button label={t('plan.paste.save')} onPress={savePlan} size="lg" />
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

function PlanPreviewCard({ plan }: { plan: WorkoutPlan }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const stats = planPreviewStats(plan);
  return (
    <Card>
      <PreviewRow label={t('plan.paste.stats.period')} value={`${stats.periodStart} → ${stats.periodEnd}`} />
      <PreviewRow label={t('plan.paste.stats.days')} value={t('plan.paste.stats.daysValue', { total: stats.days, active: stats.activeDays })} />
      <PreviewRow
        label={t('plan.paste.stats.sessions')}
        value={`${stats.totalSessions}`}
      />
      <PreviewRow
        label={t('plan.paste.stats.exercisesTotal')}
        value={`${stats.totalExercises}`}
      />
      <PreviewRow
        label={t('plan.paste.stats.estimatedCalories')}
        value={t('plan.paste.stats.estimatedCaloriesValue', { min: Math.round(stats.caloriesMin), max: Math.round(stats.caloriesMax) })}
      />
    </Card>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        paddingVertical: 6,
      }}
    >
      <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: "700" }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 26, fontWeight: "700", marginTop: 4 },
  inputWrap: { borderWidth: 1 },
});
