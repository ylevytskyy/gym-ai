import * as HealthKit from '@kingstinct/react-native-healthkit';

import { createHealthKitStore } from './healthkit-store';

export const healthStore = createHealthKitStore(HealthKit);
