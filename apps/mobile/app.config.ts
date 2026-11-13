import type { ExpoConfig } from 'expo/config';

/**
 * Health data this build reads and writes. Keep these three places in step when it changes:
 * here (what the stores are told), src/health/*-store.ts (what is requested at run time) and
 * the privacy text shown to the user.
 */
const HEALTH_CONNECT_PERMISSIONS = [
  'android.permission.health.READ_STEPS',
  'android.permission.health.READ_ACTIVE_CALORIES_BURNED',
  'android.permission.health.READ_RESTING_HEART_RATE',
  'android.permission.health.READ_SLEEP',
  'android.permission.health.READ_WEIGHT',
  'android.permission.health.READ_EXERCISE',
  'android.permission.health.WRITE_EXERCISE',
  'android.permission.health.WRITE_ACTIVE_CALORIES_BURNED',
  // Sitting nudges: lets the periodic task read steps while the app is closed. Asked for only
  // when the user turns break reminders on.
  'android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND',
];

const APP_ID = 'app.aurafit.mobile';

const config: ExpoConfig = {
  name: 'Aura Fit',
  slug: 'aura-fit',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'aurafit',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: APP_ID,
    icon: './assets/expo.icon',
    supportsTablet: false,
  },
  android: {
    package: APP_ID,
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    permissions: HEALTH_CONNECT_PERMISSIONS,
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-splash-screen',
      { backgroundColor: '#208AEF', image: './assets/images/splash-icon.png', imageWidth: 76 },
    ],
    [
      '@kingstinct/react-native-healthkit',
      {
        NSHealthShareUsageDescription:
          'Aura Fit reads your steps, active energy, resting heart rate, sleep, weight and workouts to adjust your daily session, and your date of birth to suggest an age range.',
        NSHealthUpdateUsageDescription: 'Aura Fit saves the workouts you finish to Health.',
        // Sitting nudges: HealthKit wakes the app when new steps arrive.
        background: true,
      },
    ],
    'react-native-health-connect',
    // Sitting nudges are local notifications; no push token is requested.
    'expo-notifications',
    // The periodic task that plans nudges again and syncs health days.
    'expo-background-task',
    [
      'expo-build-properties',
      { android: { minSdkVersion: 26 } },
    ],
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
};

export default config;
