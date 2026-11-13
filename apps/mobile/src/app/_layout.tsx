import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef } from 'react';

import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { startBackgroundWork, watchStepsInBackground } from '@/background/task';
import { HealthProvider, useHealth } from '@/health/HealthProvider';
import { NudgeProvider } from '@/nudges/NudgeProvider';
import { PlanProvider } from '@/plan/PlanProvider';
import { ProfileProvider, useProfile } from '@/profile/ProfileProvider';
import { getRealServices } from '@/real-services';
import { ServicesProvider, useServices } from '@/services';
import { Body, Button, Screen, usePalette } from '@/ui/kit';

// The phone can start the app only to run background work, so it is set up when the bundle loads.
startBackgroundWork();

/** Signed out → sign-in. Signed in without a profile → onboarding. Otherwise the tabs. */
function Routes() {
  const { session } = useAuth();
  const { state, reload } = useProfile();

  if (session === undefined || (session && state.status === 'loading')) {
    return (
      <Screen testID="loading">
        <Body muted>Loading…</Body>
      </Screen>
    );
  }
  if (session && state.status === 'error') {
    return (
      <Screen testID="profile-error">
        <Body>{state.message}</Body>
        <Button label="Try again" onPress={reload} />
      </Screen>
    );
  }

  const signedIn = Boolean(session);
  const hasProfile = signedIn && state.status === 'ready';
  return <SignedRoutes signedIn={signedIn} hasProfile={hasProfile} />;
}

function SignedRoutes({ signedIn, hasProfile }: { signedIn: boolean; hasProfile: boolean }) {
  const router = useRouter();
  const { notifier } = useServices();
  // Tapping a sitting nudge opens the desk break. Listening starts once the break can be shown,
  // so the tap that launched the app is not lost while the profile loads.
  // A break is not opened on top of a workout or another break.
  const pathname = usePathname();
  const inSession = useRef(false);
  useEffect(() => {
    inSession.current = pathname === '/player' || pathname === '/break';
  }, [pathname]);
  useEffect(() => {
    if (!hasProfile) return;
    return notifier.onTap(() => {
      if (!inSession.current) router.push('/break');
    });
  }, [hasProfile, notifier, router]);
  // HealthKit accepts a step listener only after the user connected.
  const healthState = useHealth().state;
  useEffect(() => {
    if (healthState === 'connected') void watchStepsInBackground();
  }, [healthState]);
  const palette = usePalette();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.background } }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !hasProfile}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={hasProfile}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="player" options={{ gestureEnabled: false }} />
        <Stack.Screen name="break" />
        <Stack.Screen name="privacy" />
        <Stack.Screen name="dev-health" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const services = useMemo(() => getRealServices(), []);
  return (
    <ServicesProvider services={services}>
      <AuthProvider>
        <ProfileProvider>
          <HealthProvider>
            <NudgeProvider>
              <PlanProvider>
                <StatusBar style="auto" />
                <Routes />
              </PlanProvider>
            </NudgeProvider>
          </HealthProvider>
        </ProfileProvider>
      </AuthProvider>
    </ServicesProvider>
  );
}
