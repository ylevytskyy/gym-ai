import type { HealthDay } from '@aura-fit/health-core';

import { useHealth } from '@/health/HealthProvider';
import { Body, Button, Card, Label, Screen, Title } from '@/ui/kit';

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

export function HealthSettingsScreen({ platform }: { platform: 'ios' | 'android' }) {
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
          <Card>
            <Body muted>
              Disconnecting stops Aura Fit from reading or writing. To remove its access completely, turn it off in {where}.
            </Body>
            <Button label="Disconnect" kind="secondary" busy={busy} onPress={() => void disconnect()} testID="disconnect-health" />
            <Button label={`Open ${name}`} kind="secondary" onPress={() => void openSettings()} testID="open-settings" />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
