import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { deleteHealthDays } from '@/account/repository';
import { AssistantError, deleteAccount } from '@/assistant/client';
import { useAuth } from '@/auth/AuthProvider';
import { clearMessages } from '@/chat/repository';
import { useHealth } from '@/health/HealthProvider';
import { useServices } from '@/services';
import { Body, Button, Card, ErrorText, Label, Screen, Title } from '@/ui/kit';

type Action = 'health' | 'chat' | 'account';

/** What Aura Fit stores, in short, and the three ways to delete it. The full text is docs/privacy.md. */
export function PrivacyScreen({ platform }: { platform: 'ios' | 'android' }) {
  const router = useRouter();
  const services = useServices();
  const { session, signOut } = useAuth();
  const { disconnect } = useHealth();
  const userId = session?.user.id;
  const token = session?.access_token;
  const healthName = platform === 'android' ? 'Health Connect' : 'Apple Health';

  const [busy, setBusy] = useState<Action | null>(null);
  const [done, setDone] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  const run = async (action: Action, work: () => Promise<string | undefined>) => {
    if (busy) return;
    setBusy(action);
    setDone(undefined);
    setError(undefined);
    try {
      setDone(await work());
    } catch (failure) {
      setError(failure instanceof AssistantError || failure instanceof Error ? failure.message : 'That did not work. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const confirm = (title: string, message: string, label: string, onConfirm: () => void) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: label, style: 'destructive', onPress: onConfirm },
    ]);

  const deleteHealth = () =>
    confirm(
      'Delete your health data?',
      `The daily summaries Aura Fit stored are deleted and ${healthName} is disconnected. What is in ${healthName} itself is not touched.`,
      'Delete data',
      () =>
        void run('health', async () => {
          if (!userId) return undefined;
          // Off first: nothing may be sent again while, or after, the rows are deleted.
          await disconnect();
          if ((await services.health.state()) === 'connected') {
            throw new Error(`${healthName} could not be disconnected, so nothing was deleted. Try again.`);
          }
          await deleteHealthDays(services.supabase, userId);
          return `Your health data was deleted and ${healthName} is disconnected.`;
        }),
    );

  const clearChat = () =>
    confirm('Clear the conversation?', 'Every message between you and the coach is deleted.', 'Clear', () =>
      void run('chat', async () => {
        if (!userId) return undefined;
        await clearMessages(services.supabase, userId);
        return 'Your conversation was cleared.';
      }),
    );

  const removeAccount = () =>
    confirm(
      'Delete your account?',
      'Your profile, plans, workouts, conversation and health summaries are deleted for good. This cannot be undone.',
      'Delete account',
      () =>
        void run('account', async () => {
          if (!token) return undefined;
          await deleteAccount(services.fetch, services.assistantUrl, token);
          await signOut();
          return undefined;
        }),
    );

  return (
    <Screen testID="privacy">
      <Title>Privacy and account</Title>

      <Card>
        <Label>What Aura Fit stores</Label>
        <Body>Your profile, your plans, the workouts you finish and your conversation with the coach.</Body>
        <Body>
          From {healthName}, only one summary per day: steps, active energy, resting heart rate, sleep, weight and workouts from other apps.
          Detailed readings never leave your phone.
        </Body>
        <Body>
          The coach is an AI service. It receives your profile, your plan, your conversation and a short summary of those daily totals (averages,
          last night&apos;s sleep, yesterday&apos;s steps, your latest weight), never the readings themselves.
        </Body>
        <Body muted>Aura Fit uses this to adjust your training. It is not medical advice and not a health assessment.</Body>
        <Body muted>Nothing is used for advertising or sold.</Body>
      </Card>

      <ErrorText>{error}</ErrorText>
      {done ? <Body testID="privacy-done">{done}</Body> : null}

      <Card>
        <Label>Delete</Label>
        <Button label="Delete my health data" kind="secondary" busy={busy === 'health'} onPress={deleteHealth} testID="delete-health-data" />
        <Button label="Clear my conversation" kind="secondary" busy={busy === 'chat'} onPress={clearChat} testID="clear-chat" />
        <Button label="Delete my account" kind="secondary" busy={busy === 'account'} onPress={removeAccount} testID="delete-account" />
      </Card>

      <Button label="Back" kind="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
