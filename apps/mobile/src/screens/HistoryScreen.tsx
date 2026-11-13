import { useEffect, useState, type ReactNode } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { useHealth } from '@/health/HealthProvider';
import { healthTrends, weekSummary, type HistoryLog } from '@/history/model';
import { loadHistory } from '@/history/repository';
import { useServices } from '@/services';
import { Banner, Body, Card, ErrorText, Grid, Header, IconBubble, Label, ListRow, SectionTitle, Screen, Stat, usePalette, type IconName, type Tone } from '@/ui/kit';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateOf = (iso: string) => {
  const at = new Date(iso);
  return `${at.getDate()} ${MONTHS[at.getMonth()]}`;
};
const hours = (minutes: number) => `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
const BAR_HEIGHT = 56;

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
          <View key={bar.day} style={[styles.slot, { backgroundColor: palette.surfaceAlt }]}>
            {bar.value === undefined ? null : (
              <LinearGradient
                testID={`${name}-bar-${bar.day}`}
                colors={palette.gradient}
                start={{ x: 0, y: 1 }}
                end={{ x: 0, y: 0 }}
                style={[styles.bar, { height: Math.max(3, Math.round(bar.value * BAR_HEIGHT)) }]}
              />
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

/** One trend: an icon, its name, the figure, and the sentence a screen reader says. */
function Trend({ icon, tone, title, value, sentence, children }: { icon: IconName; tone: Tone; title: string; value: string; sentence: string; children?: ReactNode }) {
  const palette = usePalette();
  return (
    <View style={styles.trend}>
      <View style={styles.trendHead} accessible accessibilityLabel={sentence}>
        <IconBubble name={icon} tone={tone} size={34} />
        <Text style={[styles.trendTitle, { color: palette.muted }]}>{title}</Text>
        <Text style={[styles.trendValue, { color: palette.text }]}>{value}</Text>
      </View>
      {children}
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
      <Header eyebrow="Your progress" title="History" />

      {logs !== null && !error ? (
        <View accessible accessibilityLabel={`This week: ${week.workouts} ${week.workouts === 1 ? 'workout' : 'workouts'}, ${week.minutes} min`} testID="week">
          <Grid>
            <Stat icon="flame" tone="warn" value={String(week.workouts)} label={week.workouts === 1 ? 'workout this week' : 'workouts this week'} />
            <Stat icon="time" value={String(week.minutes)} label="minutes this week" />
          </Grid>
        </View>
      ) : null}

      <SectionTitle>Workouts</SectionTitle>
      <Card testID="workouts" style={styles.list}>
        {logs === null ? <Body muted>Loading…</Body> : null}
        <ErrorText>{error}</ErrorText>
        {logs !== null && logs.length === 0 && !error ? (
          <View style={styles.empty}>
            <IconBubble name="barbell-outline" size={48} />
            <Body muted center testID="history-empty">
              Nothing finished yet. Your sessions appear here once you save one.
            </Body>
          </View>
        ) : null}
        {(logs ?? []).map((log, index) => (
          <ListRow
            key={log.id}
            testID={`log-${log.id}`}
            accessibilityLabel={describeLog(log, healthName)}
            icon="checkmark"
            tone="good"
            title={`Day ${log.day_number} · ${log.duration_minutes} min`}
            subtitle={[
              ...(log.sets > 0 ? [`${log.sets} ${log.sets === 1 ? 'set' : 'sets'}`] : []),
              ...(log.rating === null ? [] : [`felt ${log.rating} of 5`]),
              ...(log.health_record_id ? [`in ${healthName}`] : []),
            ].join(' · ') || undefined}
            right={dateOf(log.completed_at)}
            last={index === (logs ?? []).length - 1}
          />
        ))}
      </Card>

      {healthState === 'connected' ? (
        <>
          <SectionTitle>Last 14 days</SectionTitle>
          <Card testID="trends">
            <Label>From {healthName}</Label>
            <Trend
              icon="footsteps"
              tone="accent"
              title="Steps a day"
              value={trends.avgSteps === undefined ? 'No data' : String(trends.avgSteps)}
              sentence={trends.avgSteps === undefined ? 'Steps: no data' : `Steps: ${trends.avgSteps} a day on average`}>
              <Bars label="Steps by day" name="steps" bars={trends.bars.map((bar) => ({ day: bar.day, value: bar.steps }))} />
            </Trend>
            <Trend
              icon="moon"
              tone="accent"
              title="Sleep a night"
              value={trends.avgSleepMinutes === undefined ? 'No data' : hours(trends.avgSleepMinutes)}
              sentence={trends.avgSleepMinutes === undefined ? 'Sleep: no data' : `Sleep: ${hours(trends.avgSleepMinutes)} a night on average`}>
              <Bars label="Sleep by night" name="sleep" bars={trends.bars.map((bar) => ({ day: bar.day, value: bar.sleep }))} />
            </Trend>
            <Trend
              icon="heart"
              tone="danger"
              title="Resting heart rate"
              value={trends.avgRestingHr === undefined ? 'No data' : `${trends.avgRestingHr} bpm`}
              sentence={trends.avgRestingHr === undefined ? 'Resting heart rate: no data' : `Resting heart rate: ${trends.avgRestingHr} bpm on average`}
            />
            <Trend
              icon="bicycle"
              tone="good"
              title="Workouts in other apps"
              value={trends.externalWorkouts.count === 0 ? 'None' : `${trends.externalWorkouts.count} · ${trends.externalWorkouts.minutes} min`}
              sentence={
                trends.externalWorkouts.count === 0
                  ? 'Workouts in other apps: none'
                  : `Workouts in other apps: ${trends.externalWorkouts.count}, ${trends.externalWorkouts.minutes} min`
              }
            />
            <Body muted>Totals from your phone, used to adjust your sessions. This is not a health assessment.</Body>
          </Card>
        </>
      ) : (
        <Banner icon="heart-outline" tone="neutral" testID="trends-off">
          <Body muted>Connect {healthName} on the Health tab to see your steps and sleep here.</Body>
        </Banner>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: 6, gap: 0 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 16 },
  trend: { gap: 10, paddingVertical: 4 },
  trendHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trendTitle: { flex: 1, fontSize: 15, fontWeight: '600' },
  trendValue: { fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: BAR_HEIGHT, gap: 4 },
  slot: { flex: 1, height: BAR_HEIGHT, justifyContent: 'flex-end', borderRadius: 4, overflow: 'hidden' },
  bar: { borderRadius: 4 },
});
