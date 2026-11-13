import { useRouter } from 'expo-router';
import { Platform } from 'react-native';

import { HealthSettingsScreen } from '@/screens/HealthSettingsScreen';

export default function Health() {
  const router = useRouter();
  return <HealthSettingsScreen platform={Platform.OS === 'android' ? 'android' : 'ios'} onOpenPrivacy={() => router.push('/privacy')} />;
}
