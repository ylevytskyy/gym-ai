import React from "react";
import {
  StyleSheet,
  View,
  ViewStyle,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useTheme } from "@src/theme/ThemeProvider";

interface ScreenProps {
  children: React.ReactNode;
  scrollable?: boolean;
  padded?: boolean;
  style?: ViewStyle;
  bottomSafeArea?: boolean;
}

export function Screen({
  children,
  scrollable = false,
  padded = true,
  style,
  bottomSafeArea = true,
}: ScreenProps) {
  const theme = useTheme();
  const container: ViewStyle = {
    flex: 1,
    backgroundColor: theme.colors.background,
  };
  const padding: ViewStyle = padded
    ? { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg }
    : {};

  return (
    <SafeAreaView
      style={container}
      edges={
        bottomSafeArea ? ["top", "bottom", "left", "right"] : ["top", "left", "right"]
      }
    >
      <StatusBar style={theme.dark ? "light" : "dark"} />
      <KeyboardAvoidingView
        style={styles.inner}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {scrollable ? (
          <ScrollView
            contentContainerStyle={[padding, style]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.inner, padding, style]}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  inner: { flex: 1 },
});
