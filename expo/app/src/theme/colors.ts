// Color palette for light and dark themes.

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textInverse: string;
  primary: string;
  primaryMuted: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  required: string;
  preferred: string;
  optional: string;
  shadow: string;
}

export const lightColors: ThemeColors = {
  background: "#f5f6f8",
  surface: "#ffffff",
  surfaceAlt: "#f0f2f5",
  border: "#e4e6ea",
  text: "#13161a",
  textMuted: "#5c6370",
  textInverse: "#ffffff",
  primary: "#ff7a59",
  primaryMuted: "#ffe3da",
  accent: "#3b82f6",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  required: "#ff7a59",
  preferred: "#3b82f6",
  optional: "#94a3b8",
  shadow: "rgba(0,0,0,0.08)",
};

export const darkColors: ThemeColors = {
  background: "#0b0d10",
  surface: "#15181d",
  surfaceAlt: "#1c1f26",
  border: "#2a2e36",
  text: "#f5f6f8",
  textMuted: "#9099a8",
  textInverse: "#13161a",
  primary: "#ff8f75",
  primaryMuted: "#4b2317",
  accent: "#60a5fa",
  success: "#34d399",
  warning: "#fbbf24",
  danger: "#f87171",
  required: "#ff8f75",
  preferred: "#60a5fa",
  optional: "#64748b",
  shadow: "rgba(0,0,0,0.4)",
};

export interface ThemeSpacing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
}

export const spacing: ThemeSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export interface ThemeRadius {
  sm: number;
  md: number;
  lg: number;
  xl: number;
  pill: number;
}

export const radius: ThemeRadius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  pill: 999,
};
