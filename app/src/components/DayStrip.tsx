import React, { useMemo } from "react";
import {
  ScrollView,
  Text,
  View,
  StyleSheet,
  Pressable,
} from "react-native";
import { format } from "date-fns";
import { useTheme } from "@src/theme/ThemeProvider";
import { parseYYYYMMDD, todayYYYYMMDD } from "@src/lib/dates";
import type { Day } from "@src/types";

interface DayStripProps {
  days: Day[];
  selectedDate: string;
  onSelect: (date: string) => void;
}

export function DayStrip({ days, selectedDate, onSelect }: DayStripProps) {
  const theme = useTheme();
  const today = useMemo(() => todayYYYYMMDD(), []);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: theme.spacing.sm, paddingVertical: 4 }}
    >
      {days.map((day) => {
        const selected = day.date === selectedDate;
        const isToday = day.date === today;
        const d = parseYYYYMMDD(day.date);
        const dow = format(d, "EEE").toUpperCase();
        const num = format(d, "d");
        const bg = selected
          ? theme.colors.primary
          : day.is_rest_day
            ? theme.colors.surfaceAlt
            : theme.colors.surface;
        const textColor = selected
          ? theme.colors.textInverse
          : theme.colors.text;
        const mutedColor = selected
          ? theme.colors.textInverse
          : theme.colors.textMuted;
        const borderColor = isToday
          ? theme.colors.primary
          : theme.colors.border;

        return (
          <Pressable
            key={day.date}
            onPress={() => onSelect(day.date)}
            style={[
              styles.item,
              {
                backgroundColor: bg,
                borderColor,
                borderRadius: theme.radius.lg,
                borderWidth: isToday ? 2 : 1,
              },
            ]}
          >
            <Text style={[styles.dow, { color: mutedColor }]}>{dow}</Text>
            <Text style={[styles.num, { color: textColor }]}>{num}</Text>
            {isToday ? (
              <Text
                style={[
                  styles.badge,
                  {
                    color: mutedColor,
                    fontSize: 9,
                  },
                ]}
              >
                TODAY
              </Text>
            ) : day.is_rest_day ? (
              <Text style={[styles.badge, { color: mutedColor }]}>Rest</Text>
            ) : (
              <Text style={[styles.badge, { color: mutedColor }]}>
                {day.sessions.length}
              </Text>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  item: {
    width: 62,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  dow: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  num: { fontSize: 22, fontWeight: "700", marginTop: 2 },
  badge: { fontSize: 10, fontWeight: "600", marginTop: 2 },
});
