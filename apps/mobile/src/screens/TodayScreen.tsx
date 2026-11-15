import type { WorkoutDay } from '@aura-fit/health-core';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, AppState, StyleSheet, View } from 'react-native';

import { UsageNotice } from '@/assistant/UsageNotice';
import { exerciseById, exerciseName } from '@/catalog/catalog';
import { useHealth } from '@/health/HealthProvider';
import { endOfDay, localDayOf, startOfDay } from '@/health/local-day';
import { adjustedToday } from '@/plan/adjusted-today';
import { sessionOn, weekOf } from '@/plan/calendar';
import { dayKcal, itemKcal, kcalLabel } from '@/plan/energy';
import { dayTitle, WeekStrip } from '@/plan/WeekStrip';
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
const exerciseCount = (day: WorkoutDay) => day.blocks.reduce((sum, block) => sum + block.items.length, 0);
const exercisesLabel = (count: number) => `${count} ${count === 1 ? 'exercise' : 'exercises'}`;
/** The same day of the week, `weeks` weeks later. */
const shiftWeeks = (day: string, weeks: number) => {
  const at = startOfDay(day);
  return localDayOf(new Date(at.getFullYear(), at.getMonth(), at.getDate() + 7 * weeks));
};

/**
 * Renders again just after local midnight and when the app comes back to the front, so the
 * screen never keeps showing yesterday as today. The screen reads the clock itself on each render.
 */
function useDayChanges(): void {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const next = () => setTick((n) => n + 1);
    // Armed again after every tick, also when the day turned out not to have changed.
    const timer = setTimeout(next, Math.max(1000, endOfDay(localDayOf(new Date())).getTime() - Date.now() + 1000));
    const subscription = AppState.addEventListener('change', (state) => state === 'active' && next());
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [tick]);
}

/** The day's kcal estimate as a hero pill; nothing when it cannot be estimated. */
function KcalPill({ day, weightKg }: { day: WorkoutDay; weightKg: number | undefined }) {
  const kcal = dayKcal(day, weightKg, exerciseById);
  return kcal === undefined ? null : <Pill onHero icon="flame-outline" label={kcalLabel(kcal)} testID="session-kcal" />;
}

/** The warm-up, main and cool-down of one day, exercise by exercise, with a kcal estimate each when the weight is known. */
function SessionBlocks({ day, weightKg }: { day: WorkoutDay; weightKg: number | undefined }) {
  const estimated = dayKcal(day, weightKg, exerciseById) !== undefined;
  return (
    <>
      {day.blocks.map((block, index) => (
        <Card key={`${block.type}-${index}`} style={styles.blockCard}>
          <Label>{BLOCK_LABELS[block.type]}</Label>
          <View>
            {block.items.map((item, itemIndex) => {
              const name = exerciseName(item.exercise_id);
              const size = amount(item.exercise_id, item.sets, item.amount);
              const kcal = itemKcal(item, weightKg, exerciseById);
              const burn = kcal === undefined ? undefined : kcalLabel(kcal);
              return (
                <ListRow
                  key={`${item.exercise_id}-${itemIndex}`}
                  icon={BLOCK_ICONS[block.type]}
                  title={name}
                  subtitle={burn}
                  right={size}
                  last={itemIndex === block.items.length - 1}
                  accessibilityLabel={`${BLOCK_LABELS[block.type]}: ${name} ${size}${burn ? `, ${burn.replace('≈', 'about').replace('<', 'under')}` : ''}`}
                />
              );
            })}
          </View>
        </Card>
      ))}
      {estimated ? <Body muted>Calories are estimates from your weight and typical effort, not a measurement.</Body> : null}
    </>
  );
}

export function TodayScreen() {
  const router = useRouter();
  const { state, creating, createError, usage, create, reload } = usePlan();
  const { days: healthDays } = useHealth();
  const profile = useProfile().state;
  const { today } = useServices();
  const weightKg = profile.status === 'ready' ? profile.profile.weight_kg : undefined;
  useDayChanges();
  // One clock for the whole render: the strip and the session below always agree on today.
  const now = new Date();
  const todayDay = localDayOf(now);
  // The day chosen in the week strip and a day in the week shown, for one plan; none means today.
  const [picked, setPicked] = useState<{ planId: string; chosen: string | null; shownWeek: string | null } | null>(null);
  const planId = state.status === 'ready' ? state.stored.id : null;
  // A new plan starts on today again.
  const chosen = picked && picked.planId === planId ? picked.chosen : null;
  const shownWeek = picked && picked.planId === planId ? picked.shownWeek : null;
  const pick = (next: { chosen: string | null; shownWeek: string | null }) => planId !== null && setPicked({ planId, ...next });

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
          <UsageNotice usage={usage} kind="plan" />
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
      {state.status === 'none' ? <UsageNotice usage={usage} kind="plan" /> : null}
      {state.status === 'none' ? <ErrorText>{createError}</ErrorText> : null}

      {state.status === 'ready'
        ? (() => {
            const selected = chosen ?? todayDay;
            const sessionOf = (day: string) => sessionOn(state.stored.plan, state.logs, day, now, state.stored.storedAt);
            const strip = (
              <WeekStrip
                days={weekOf(shownWeek ?? selected)}
                today={todayDay}
                selected={selected}
                sessionOf={sessionOf}
                onSelect={(day) => pick({ chosen: day === todayDay ? null : day, shownWeek: null })}
                onWeek={(step) => pick({ chosen, shownWeek: shiftWeeks(shownWeek ?? selected, step) })}
              />
            );
            const backToToday = (
              <Button
                label="Back to today"
                kind="inverse"
                icon="today-outline"
                onPress={() => pick({ chosen: null, shownWeek: null })}
                testID="back-to-today"
              />
            );

            const other = selected === todayDay ? null : sessionOf(selected);
            if (other && other.kind !== 'today') {
              const shown = other.kind === 'upcoming' || other.kind === 'done' ? other.day : undefined;
              return (
                <>
                  {strip}
                  {shown ? (
                    <HeroCard testID="day-plan">
                      <HeroText kind="eyebrow">
                        {dayTitle(selected)} · Day {shown.day}
                      </HeroText>
                      <HeroText kind="title">{shown.title}</HeroText>
                      <View style={styles.pills}>
                        {other.kind === 'done' ? <Pill onHero icon="checkmark-circle" label="Done" /> : <Pill onHero icon="calendar-outline" label="Planned" />}
                        <Pill onHero icon="time-outline" label={`${shown.minutes} min`} />
                        <Pill onHero icon="list-outline" label={exercisesLabel(exerciseCount(shown))} />
                        <KcalPill day={shown} weightKg={weightKg} />
                      </View>
                      {other.kind === 'upcoming' ? <HeroText>Upcoming if you train every day</HeroText> : null}
                      {backToToday}
                    </HeroCard>
                  ) : (
                    <HeroCard testID={other.kind === 'done' ? 'day-done' : other.kind === 'rest' ? 'day-rest' : 'day-before-plan'}>
                      <HeroText kind="eyebrow">{dayTitle(selected)}</HeroText>
                      <HeroText kind="title">{other.kind === 'done' ? 'Workout done' : other.kind === 'rest' ? 'No workout' : 'Before this plan'}</HeroText>
                      <HeroText>
                        {other.kind === 'done'
                          ? 'A session was finished on this day. Its day is no longer in this plan.'
                          : other.kind === 'rest'
                            ? 'No session was finished on this day.'
                            : 'Your current plan started later than this day.'}
                      </HeroText>
                      {backToToday}
                    </HeroCard>
                  )}
                  {shown ? (
                    <>
                      <SectionTitle>{other.kind === 'done' ? 'The session' : 'Planned session'}</SectionTitle>
                      <SessionBlocks day={shown} weightKg={weightKg} />
                    </>
                  ) : null}
                </>
              );
            }

            const { day, doneToday, adjustment } = adjustedToday(
              state.stored.plan,
              state.logs,
              now,
              today(),
              healthDays,
              profile.status === 'ready' ? profile.profile : null,
            );
            return (
              <>
                {strip}
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
                    <Pill onHero icon="list-outline" label={exercisesLabel(exerciseCount(day))} />
                    <KcalPill day={day} weightKg={weightKg} />
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
                <SessionBlocks day={day} weightKg={weightKg} />

                <Button label="Make a new plan" kind="ghost" icon="refresh" busy={creating} onPress={confirmNewPlan} testID="new-plan" />
                <UsageNotice usage={usage} kind="plan" />
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
