import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import type { WorkoutDay } from '@aura-fit/health-core';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Alert, AppState, BackHandler } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { exerciseById, exerciseName, exerciseTips } from '@/catalog/catalog';
import { finishWorkout } from '@/plan/finish-workout';
import { useHealth } from '@/health/HealthProvider';
import { deskBreak } from '@/nudges/desk-break';
import { useNudges } from '@/nudges/NudgeProvider';
import { adjustedToday } from '@/plan/adjusted-today';
import { sessionKind, type StoredPlan } from '@/plan/model';
import { usePlan } from '@/plan/PlanProvider';
import { PlanError } from '@/plan/repository';
import { buildSteps, createSession, currentStep, reduce, secondsLeft, summarize, type Action } from '@/player/session';
import { INJURIES } from '@/profile/model';
import { useProfile } from '@/profile/ProfileProvider';
import { useServices } from '@/services';
import { Body, Button, Card, Choices, ErrorText, Label, Screen, Title } from '@/ui/kit';
import { VideoDemo } from '@/ui/VideoDemo';

const TICK_MS = 250;
const RATINGS = [1, 2, 3, 4, 5].map((value) => ({ value, label: String(value) }));

/** How long the player waits for Health and the profile before playing the session as planned. */
const HEALTH_WAIT_MS = 3000;

/** How much time one tick may add. A longer gap means the app was stalled, not that the user trained. */
const MAX_TICK_MS = 1000;

/** `stored` is null for a desk break: it belongs to no plan and is not saved. */
type Opened = { stored: StoredPlan | null; day: WorkoutDay };

/** Waits for the plan, then fixes the day for this visit: saving must not swap it for tomorrow's. */
export function PlayerScreen({ platform }: { platform: 'ios' | 'android' }) {
  const router = useRouter();
  const plan = usePlan().state;
  const userId = useAuth().session?.user.id;
  const { days: healthDays, state: healthState } = useHealth();
  const profile = useProfile().state;
  const { today } = useServices();
  const [opened, setOpened] = useState<Opened | null>(null);
  // The session is the same one Today showed, adjustment included. It waits for the first
  // Health check so the adjustment is not missed by opening the player a moment too early,
  // but not for long: without an answer the planned session is played.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), HEALTH_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);
  const healthReady = (healthState !== undefined && (healthState !== 'connected' || healthDays.length > 0)) || waited;
  if (!opened && userId && plan.status === 'ready' && healthReady && (profile.status !== 'loading' || waited)) {
    const session = adjustedToday(plan.stored.plan, plan.logs, new Date(), today(), healthDays, profile.status === 'ready' ? profile.profile : null);
    setOpened({ stored: plan.stored, day: session.day });
  }

  if (opened && userId) return <ActivePlayer platform={platform} opened={opened} userId={userId} />;
  return (
    <Screen testID="player">
      <Body>{userId && (plan.status === 'loading' || plan.status === 'ready') ? 'Loading your workout…' : 'There is no workout to play.'}</Body>
      <Button label="Back" kind="secondary" onPress={() => router.back()} />
    </Screen>
  );
}

/** The desk break a sitting nudge offers: a short session played like a workout, but never saved. */
export function BreakScreen({ platform }: { platform: 'ios' | 'android' }) {
  const router = useRouter();
  const profile = useProfile().state;
  const [opened, setOpened] = useState<Opened | null>(null);
  // The minute it was opened picks the exercises, so two breaks in a day differ.
  const [seed] = useState(() => Math.floor(Date.now() / 60_000));
  if (!opened && profile.status !== 'loading') {
    // Without a profile nothing is known about injuries, so only moves that are safe for all of them are used.
    const injuries = profile.status === 'ready' ? profile.profile.injuries : INJURIES;
    setOpened({ stored: null, day: deskBreak(injuries, seed) });
  }
  if (opened) return <ActivePlayer platform={platform} opened={opened} userId="" />;
  return (
    <Screen testID="player">
      <Body>Loading your break…</Body>
      <Button label="Back" kind="secondary" onPress={() => router.back()} />
    </Screen>
  );
}

function ActivePlayer({ platform, opened, userId }: { platform: 'ios' | 'android'; opened: Opened; userId: string }) {
  useKeepAwake();
  const router = useRouter();
  // No sitting nudge while a session is open, and none for an hour after it.
  const { hold, release, moved } = useNudges();
  const begun = useRef(false);
  useEffect(() => {
    void hold();
    return () => {
      // Only a session that was started counts as moving.
      void (begun.current ? moved() : release());
    };
  }, [hold, release, moved]);
  const stored = opened.stored;
  const services = useServices();
  const profile = useProfile().state;
  const plan = usePlan();

  const steps = useMemo(() => buildSteps(opened.day, (id) => exerciseById(id)?.unit), [opened]);
  const [session, rawDispatch] = useReducer(reduce, steps, createSession);
  useEffect(() => {
    if (session.status !== 'ready') begun.current = true;
  }, [session.status]);

  // Time comes from the clock, not from counting ticks, so a tick that arrives late still
  // accounts for the time that passed (up to a limit: a long gap is a stall, not training).
  const lastTick = useRef<number | null>(null);
  const flush = useCallback(() => {
    const now = Date.now();
    if (lastTick.current !== null) {
      const ms = Math.min(MAX_TICK_MS, now - lastTick.current);
      lastTick.current = now;
      if (ms > 0) rawDispatch({ type: 'tick', ms, now });
    }
    return now;
  }, []);
  /** Every press first books the time since the last tick, so no part of a set is lost. */
  const dispatch = useCallback(
    (action: Action) => {
      flush();
      rawDispatch(action);
    },
    [flush],
  );

  const active = session.status === 'active';
  useEffect(() => {
    if (!active) {
      lastTick.current = null;
      return;
    }
    lastTick.current = Date.now();
    const timer = setInterval(flush, TICK_MS);
    return () => clearInterval(timer);
  }, [active, flush]);

  // Leaving the app pauses the session: time in the background is not exercise, and it must
  // not end up in Health as energy.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status !== 'active') dispatch({ type: 'pause' });
    });
    return () => subscription.remove();
  }, [dispatch]);

  const [rating, setRating] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();
  const [saved, setSaved] = useState<'written' | 'not_written' | null>(null);
  // One id per session: pressing Save again after a failure saves the same row, never a second one.
  const [logId] = useState(() => services.newId());
  // Set as soon as a save starts, before any re-render: two presses in a row start one save.
  const saveStarted = useRef(false);

  const unsaved = stored !== null && (session.status === 'active' || session.status === 'paused' || (session.status === 'done' && summarize(session) !== null)) && !saved;
  const leave = useCallback(() => {
    if (!unsaved) {
      router.back();
      return;
    }
    Alert.alert('Leave this workout?', 'What you have done will not be saved.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => router.back() },
    ]);
  }, [unsaved, router]);

  // The Android back button asks first instead of dropping the session.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      leave();
      return true;
    });
    return () => subscription.remove();
  }, [leave]);

  const step = currentStep(session);
  const left = secondsLeft(session);
  const healthName = platform === 'android' ? 'Health Connect' : 'Apple Health';

  if (session.status === 'ready') {
    return (
      <Screen testID="player">
        <Title>{opened.day.title}</Title>
        <Body muted>
          {steps.filter((s) => s.kind === 'work').length} sets, about {opened.day.minutes} minutes. Stop if anything hurts.
        </Body>
        <Button label="Begin" onPress={() => dispatch({ type: 'start', now: Date.now() })} testID="begin" />
        <Button label="Back" kind="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (session.status === 'done' && stored === null) {
    return (
      <Screen testID="break-done">
        <Title>Break done</Title>
        <Body>Back to it. The next reminder is at least an hour away.</Body>
        <Button label="Close" onPress={leave} testID="leave-player" />
      </Screen>
    );
  }

  if (session.status === 'done' && stored !== null) {
    const summary = summarize(session);
    const save = async () => {
      if (!summary || saved || saveStarted.current) return;
      saveStarted.current = true;
      setSaving(true);
      setSaveError(undefined);
      try {
        const result = await finishWorkout(
          { client: services.supabase, health: services.health, exercise: exerciseById },
          {
            logId,
            userId,
            planId: stored.id,
            dayNumber: opened.day.day,
            title: opened.day.title,
            kind: sessionKind(opened.day, exerciseById),
            weightKg: profile.status === 'ready' ? profile.profile.weight_kg : 0,
            rating,
            summary,
          },
        );
        plan.addLog({ id: logId, plan_id: stored.id, day_number: opened.day.day, completed_at: new Date(summary.finishedAt).toISOString(), health_record_id: null });
        setSaved(result.health);
      } catch (error) {
        setSaveError(error instanceof PlanError ? error.message : 'Could not save your workout. Try again.');
      } finally {
        saveStarted.current = false;
        setSaving(false);
      }
    };

    return (
      <Screen testID="player-done">
        <Title>{summary ? 'Well done' : 'Session ended'}</Title>
        {summary ? (
          <>
            <Card testID="summary">
              <Body>
                {summary.duration_minutes} min · {summary.exercises_completed.reduce((sum, e) => sum + e.sets_done, 0)} sets
              </Body>
              {summary.exercises_completed.map((e) => (
                <Body key={e.exercise_id} muted>
                  {exerciseName(e.exercise_id)}: {e.sets_done} {e.sets_done === 1 ? 'set' : 'sets'}
                </Body>
              ))}
            </Card>
            {saved ? (
              <Card testID="saved">
                <Body>Saved.</Body>
                <Body muted>{saved === 'written' ? `Added to ${healthName}.` : `Not added to ${healthName}.`}</Body>
              </Card>
            ) : (
              <>
                <Choices label="How was it? (1 easy, 5 hard)" options={RATINGS} selected={rating ? [rating] : []} onToggle={(value) => setRating(value === rating ? null : value)} />
                <ErrorText>{saveError}</ErrorText>
                <Button label="Save workout" busy={saving} onPress={() => void save()} testID="save-workout" />
              </>
            )}
          </>
        ) : (
          <Body>No set was finished, so there is nothing to save.</Body>
        )}
        <Button label={saved || !summary ? 'Back to Today' : 'Discard'} kind="secondary" onPress={leave} testID="leave-player" />
      </Screen>
    );
  }

  const paused = session.status === 'paused';
  const exerciseId = step?.kind === 'work' ? step.exerciseId : step?.nextExerciseId;
  const video = exerciseId ? exerciseById(exerciseId)?.media.video : undefined;

  return (
    <Screen testID="player">
      <Label>
        Step {session.index + 1} of {session.steps.length}
      </Label>
      {video && exerciseId ? <VideoDemo url={services.mediaUrl(video)} playing={!paused} label={exerciseName(exerciseId)} /> : null}

      {step?.kind === 'rest' ? (
        <Card testID="rest">
          <Title>Rest</Title>
          <Body testID="countdown">{left} s</Body>
          <Body muted>Next: {exerciseName(step.nextExerciseId)}</Body>
          <Button label="Skip rest" kind="secondary" disabled={paused} onPress={() => dispatch({ type: 'complete', now: Date.now() })} testID="skip-rest" />
        </Card>
      ) : null}

      {step?.kind === 'work' ? (
        <Card testID="work">
          <Title>{exerciseName(step.exerciseId)}</Title>
          <Body>
            Set {step.set} of {step.sets}
          </Body>
          {step.unit === 'seconds' ? <Body testID="countdown">{left} s</Body> : <Body testID="reps">{step.amount} reps</Body>}
          {exerciseTips(step.exerciseId) ? <Body muted>{exerciseTips(step.exerciseId)}</Body> : null}
          {step.unit === 'reps' ? (
            <Button label="Done" disabled={paused} onPress={() => dispatch({ type: 'complete', now: Date.now() })} testID="set-done" />
          ) : null}
          <Button label="Skip this set" kind="secondary" disabled={paused} onPress={() => dispatch({ type: 'skip', now: Date.now() })} testID="skip-set" />
        </Card>
      ) : null}

      <Button
        label={paused ? 'Resume' : 'Pause'}
        kind="secondary"
        onPress={() => dispatch(paused ? { type: 'resume' } : { type: 'pause' })}
        testID="pause-resume"
      />
      <Button label={stored ? 'End workout' : 'End break'} kind="secondary" onPress={() => dispatch({ type: 'finish', now: Date.now() })} testID="end-workout" />
    </Screen>
  );
}
