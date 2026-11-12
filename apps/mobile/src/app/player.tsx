import { Platform } from 'react-native';

import { PlayerScreen } from '@/screens/PlayerScreen';

export default function Player() {
  return <PlayerScreen platform={Platform.OS === 'android' ? 'android' : 'ios'} />;
}
