/**
 * Developer screen, local builds only: exercises the health store directly so reads and
 * writes can be checked on a simulator before the workout player exists.
 */

import type { HealthDay } from '@aura-fit/health-core';
import { useState } from 'react';

import { localDayOf } from '@/health/local-day';
import { readEnv } from '@/lib/env';
import { useServices } from '@/services';
import { Body, Button, Card, Screen, Title } from '@/ui/kit';

export function DevHealthScreen() {
  const { health, notifier } = useServices();
  const [recordId, setRecordId] = useState<string | null>(null);
  const [days, setDays] = useState<HealthDay[] | null>(null);
  const [message, setMessage] = useState('');

  if (readEnv().appEnv !== 'local') {
    return (
      <Screen>
        <Body>Not available in this build.</Body>
      </Screen>
    );
  }

  const read = async () => {
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    setDays(await health.readDays(localDayOf(yesterday), localDayOf(now)));
  };

  const write = async () => {
    const end = new Date();
    const start = new Date(end.getTime() - 15 * 60_000);
    const id = await health.writeWorkout({ start, end, kind: 'strength', title: 'Aura Fit test session', energyKcal: 96.5 });
    setRecordId(id);
    setMessage(id ? `Written: ${id}` : 'Not written (not connected, or writing not allowed)');
    await read();
  };

  const remove = async () => {
    if (!recordId) return;
    try {
      await health.deleteWorkout(recordId);
      setMessage('Deleted');
      setRecordId(null);
    } catch (error) {
      setMessage(`Delete failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    await read();
  };

  const recentSteps = async () => {
    const steps = await health.readRecentSteps(new Date());
    setMessage(steps === null ? 'Recent steps: unknown' : `Recent steps: ${JSON.stringify(steps)}`);
  };

  const testNudge = async () => {
    const permission = await notifier.request();
    if (permission !== 'granted') {
      setMessage(`Notifications: ${permission}`);
      return;
    }
    await notifier.schedule(new Date(Date.now() + 10_000));
    setMessage('A sitting nudge will show in 10 seconds');
  };

  return (
    <Screen testID="dev-health">
      <Title>Health (developer)</Title>
      <Button label="Read yesterday and today" onPress={() => void read()} testID="dev-read" />
      <Button label="Write a 15-minute test workout" kind="secondary" onPress={() => void write()} testID="dev-write" />
      <Button label="Delete the test workout" kind="secondary" disabled={!recordId} onPress={() => void remove()} testID="dev-delete" />
      <Button label="Read steps of the last hour" kind="secondary" onPress={() => void recentSteps()} testID="dev-steps" />
      <Button label="Show a sitting nudge in 10 seconds" kind="secondary" onPress={() => void testNudge()} testID="dev-nudge" />
      <Body testID="dev-message">{message}</Body>
      <Card>
        <Body testID="dev-days">{days ? JSON.stringify(days) : 'Nothing read yet'}</Body>
      </Card>
    </Screen>
  );
}
