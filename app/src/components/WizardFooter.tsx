import React from "react";
import { View, StyleSheet, Text, Pressable } from "react-native";
import { Button } from "./Button";
import { useTheme } from "@src/theme/ThemeProvider";

interface WizardFooterProps {
  step: number;
  total: number;
  nextLabel?: string;
  nextDisabled?: boolean;
  onNext: () => void;
  onBack?: () => void;
  onSkip?: () => void;
}

export function WizardFooter({
  step,
  total,
  nextLabel = "Continue",
  nextDisabled,
  onNext,
  onBack,
  onSkip,
}: WizardFooterProps) {
  const theme = useTheme();
  return (
    <View style={{ paddingBottom: theme.spacing.md }}>
      <View style={styles.pills}>
        {Array.from({ length: total }).map((_, i) => {
          const on = i <= step;
          return (
            <View
              key={i}
              style={[
                styles.pill,
                {
                  backgroundColor: on
                    ? theme.colors.primary
                    : theme.colors.surfaceAlt,
                },
              ]}
            />
          );
        })}
      </View>
      <Text
        style={{
          color: theme.colors.textMuted,
          fontSize: 12,
          textAlign: "center",
          marginBottom: theme.spacing.md,
        }}
      >
        Step {step + 1} of {total}
      </Text>
      <Button label={nextLabel} onPress={onNext} disabled={nextDisabled} />
      <View style={styles.secondaryRow}>
        {onBack ? (
          <Pressable onPress={onBack} style={{ flex: 1, alignItems: "flex-start" }}>
            <Text style={{ color: theme.colors.textMuted, padding: 8 }}>
              ← Back
            </Text>
          </Pressable>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {onSkip ? (
          <Pressable onPress={onSkip} style={{ flex: 1, alignItems: "flex-end" }}>
            <Text style={{ color: theme.colors.textMuted, padding: 8 }}>
              Skip
            </Text>
          </Pressable>
        ) : (
          <View style={{ flex: 1 }} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pills: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
    justifyContent: "center",
  },
  pill: {
    height: 5,
    width: 24,
    borderRadius: 3,
  },
  secondaryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
});
