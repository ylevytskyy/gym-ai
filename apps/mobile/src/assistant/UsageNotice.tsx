import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { usePalette } from '@/ui/kit';

import { limitNotice, remainingHint, type Usage, type UsageKind } from './usage';

/**
 * The AI allowance, said quietly: when it is used up, when it comes back and one plain line about
 * Pro; otherwise how many are left once 3 or fewer remain. Shows nothing the rest of the time.
 * The Pro line is plain text: no screen opens from here.
 */
export function UsageNotice({ usage, kind }: { usage: Usage | null | undefined; kind: UsageKind }) {
  const palette = usePalette();
  const notice = limitNotice(usage, kind, new Date());
  if (notice) {
    return (
      <View testID="usage-limit" style={[styles.limit, { backgroundColor: palette.surfaceAlt }]}>
        <Ionicons name="moon-outline" size={18} color={palette.muted} style={styles.icon} />
        <View style={styles.lines}>
          <Text style={[styles.text, { color: palette.text }]}>{notice.text}</Text>
          {notice.pro ? <Text style={[styles.pro, { color: palette.muted }]}>{notice.pro}</Text> : null}
        </View>
      </View>
    );
  }
  const hint = remainingHint(usage, kind);
  return hint ? (
    <Text testID="usage-left" style={[styles.hint, { color: palette.muted }]}>
      {hint}
    </Text>
  ) : null;
}

const styles = StyleSheet.create({
  limit: { flexDirection: 'row', gap: 10, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
  icon: { marginTop: 2 },
  lines: { flex: 1, gap: 4 },
  text: { fontSize: 15, lineHeight: 21 },
  pro: { fontSize: 13, lineHeight: 18 },
  hint: { fontSize: 13, textAlign: 'center' },
});
