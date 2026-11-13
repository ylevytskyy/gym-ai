import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

import { HistoryScreen } from '@/screens/HistoryScreen';

export default function History() {
  // Counts the visits to this tab; the screen loads the workouts again on each one.
  const [visit, setVisit] = useState(0);
  useFocusEffect(useCallback(() => setVisit((n) => n + 1), []));
  return <HistoryScreen platform={Platform.OS === 'android' ? 'android' : 'ios'} refreshKey={visit} />;
}
