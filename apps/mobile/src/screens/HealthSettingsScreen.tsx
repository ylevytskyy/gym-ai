import type { HealthDay } from '@aura-fit/health-core';

import { Linking, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { useHealth } from '@/health/HealthProvider';
import { useNudges } from '@/nudges/NudgeProvider';
import {
  Banner,
  Body,
  Button,
  Card,
  Choices,
  Grid,
  Header,
  HeroCard,
  HeroText,
  IconBubble,
  Label,
  Pill,
  Screen,
  SectionTitle,
  Stat,
  type IconName,
  type Tone,
} from '@/ui/kit';

const hours = (minutes: number) => `${Math.floor(minutes / 60)} h ${minutes % 60} min`;

/** Today's totals as lines of text. A measurement with no data is said to have none, never shown as 0. */
export function describeToday(day: HealthDay | null): { label: string; value: string }[] {
  const none = 'No data';
  return [
    { label: 'Steps', value: day?.steps === undefined ? none : String(day.steps) },
    { label: 'Active energy', value: day?.active_energy_kcal === undefined ? none : `${Math.round(day.active_energy_kcal)} kcal` },
    { label: 'Sleep last night', value: day?.sleep_minutes === undefined ? none : hours(day.sleep_minutes) },
    { label: 'Resting heart rate', value: day?.resting_hr_bpm === undefined ? none : `${Math.round(day.resting_hr_bpm)} bpm` },
    { label: 'Weight', value: day?.weight_kg === undefined ? none : `${day.weight_kg} kg` },
    {
      label: 'Workouts in other apps',
      value: day?.external_workouts?.length ? day.external_workouts.map((w) => `${w.type} ${w.minutes} min`).join(', ') : 'None today',
    },
  ];
}

/** How each of today's totals is drawn. */
const TODAY_LOOK: Record<string, { icon: IconName; tone: Tone }> = {
  Steps: { icon: 'footsteps', tone: 'accent' },
  'Active energy': { icon: 'flame', tone: 'warn' },
  'Sleep last night': { icon: 'moon', tone: 'accent' },
  'Resting heart rate': { icon: 'heart', tone: 'danger' },
  Weight: { icon: 'scale-outline', tone: 'neutral' },
  'Workouts in other apps': { icon: 'bicycle', tone: 'good' },
};

const clock = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
const timeOf = (at: Date) => `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
const START_HOURS = [7, 8, 9, 10, 11].map((value) => ({ value, label: clock(value) }));
const END_HOURS = [16, 17, 18, 19, 20, 21].map((value) => ({ value, label: clock(value) }));
const DAYS = [
  { value: 'weekdays' as const, label: 'Weekdays' },
  { value: 'every' as const, label: 'Every day' },
];

/** Break reminders (sitting nudges): off until the user turns them on, which is when notifications are asked for. */
function BreakReminders({ platform }: { platform: 'ios' | 'android' }) {
  const { status, busy, turnOn, turnOff, save } = useNudges();
  if (!status) return null;
  const { settings, permission, next, background } = status;
  const refused = permission === 'denied';

  return (
    <Card testID="nudges">
      <View style={styles.cardHead}>
        <IconBubble name="notifications" tone="warn" size={36} />
        <View style={styles.fill}>
          <Label>Break reminders</Label>
        </View>
        <Pill label={settings.enabled ? 'On' : 'Off'} tone={settings.enabled ? 'good' : 'neutral'} />
      </View>
      {!settings.enabled ? (
        <>
          <Body>
            After an hour with very few steps, Aura Fit can remind you to take a two-minute break: at most {settings.maxPerDay} times a
            day, only during the hours you choose.
          </Body>
          {refused ? (
            <>
              <Body>Notifications are turned off for Aura Fit. Allow them in Settings, then turn reminders on.</Body>
              <Button label="Open Settings" kind="secondary" icon="settings-outline" onPress={() => void Linking.openSettings()} testID="nudges-settings" />
            </>
          ) : null}
          <Button label="Turn on break reminders" icon="notifications-outline" busy={busy} onPress={() => void turnOn()} testID="nudges-on" />
        </>
      ) : (
        <>
          {refused ? (
            <>
              <Body>Notifications are turned off for Aura Fit, so no reminder can be shown. Allow them in Settings.</Body>
              <Button label="Open Settings" kind="secondary" icon="settings-outline" onPress={() => void Linking.openSettings()} testID="nudges-settings" />
            </>
          ) : next ? (
            <Body testID="nudges-next">Next reminder: {timeOf(next)}</Body>
          ) : (
            <Body testID="nudges-next">
              No reminder is planned right now. One is planned during your hours, once your phone has counted steps in the last day.
            </Body>
          )}
          <Choices label="From" options={START_HOURS} selected={[settings.startHour]} onToggle={(startHour) => void save({ startHour })} />
          <Choices label="Until" options={END_HOURS} selected={[settings.endHour]} onToggle={(endHour) => void save({ endHour })} />
          <Choices
            label="Days"
            options={DAYS}
            selected={[settings.weekdaysOnly ? 'weekdays' : 'every']}
            onToggle={(days) => void save({ weekdaysOnly: days === 'weekdays' })}
          />
          <Body muted>
            {platform === 'ios'
              ? 'Your phone passes on new steps about once an hour, so a reminder can arrive shortly after a walk.'
              : 'Your phone is checked for new steps from time to time, so a reminder can arrive shortly after a walk.'}
          </Body>
          {!background ? (
            <Body muted>Aura Fit cannot read your steps while it is closed, so reminders follow the last time you opened the app.</Body>
          ) : null}
          <Button label="Turn off break reminders" kind="ghost" busy={busy} onPress={() => void turnOff()} testID="nudges-off" />
        </>
      )}
    </Card>
  );
}

export function HealthSettingsScreen({ platform, onOpenPrivacy }: { platform: 'ios' | 'android'; onOpenPrivacy?: () => void }) {
  const { state, today, busy, connect, disconnect, openSettings } = useHealth();
  const { signOut } = useAuth();
  const name = platform === 'android' ? 'Health Connect' : 'Apple Health';
  const where = platform === 'android' ? 'Health Connect, under App permissions' : 'the Health app, under Sharing, then Apps';

  return (
    <Screen testID="health-settings">
      <Header eyebrow={name} title="Health" />

      {state === undefined ? <Body muted>Checking {name}…</Body> : null}

      {state === 'unavailable' ? (
        <Banner icon="information-circle" tone="neutral" testID="health-unavailable">
          <Body>{name} is not available on this device. Aura Fit works without it; your sessions are planned from your profile.</Body>
        </Banner>
      ) : null}

      {state === 'needs_update' ? (
        <Card testID="health-needs-update">
          <IconBubble name="download-outline" tone="warn" />
          <Body>Health Connect needs to be installed or updated before Aura Fit can use it.</Body>
          <Button label="Open Health Connect" kind="secondary" onPress={() => void openSettings()} testID="open-settings" />
        </Card>
      ) : null}

      {state === 'off' ? (
        <HeroCard testID="health-off">
          <IconBubble name="heart" onHero size={48} />
          <HeroText kind="title">Train with your data</HeroText>
          <HeroText>
            Connect {name} so Aura Fit can lighten a session after a short night, count workouts you do elsewhere, and save the
            workouts you finish here.
          </HeroText>
          <HeroText>
            Aura Fit reads steps, active energy, resting heart rate, sleep, weight and workouts, and keeps only one summary per
            day. Detailed readings never leave your phone.
          </HeroText>
          <Button label={`Connect ${name}`} kind="inverse" icon="link" busy={busy} onPress={() => void connect()} testID="connect-health" />
        </HeroCard>
      ) : null}

      {state === 'denied' ? (
        <Card testID="health-denied">
          <IconBubble name="lock-closed" tone="danger" />
          <Body>Aura Fit has no access to {name}. You can allow it in {where}.</Body>
          <Button label={`Open ${name}`} icon="open-outline" onPress={() => void openSettings()} testID="open-settings" />
          <Button label="Try again" kind="ghost" busy={busy} onPress={() => void connect()} testID="connect-health" />
        </Card>
      ) : null}

      {state === 'connected' ? (
        <>
          <Banner icon="checkmark-circle" tone="good" testID="health-connected">
            <Body>Connected to {name}.</Body>
            {platform === 'ios' ? (
              <Body muted>Apple Health does not tell apps which items you allowed. Anything you turned off shows as “No data”.</Body>
            ) : null}
          </Banner>

          <SectionTitle>Today</SectionTitle>
          <View testID="health-today">
            <Grid>
              {describeToday(today).map((row) => (
                <Stat
                  key={row.label}
                  icon={TODAY_LOOK[row.label]?.icon}
                  tone={TODAY_LOOK[row.label]?.tone}
                  value={row.value}
                  label={row.label}
                  testID={`today-${row.label}`}
                />
              ))}
            </Grid>
          </View>

          <SectionTitle>Reminders</SectionTitle>
          <BreakReminders platform={platform} />

          <Card>
            <Body muted>
              Disconnecting stops Aura Fit from reading or writing. To remove its access completely, turn it off in {where}.
            </Body>
            <View style={styles.row}>
              <View style={styles.fill}>
                <Button label="Disconnect" kind="danger" compact busy={busy} onPress={() => void disconnect()} testID="disconnect-health" />
              </View>
              <View style={styles.fill}>
                <Button label={`Open ${name}`} kind="secondary" compact onPress={() => void openSettings()} testID="open-settings" />
              </View>
            </View>
          </Card>
        </>
      ) : null}

      <SectionTitle>Account</SectionTitle>
      <Card testID={onOpenPrivacy ? 'privacy-link' : 'account'}>
        {onOpenPrivacy ? (
          <>
            <Body muted>See what Aura Fit stores, delete your health data or your conversation, or delete your account.</Body>
            <Button label="Privacy and account" kind="secondary" icon="shield-checkmark-outline" onPress={onOpenPrivacy} testID="open-privacy" />
          </>
        ) : null}
        <Button label="Sign out" kind="ghost" icon="log-out-outline" onPress={() => void signOut()} testID="sign-out" />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row', gap: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
