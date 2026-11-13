import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { deleteHealthDays } from '@/account/repository';
import { AssistantError, deleteAccount } from '@/assistant/client';
import { useAuth } from '@/auth/AuthProvider';
import { clearMessages } from '@/chat/repository';
import { useHealth } from '@/health/HealthProvider';
import { useServices } from '@/services';
import { Banner, Body, Button, Card, ErrorText, Header, IconBubble, SectionTitle, Screen, usePalette, type IconName, type Tone } from '@/ui/kit';

/** A short paragraph with an icon in front of it. */
function Point({ icon, tone = 'accent', children, muted }: { icon: IconName; tone?: Tone; children: ReactNode; muted?: boolean }) {
  const palette = usePalette();
  return (
    <View style={styles.point}>
      <IconBubble name={icon} tone={tone} size={32} />
      <Text style={[styles.pointText, { color: muted ? palette.muted : palette.text }]}>{children}</Text>
    </View>
  );
}

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
      <Header eyebrow="Your data" title="Privacy and account" />

      <SectionTitle>What Aura Fit stores</SectionTitle>
      <Card>
        <Point icon="person">Your profile, your plans, the workouts you finish and your conversation with the coach.</Point>
        <Point icon="heart" tone="danger">
          From {healthName}, only one summary per day: steps, active energy, resting heart rate, sleep, weight and workouts from other apps.
          Detailed readings never leave your phone.
        </Point>
        <Point icon="sparkles">
          The coach is an AI service. It receives your profile, your plan, your conversation and a short summary of those daily totals (averages,
          last night&apos;s sleep, yesterday&apos;s steps, your latest weight), never the readings themselves.
        </Point>
        <Point icon="medkit" tone="neutral" muted>
          Aura Fit uses this to adjust your training. It is not medical advice and not a health assessment.
        </Point>
        <Point icon="ban" tone="good" muted>
          Nothing is used for advertising or sold.
        </Point>
      </Card>

      <ErrorText>{error}</ErrorText>
      {done ? (
        <Banner icon="checkmark-circle" tone="good">
          <Body testID="privacy-done">{done}</Body>
        </Banner>
      ) : null}

      <SectionTitle>Delete</SectionTitle>
      <Card>
        <Button label="Delete my health data" kind="danger" icon="heart-dislike-outline" busy={busy === 'health'} onPress={deleteHealth} testID="delete-health-data" />
        <Button label="Clear my conversation" kind="danger" icon="chatbubbles-outline" busy={busy === 'chat'} onPress={clearChat} testID="clear-chat" />
        <Button label="Delete my account" kind="danger" icon="trash-outline" busy={busy === 'account'} onPress={removeAccount} testID="delete-account" />
      </Card>

      <Button label="Back" kind="ghost" icon="chevron-back" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  pointText: { flex: 1, fontSize: 15, lineHeight: 22 },
});
