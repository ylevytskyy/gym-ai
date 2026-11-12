import { useAuth } from '@/auth/AuthProvider';
import { useProfile } from '@/profile/ProfileProvider';
import { Body, Button, Card, Screen, Title } from '@/ui/kit';

/** Placeholder until milestone 3 brings the plan and the workout player. */
export function TodayScreen() {
  const { state } = useProfile();
  const { signOut } = useAuth();
  return (
    <Screen testID="today">
      <Title>Today</Title>
      <Card>
        <Body>Your profile is saved{state.status === 'ready' ? `: ${state.profile.minutes_per_day} minutes a day.` : '.'}</Body>
        <Body muted>Your plan and the workout player arrive in the next build.</Body>
      </Card>
      <Button label="Sign out" kind="secondary" onPress={() => void signOut()} testID="sign-out" />
    </Screen>
  );
}
