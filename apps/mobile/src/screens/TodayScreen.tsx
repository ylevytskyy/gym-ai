import { useRouter } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { exerciseById, exerciseName } from '@/catalog/catalog';
import { useHealth } from '@/health/HealthProvider';
import { adjustedToday } from '@/plan/adjusted-today';
import { usePlan } from '@/plan/PlanProvider';
import { useProfile } from '@/profile/ProfileProvider';
import { useServices } from '@/services';
import {
  Banner,
  Body,
  Button,
  Card,
  ErrorText,
  Header,
  HeroCard,
  HeroText,
  IconBubble,
  Label,
  ListRow,
  Pill,
  Screen,
  SectionTitle,
  type IconName,
} from '@/ui/kit';

const amount = (exerciseId: string, sets: number, count: number): string =>
  `${sets} × ${count}${exerciseById(exerciseId)?.unit === 'seconds' ? ' s' : ''}`;

const BLOCK_LABELS = { warm_up: 'Warm-up', main: 'Main', cool_down: 'Cool-down' } as const;
const BLOCK_ICONS: Record<keyof typeof BLOCK_LABELS, IconName> = { warm_up: 'sunny-outline', main: 'barbell-outline', cool_down: 'leaf-outline' };

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (at: Date) => `${WEEKDAYS[at.getDay()]}, ${at.getDate()} ${MONTHS[at.getMonth()]}`;

export function TodayScreen() {
  const router = useRouter();
  const { state, creating, createError, create, reload } = usePlan();
  const { days: healthDays } = useHealth();
  const profile = useProfile().state;
  const { today } = useServices();

  /** A new plan takes the place of the current one, so the user is asked first. */
  const confirmNewPlan = () =>
    Alert.alert('Make a new plan?', 'It is built again from your profile and replaces the current plan. Your day count starts again. This can take up to a minute.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Make a new plan', onPress: () => void create() },
    ]);

  return (
    <Screen testID="today">
      <Header eyebrow={longDate(new Date())} title="Today" />

      {state.status === 'loading' ? <Body muted>Loading your plan…</Body> : null}

      {state.status === 'error' ? (
        <Card testID="plan-error">
          <IconBubble name="cloud-offline-outline" tone="danger" />
          <Body>{state.message}</Body>
          <Button label="Try again" kind="secondary" icon="refresh" onPress={reload} />
          <Button label="Create a new plan" busy={creating} onPress={() => void create()} testID="create-plan" />
          <ErrorText>{createError}</ErrorText>
        </Card>
      ) : null}

      {state.status === 'none' ? (
        <HeroCard testID="no-plan">
          <HeroText kind="eyebrow">Your plan</HeroText>
          <HeroText kind="title">Let&apos;s build your first plan</HeroText>
          <HeroText>You do not have a plan yet. We will build one from your profile: short sessions, no equipment.</HeroText>
          <HeroText>This can take up to a minute.</HeroText>
          <Button label="Create my plan" kind="inverse" icon="sparkles" busy={creating} onPress={() => void create()} testID="create-plan" />
        </HeroCard>
      ) : null}
      {state.status === 'none' ? <ErrorText>{createError}</ErrorText> : null}

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
            const exercises = day.blocks.reduce((sum, block) => sum + block.items.length, 0);
            return (
              <>
                {adjustment ? (
                  <Banner icon="moon" tone="warn" testID="adjustment">
                    <Label>Adjusted for today</Label>
                    <Body>{adjustment.reason}</Body>
                    <Body muted>A training suggestion from your Health data, not medical advice.</Body>
                  </Banner>
                ) : null}

                <HeroCard testID="today-plan">
                  <HeroText kind="eyebrow">
                    Day {day.day} · about {day.minutes} min
                  </HeroText>
                  <HeroText kind="title">{day.title}</HeroText>
                  <View style={styles.pills}>
                    <Pill onHero icon="time-outline" label={`${day.minutes} min`} />
                    <Pill onHero icon="list-outline" label={`${exercises} ${exercises === 1 ? 'exercise' : 'exercises'}`} />
                    {doneToday ? <Pill onHero icon="checkmark-circle" label="Done today" /> : null}
                  </View>
                  {doneToday ? (
                    <View style={styles.done} testID="done-today">
                      <HeroText>Done for today. The next session is ready tomorrow.</HeroText>
                      <Button label="Do it again" kind="inverse" icon="repeat" onPress={() => router.push('/player')} testID="start-workout" />
                    </View>
                  ) : (
                    <Button label="Start workout" kind="inverse" icon="play" onPress={() => router.push('/player')} testID="start-workout" />
                  )}
                </HeroCard>

                <SectionTitle>Your session</SectionTitle>
                {day.blocks.map((block, index) => (
                  <Card key={`${block.type}-${index}`} style={styles.blockCard}>
                    <Label>{BLOCK_LABELS[block.type]}</Label>
                    <View>
                      {block.items.map((item, itemIndex) => {
                        const name = exerciseName(item.exercise_id);
                        const size = amount(item.exercise_id, item.sets, item.amount);
                        return (
                          <ListRow
                            key={`${item.exercise_id}-${itemIndex}`}
                            icon={BLOCK_ICONS[block.type]}
                            title={name}
                            right={size}
                            last={itemIndex === block.items.length - 1}
                            accessibilityLabel={`${BLOCK_LABELS[block.type]}: ${name} ${size}`}
                          />
                        );
                      })}
                    </View>
                  </Card>
                ))}

                <Button label="Make a new plan" kind="ghost" icon="refresh" busy={creating} onPress={confirmNewPlan} testID="new-plan" />
                <ErrorText>{createError}</ErrorText>
              </>
            );
          })()
        : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  done: { gap: 12 },
  blockCard: { paddingBottom: 6, gap: 4 },
});
