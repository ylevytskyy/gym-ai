import type { HealthDay } from '@aura-fit/health-core';

import { Linking } from 'react-native';

import { useHealth } from '@/health/HealthProvider';
import { useNudges } from '@/nudges/NudgeProvider';
import { Body, Button, Card, Choices, Label, Screen, Title } from '@/ui/kit';

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
      <Label>Break reminders</Label>
      {!settings.enabled ? (
        <>
          <Body>
            After an hour with very few steps, Aura Fit can remind you to take a two-minute break: at most {settings.maxPerDay} times a
            day, only during the hours you choose.
          </Body>
          {refused ? (
            <>
              <Body>Notifications are turned off for Aura Fit. Allow them in Settings, then turn reminders on.</Body>
              <Button label="Open Settings" kind="secondary" onPress={() => void Linking.openSettings()} testID="nudges-settings" />
            </>
          ) : null}
          <Button label="Turn on break reminders" busy={busy} onPress={() => void turnOn()} testID="nudges-on" />
        </>
      ) : (
        <>
          {refused ? (
            <>
              <Body>Notifications are turned off for Aura Fit, so no reminder can be shown. Allow them in Settings.</Body>
              <Button label="Open Settings" kind="secondary" onPress={() => void Linking.openSettings()} testID="nudges-settings" />
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
          <Button label="Turn off break reminders" kind="secondary" busy={busy} onPress={() => void turnOff()} testID="nudges-off" />
        </>
      )}
    </Card>
  );
}

export function HealthSettingsScreen({ platform, onOpenPrivacy }: { platform: 'ios' | 'android'; onOpenPrivacy?: () => void }) {
  const { state, today, busy, connect, disconnect, openSettings } = useHealth();
  const name = platform === 'android' ? 'Health Connect' : 'Apple Health';
  const where = platform === 'android' ? 'Health Connect, under App permissions' : 'the Health app, under Sharing, then Apps';

  return (
    <Screen testID="health-settings">
      <Title>Health</Title>

      {state === undefined ? <Body muted>Checking {name}…</Body> : null}

      {state === 'unavailable' ? (
        <Card testID="health-unavailable">
          <Body>{name} is not available on this device. Aura Fit works without it; your sessions are planned from your profile.</Body>
        </Card>
      ) : null}

      {state === 'needs_update' ? (
        <Card testID="health-needs-update">
          <Body>Health Connect needs to be installed or updated before Aura Fit can use it.</Body>
          <Button label="Open Health Connect" kind="secondary" onPress={() => void openSettings()} testID="open-settings" />
        </Card>
      ) : null}

      {state === 'off' ? (
        <Card testID="health-off">
          <Body>
            Connect {name} so Aura Fit can lighten a session after a short night, count workouts you do elsewhere, and save the
            workouts you finish here.
          </Body>
          <Body muted>
            Aura Fit reads steps, active energy, resting heart rate, sleep, weight and workouts, and keeps only one summary per
            day. Detailed readings never leave your phone.
          </Body>
          <Button label={`Connect ${name}`} busy={busy} onPress={() => void connect()} testID="connect-health" />
        </Card>
      ) : null}

      {state === 'denied' ? (
        <Card testID="health-denied">
          <Body>Aura Fit has no access to {name}. You can allow it in {where}.</Body>
          <Button label={`Open ${name}`} onPress={() => void openSettings()} testID="open-settings" />
          <Button label="Try again" kind="secondary" busy={busy} onPress={() => void connect()} testID="connect-health" />
        </Card>
      ) : null}

      {state === 'connected' ? (
        <>
          <Card testID="health-connected">
            <Body>Connected to {name}.</Body>
            {platform === 'ios' ? (
              <Body muted>Apple Health does not tell apps which items you allowed. Anything you turned off shows as “No data”.</Body>
            ) : null}
          </Card>
          <Card testID="health-today">
            <Label>Today</Label>
            {describeToday(today).map((row) => (
              <Body key={row.label} testID={`today-${row.label}`}>
                {row.label}: {row.value}
              </Body>
            ))}
          </Card>
          <BreakReminders platform={platform} />
          <Card>
            <Body muted>
              Disconnecting stops Aura Fit from reading or writing. To remove its access completely, turn it off in {where}.
            </Body>
            <Button label="Disconnect" kind="secondary" busy={busy} onPress={() => void disconnect()} testID="disconnect-health" />
            <Button label={`Open ${name}`} kind="secondary" onPress={() => void openSettings()} testID="open-settings" />
          </Card>
        </>
      ) : null}
      {onOpenPrivacy ? (
        <Card testID="privacy-link">
          <Body muted>See what Aura Fit stores, delete your health data or your conversation, or delete your account.</Body>
          <Button label="Privacy and account" kind="secondary" onPress={onOpenPrivacy} testID="open-privacy" />
        </Card>
      ) : null}
    </Screen>
  );
}
