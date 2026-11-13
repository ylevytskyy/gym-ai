import { Platform } from 'react-native';

import { BreakScreen } from '@/screens/PlayerScreen';

export default function Break() {
  return <BreakScreen platform={Platform.OS === 'android' ? 'android' : 'ios'} />;
}
