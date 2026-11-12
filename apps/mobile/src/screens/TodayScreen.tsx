import { useRouter } from 'expo-router';

import { useAuth } from '@/auth/AuthProvider';
import { exerciseById, exerciseName } from '@/catalog/catalog';
import { useHealth } from '@/health/HealthProvider';
import { adjustedToday } from '@/plan/adjusted-today';
import { usePlan } from '@/plan/PlanProvider';
import { useProfile } from '@/profile/ProfileProvider';
import { useServices } from '@/services';
import { Body, Button, Card, ErrorText, Label, Screen, Title } from '@/ui/kit';

const amount = (exerciseId: string, sets: number, count: number): string =>
  `${sets} × ${count}${exerciseById(exerciseId)?.unit === 'seconds' ? ' s' : ''}`;

const BLOCK_LABELS = { warm_up: 'Warm-up', main: 'Main', cool_down: 'Cool-down' } as const;

export function TodayScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { state, creating, createError, create, reload } = usePlan();
  const { days: healthDays } = useHealth();
  const profile = useProfile().state;
  const { today } = useServices();

  return (
    <Screen testID="today">
      <Title>Today</Title>

      {state.status === 'loading' ? <Body muted>Loading your plan…</Body> : null}

      {state.status === 'error' ? (
        <Card testID="plan-error">
          <Body>{state.message}</Body>
          <Button label="Try again" kind="secondary" onPress={reload} />
          <Button label="Create a new plan" busy={creating} onPress={() => void create()} testID="create-plan" />
          <ErrorText>{createError}</ErrorText>
        </Card>
      ) : null}

      {state.status === 'none' ? (
        <Card testID="no-plan">
          <Body>You do not have a plan yet. We will build one from your profile: short sessions, no equipment.</Body>
          <Body muted>This can take up to a minute.</Body>
          <Button label="Create my plan" busy={creating} onPress={() => void create()} testID="create-plan" />
          <ErrorText>{createError}</ErrorText>
        </Card>
      ) : null}

      {state.status === 'ready'
        ? (() => {
            const { day, doneToday, adjustment } = adjustedToday(
              state.stored.plan,
              state.logs,
              new Date(),
              today(),
              healthDays,
              profile.status === 'ready' ? profile.profile : null,
            );
            return (
              <>
                {adjustment ? (
                  <Card testID="adjustment">
                    <Label>Adjusted for today</Label>
                    <Body>{adjustment.reason}</Body>
                    <Body muted>A training suggestion from your Health data, not medical advice.</Body>
                  </Card>
                ) : null}
                <Card testID="today-plan">
                  <Label>
                    Day {day.day} · about {day.minutes} min
                  </Label>
                  <Body>{day.title}</Body>
                  {day.blocks.map((block, index) => (
                    <Body key={`${block.type}-${index}`} muted>
                      {BLOCK_LABELS[block.type]}:{' '}
                      {block.items.map((item) => `${exerciseName(item.exercise_id)} ${amount(item.exercise_id, item.sets, item.amount)}`).join(', ')}
                    </Body>
                  ))}
                </Card>
                {doneToday ? (
                  <Card testID="done-today">
                    <Body>Done for today. The next session is ready tomorrow.</Body>
                    <Button label="Do it again" kind="secondary" onPress={() => router.push('/player')} testID="start-workout" />
                  </Card>
                ) : (
                  <Button label="Start workout" onPress={() => router.push('/player')} testID="start-workout" />
                )}
              </>
            );
          })()
        : null}

      <Button label="Sign out" kind="secondary" onPress={() => void signOut()} testID="sign-out" />
    </Screen>
  );
}
