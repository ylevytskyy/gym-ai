import { Platform } from 'react-native';

import { PrivacyScreen } from '@/screens/PrivacyScreen';

export default function Privacy() {
  return <PrivacyScreen platform={Platform.OS === 'android' ? 'android' : 'ios'} />;
}
