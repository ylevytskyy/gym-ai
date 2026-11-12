import { Stack } from 'expo-router';
import { useMemo } from 'react';

import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { HealthProvider } from '@/health/HealthProvider';
import { ProfileProvider, useProfile } from '@/profile/ProfileProvider';
import { createRealServices } from '@/real-services';
import { ServicesProvider } from '@/services';
import { Body, Button, Screen } from '@/ui/kit';

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
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !hasProfile}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={hasProfile}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="dev-health" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const services = useMemo(() => createRealServices(), []);
  return (
    <ServicesProvider services={services}>
      <AuthProvider>
        <ProfileProvider>
          <HealthProvider>
            <Routes />
          </HealthProvider>
        </ProfileProvider>
      </AuthProvider>
    </ServicesProvider>
  );
}
