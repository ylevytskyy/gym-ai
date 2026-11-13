import Constants from 'expo-constants';
import * as HealthConnect from 'react-native-health-connect';

import { createHealthConnectStore } from './health-connect-store';

// The app's own package name: workouts it wrote come back with this as their data origin.
const appId = Constants.expoConfig?.android?.package ?? '';

export const healthStore = createHealthConnectStore(HealthConnect, appId);
