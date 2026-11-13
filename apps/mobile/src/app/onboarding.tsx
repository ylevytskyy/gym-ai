import { Platform } from 'react-native';

import { OnboardingScreen } from '@/screens/OnboardingScreen';

export default function Onboarding() {
  return <OnboardingScreen platform={Platform.OS === 'android' ? 'android' : 'ios'} />;
}
