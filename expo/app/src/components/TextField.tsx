import React from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { useTheme } from "@src/theme/ThemeProvider";

interface TextFieldProps extends TextInputProps {
  label?: string;
  helper?: string;
  error?: string;
}

export function TextField({ label, helper, error, style, ...rest }: TextFieldProps) {
  const theme = useTheme();
  return (
    <View style={{ width: "100%" }}>
      {label ? (
        <Text
          style={[
            styles.label,
            { color: theme.colors.textMuted, marginBottom: theme.spacing.xs },
          ]}
        >
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={theme.colors.textMuted}
        style={[
          styles.input,
          {
            backgroundColor: theme.colors.surface,
            borderColor: error ? theme.colors.danger : theme.colors.border,
            color: theme.colors.text,
            borderRadius: theme.radius.md,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.md,
          },
          style,
        ]}
        {...rest}
      />
      {helper && !error ? (
        <Text
          style={[
            styles.helper,
            { color: theme.colors.textMuted, marginTop: theme.spacing.xs },
          ]}
        >
          {helper}
        </Text>
      ) : null}
      {error ? (
        <Text
          style={[
            styles.helper,
            { color: theme.colors.danger, marginTop: theme.spacing.xs },
          ]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: "600" },
  input: {
    fontSize: 16,
    borderWidth: 1,
  },
  helper: { fontSize: 12 },
});
