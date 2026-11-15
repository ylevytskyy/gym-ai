import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { startOfDay } from '@/health/local-day';
import { haptic } from '@/ui/haptics';
import { IconButton, usePalette } from '@/ui/kit';

import type { DaySession } from './calendar';

const SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const STATUS: Record<DaySession['kind'], string> = {
  today: 'today',
  upcoming: 'planned',
  done: 'done',
  rest: 'no workout',
  before_plan: 'before this plan',
};

/** Seven days, Monday first, with arrows to the weeks before and after. One day is chosen. */
export function WeekStrip({
  days,
  today,
  selected,
  sessionOf,
  onSelect,
  onWeek,
}: {
  days: string[];
  today: string;
  selected: string;
  sessionOf: (day: string) => DaySession;
  onSelect: (day: string) => void;
  onWeek: (step: -1 | 1) => void;
}) {
  const palette = usePalette();
  return (
    <View style={styles.strip} testID="week-strip">
      <View style={styles.top}>
        <Text style={[styles.range, { color: palette.muted }]} numberOfLines={1}>
          {weekRange(days)}
        </Text>
        <View style={styles.arrows}>
          <IconButton icon="chevron-back" label="Previous week" onPress={() => onWeek(-1)} testID="week-prev" />
          <IconButton icon="chevron-forward" label="Next week" onPress={() => onWeek(1)} testID="week-next" />
        </View>
      </View>
      <View style={styles.days}>
        {days.map((day) => {
          const at = startOfDay(day);
          const session = sessionOf(day);
          const isSelected = day === selected;
          const isToday = day === today;
          const done = session.kind === 'done' || (session.kind === 'today' && session.doneToday);
          const planned = session.kind === 'upcoming' || (session.kind === 'today' && !session.doneToday);
          const ink = isSelected ? palette.onAccent : isToday ? palette.accent : palette.text;
          return (
            <Pressable
              key={day}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${LONG[at.getDay()]}, ${at.getDate()} ${MONTHS[at.getMonth()]}, ${
                session.kind === 'today' ? (session.doneToday ? 'today, done' : 'today') : STATUS[session.kind]
              }`}
              onPress={() => {
                haptic.select();
                onSelect(day);
              }}
              testID={`week-day-${day}`}
              style={({ pressed }) => [
                styles.day,
                isSelected ? { backgroundColor: palette.accent } : isToday ? { borderColor: palette.accent, borderWidth: 1.5 } : null,
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.weekday, { color: isSelected ? palette.onAccent : palette.muted }]}>{SHORT[at.getDay()]}</Text>
              <Text style={[styles.date, { color: ink }]}>{at.getDate()}</Text>
              <View style={styles.mark}>
                {done ? (
                  <Ionicons name="checkmark-circle" size={12} color={isSelected ? palette.onAccent : palette.good} />
                ) : planned ? (
                  <View style={[styles.dot, { backgroundColor: isSelected ? palette.onAccent : palette.accent }]} />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** "9 – 15 November", or "30 November – 6 December" across a month end. */
function weekRange(days: string[]): string {
  const first = startOfDay(days[0] as string);
  const last = startOfDay(days[days.length - 1] as string);
  return first.getMonth() === last.getMonth()
    ? `${first.getDate()} – ${last.getDate()} ${MONTHS[last.getMonth()]}`
    : `${first.getDate()} ${MONTHS[first.getMonth()]} – ${last.getDate()} ${MONTHS[last.getMonth()]}`;
}

/** "Friday, 13 November" for a local day. */
export function dayTitle(day: string): string {
  const at = startOfDay(day);
  return `${LONG[at.getDay()]}, ${at.getDate()} ${MONTHS[at.getMonth()]}`;
}

const styles = StyleSheet.create({
  strip: { gap: 8 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // Gives way to the arrows when large text makes it long.
  range: { flexShrink: 1, fontSize: 15, fontWeight: '600' },
  arrows: { flexDirection: 'row', gap: 8 },
  days: { flexDirection: 'row', gap: 4 },
  // At least 44 points each way: the smallest comfortable touch target.
  day: { flex: 1, minWidth: 44, minHeight: 44, alignItems: 'center', paddingVertical: 6, borderRadius: 12, borderWidth: 1.5, borderColor: 'transparent', gap: 2 },
  weekday: { fontSize: 11, fontWeight: '600' },
  date: { fontSize: 16, fontWeight: '700' },
  mark: { height: 12, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 5, height: 5, borderRadius: 3 },
  pressed: { opacity: 0.6 },
});
