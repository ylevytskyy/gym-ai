import React, { createContext, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";
import {
  darkColors,
  lightColors,
  radius,
  spacing,
  type ThemeColors,
  type ThemeRadius,
  type ThemeSpacing,
} from "./colors";
import { useSettingsStore } from "@src/store/settingsStore";

export interface Theme {
  dark: boolean;
  colors: ThemeColors;
  spacing: ThemeSpacing;
  radius: ThemeRadius;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const preference = useSettingsStore((s) => s.theme);

  const theme = useMemo<Theme>(() => {
    const dark =
      preference === "dark" ||
      (preference === "system" && systemScheme === "dark");
    return {
      dark,
      colors: dark ? darkColors : lightColors,
      spacing,
      radius,
    };
  }, [preference, systemScheme]);

  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  const t = useContext(ThemeContext);
  if (!t) throw new Error("useTheme must be used inside ThemeProvider");
  return t;
}
