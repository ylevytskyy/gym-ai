import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { ChatScreen } from '@/screens/ChatScreen';

export default function Chat() {
  // Counts the visits to this tab; the screen loads the conversation again on each one.
  const [visit, setVisit] = useState(0);
  useFocusEffect(useCallback(() => setVisit((n) => n + 1), []));
  return <ChatScreen refreshKey={visit} />;
}
