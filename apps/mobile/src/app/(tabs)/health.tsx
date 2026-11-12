import { Platform } from 'react-native';

import { HealthSettingsScreen } from '@/screens/HealthSettingsScreen';

export default function Health() {
  return <HealthSettingsScreen platform={Platform.OS === 'android' ? 'android' : 'ios'} />;
}
