import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "@src/theme/ThemeProvider";

interface ProgressRingProps {
  size?: number;
  thickness?: number;
  progress: number; // 0..1
  label?: string;
  sublabel?: string;
  color?: string;
}

export function ProgressRing({
  size = 220,
  thickness = 14,
  progress,
  label,
  sublabel,
  color,
}: ProgressRingProps) {
  const theme = useTheme();
  const stroke = color ?? theme.colors.primary;
  const bg = theme.colors.surfaceAlt;

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  const dashOffset = circumference * (1 - clamped);

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={bg}
          strokeWidth={thickness}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={stroke}
          strokeWidth={thickness}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.labelWrap} pointerEvents="none">
        {label ? (
          <Text style={[styles.label, { color: theme.colors.text }]}>
            {label}
          </Text>
        ) : null}
        {sublabel ? (
          <Text style={[styles.sublabel, { color: theme.colors.textMuted }]}>
            {sublabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labelWrap: { position: "absolute", alignItems: "center" },
  label: { fontSize: 48, fontWeight: "700" },
  sublabel: { fontSize: 13, fontWeight: "500", marginTop: 4 },
});
