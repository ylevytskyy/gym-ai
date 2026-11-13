import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { useHealth } from '@/health/HealthProvider';
import { healthTrends, weekSummary, type HistoryLog } from '@/history/model';
import { loadHistory } from '@/history/repository';
import { useServices } from '@/services';
import { Body, Card, ErrorText, Label, Screen, Title, usePalette } from '@/ui/kit';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateOf = (iso: string) => {
  const at = new Date(iso);
  return `${at.getDate()} ${MONTHS[at.getMonth()]}`;
};
const hours = (minutes: number) => `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
const BAR_HEIGHT = 48;

function describeLog(log: HistoryLog, healthName: string): string {
  return [
    dateOf(log.completed_at),
    `Day ${log.day_number}`,
    `${log.duration_minutes} min`,
    ...(log.sets > 0 ? [`${log.sets} ${log.sets === 1 ? 'set' : 'sets'}`] : []),
    ...(log.rating === null ? [] : [`felt ${log.rating} of 5`]),
    ...(log.health_record_id ? [`in ${healthName}`] : []),
  ].join(' · ');
}

/** One bar per day. A day without data leaves a gap: it is not drawn as zero. */
function Bars({ label, name, bars }: { label: string; name: 'steps' | 'sleep'; bars: { day: string; value: number | undefined }[] }) {
  const palette = usePalette();
  // No row at all when no day has a value: an empty chart would only be a gap.
  if (bars.every((bar) => bar.value === undefined)) return null;
  return (
    <View accessibilityLabel={label}>
      <View style={styles.bars}>
        {bars.map((bar) => (
          <View key={bar.day} style={styles.slot}>
            {bar.value === undefined ? null : (
              <View testID={`${name}-bar-${bar.day}`} style={{ height: Math.max(2, Math.round(bar.value * BAR_HEIGHT)), backgroundColor: palette.accent, borderRadius: 2 }} />
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

export function HistoryScreen({ platform, refreshKey = 0 }: { platform: 'ios' | 'android'; refreshKey?: number }) {
  const services = useServices();
  const userId = useAuth().session?.user.id;
  const { state: healthState, days } = useHealth();
  const healthName = platform === 'android' ? 'Health Connect' : 'Apple Health';

  const [logs, setLogs] = useState<HistoryLog[] | null>(null);
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    if (!userId) return;
    let active = true;
    loadHistory(services.supabase, userId)
      .then((loaded) => active && setLogs(loaded))
      .catch((failure: unknown) => {
        if (!active) return;
        setLogs([]);
        setError(failure instanceof Error ? failure.message : 'Could not load your workouts.');
      });
    return () => {
      active = false;
    };
    // Loaded again each time the tab is opened, so a session saved since then is there.
  }, [services.supabase, userId, refreshKey]);

  const week = weekSummary(logs ?? [], new Date());
  const trends = healthTrends(days);

  return (
    <Screen testID="history">
      <Title>History</Title>

      <Card testID="workouts">
        <Label>Workouts</Label>
        {logs === null ? <Body muted>Loading…</Body> : null}
        <ErrorText>{error}</ErrorText>
        {logs !== null && !error ? (
          <Body>
            This week: {week.workouts} {week.workouts === 1 ? 'workout' : 'workouts'}, {week.minutes} min
          </Body>
        ) : null}
        {logs !== null && logs.length === 0 && !error ? (
          <Body muted testID="history-empty">
            Nothing finished yet. Your sessions appear here once you save one.
          </Body>
        ) : null}
        {(logs ?? []).map((log) => (
          <Body key={log.id} muted testID={`log-${log.id}`}>
            {describeLog(log, healthName)}
          </Body>
        ))}
      </Card>

      {healthState === 'connected' ? (
        <Card testID="trends">
          <Label>Last 14 days from {healthName}</Label>
          <Body>{trends.avgSteps === undefined ? 'Steps: no data' : `Steps: ${trends.avgSteps} a day on average`}</Body>
          <Bars label="Steps by day" name="steps" bars={trends.bars.map((bar) => ({ day: bar.day, value: bar.steps }))} />
          <Body>{trends.avgSleepMinutes === undefined ? 'Sleep: no data' : `Sleep: ${hours(trends.avgSleepMinutes)} a night on average`}</Body>
          <Bars label="Sleep by night" name="sleep" bars={trends.bars.map((bar) => ({ day: bar.day, value: bar.sleep }))} />
          <Body>{trends.avgRestingHr === undefined ? 'Resting heart rate: no data' : `Resting heart rate: ${trends.avgRestingHr} bpm on average`}</Body>
          <Body>
            {trends.externalWorkouts.count === 0
              ? 'Workouts in other apps: none'
              : `Workouts in other apps: ${trends.externalWorkouts.count}, ${trends.externalWorkouts.minutes} min`}
          </Body>
          <Body muted>Totals from your phone, used to adjust your sessions. This is not a health assessment.</Body>
        </Card>
      ) : (
        <Card testID="trends-off">
          <Body muted>Connect {healthName} on the Health tab to see your steps and sleep here.</Body>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: BAR_HEIGHT, gap: 3 },
  slot: { flex: 1, justifyContent: 'flex-end' },
});
