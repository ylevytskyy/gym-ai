/**
 * Background work: the periodic task both platforms run when they see fit, and on iOS the
 * delivery of new steps. Both do the same thing (backgroundRefresh).
 *
 * The task has to be defined when the bundle loads, before any screen exists, because the
 * phone can start the app just to run it.
 */

import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';

import { showNudgesInForeground } from '@/nudges/expo-notifier';
import { getRealServices } from '@/real-services';

import { backgroundRefresh, createStepHandler } from './refresh';

const REFRESH_TASK = 'aura-fit-health-refresh';
/** The shortest interval the platforms accept; when the task really runs is up to the phone. */
const MINIMUM_INTERVAL_MINUTES = 15;

TaskManager.defineTask(REFRESH_TASK, async () => {
  try {
    await backgroundRefresh(getRealServices());
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

const stepHandler = () => {
  try {
    const services = getRealServices();
    handler ??= createStepHandler(services, () => AppState.currentState === 'active');
    return handler();
  } catch {
    // Without services (a missing configuration) there is nothing to refresh.
    return Promise.resolve();
  }
};
let handler: (() => Promise<void>) | undefined;
let watching = false;

/**
 * Listens for new steps also when no screen is mounted (iOS woke the app for them). HealthKit
 * refuses a listener before the user connected, so this is called again once Health is connected.
 */
export async function watchStepsInBackground(): Promise<void> {
  if (watching) return;
  try {
    const { health } = getRealServices();
    if ((await health.state()) !== 'connected' || watching) return;
    watching = true;
    health.watchSteps(() => void stepHandler());
  } catch {
    // Tried again on the next launch or connect.
  }
}

let started = false;

/** Called once when the app starts, in the foreground or woken in the background. */
export function startBackgroundWork(): void {
  if (started) return;
  started = true;
  showNudgesInForeground();
  void watchStepsInBackground();
  BackgroundTask.registerTaskAsync(REFRESH_TASK, { minimumInterval: MINIMUM_INTERVAL_MINUTES }).catch(() => {
    // Not available here (the iOS Simulator has no background tasks).
  });
}
