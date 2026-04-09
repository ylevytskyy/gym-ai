import React, { useState } from "react";
import { View, Text, Pressable, Platform, StyleSheet } from "react-native";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { format, subYears } from "date-fns";
import { Screen } from "@src/components/Screen";
import { WizardFooter } from "@src/components/WizardFooter";
import { useTheme } from "@src/theme/ThemeProvider";
import { useOnboardingStore } from "@src/store/onboardingStore";
import { parseYYYYMMDD } from "@src/lib/dates";

const STEP = 2;
const TOTAL = 6;

export default function DobStep() {
  const theme = useTheme();
  const draft = useOnboardingStore((s) => s.draft);
  const setDraft = useOnboardingStore((s) => s.setDraft);

  const initial = draft.date_of_birth
    ? parseYYYYMMDD(draft.date_of_birth)
    : subYears(new Date(), 30);

  const [value, setValue] = useState<Date>(initial);
  const [pickerOpen, setPickerOpen] = useState(Platform.OS === "ios");
  const { t } = useTranslation();

  const onChange = (_e: DateTimePickerEvent, picked?: Date) => {
    if (Platform.OS === "android") {
      setPickerOpen(false);
      if (!picked) return;
    }
    if (picked) setValue(picked);
  };

  const next = () => {
    setDraft({ date_of_birth: format(value, "yyyy-MM-dd") });
    router.push("/onboarding/body");
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
          {t('onboarding.dob.title')}
        </Text>
        <Text
          style={{
            fontSize: 15,
            color: theme.colors.textMuted,
            marginBottom: theme.spacing.xl,
          }}
        >
          {t('onboarding.dob.subtitle')}
        </Text>

        {Platform.OS === "android" ? (
          <Pressable
            onPress={() => setPickerOpen(true)}
            style={[
              styles.fakeInput,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text style={{ fontSize: 18, color: theme.colors.text }}>
              {format(value, "MMMM d, yyyy")}
            </Text>
          </Pressable>
        ) : null}

        {pickerOpen ? (
          <DateTimePicker
            value={value}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            maximumDate={new Date()}
            minimumDate={new Date(1920, 0, 1)}
            onChange={onChange}
            themeVariant={theme.dark ? "dark" : "light"}
          />
        ) : null}
      </View>
      <WizardFooter
        step={STEP}
        total={TOTAL}
        onNext={next}
        onBack={() => router.back()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fakeInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
});
