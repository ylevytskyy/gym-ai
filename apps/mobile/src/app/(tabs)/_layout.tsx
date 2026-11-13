import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Tabs } from 'expo-router';

import { usePalette } from '@/ui/kit';

type IconName = ComponentProps<typeof Ionicons>['name'];

// Filled glyph when the tab is focused, outline glyph otherwise.
// Expo Router types the tint as ColorValue; Ionicons only takes a string,
// so anything else falls back to the Ionicons default colour.
const tabIcon = (filled: IconName, outline: IconName) =>
  function TabIcon({ focused, color, size }: { focused: boolean; color: unknown; size: number }) {
    return (
      <Ionicons
        name={focused ? filled : outline}
        size={size}
        color={typeof color === 'string' ? color : undefined}
      />
    );
  };

export default function TabsLayout() {
  const palette = usePalette();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.muted,
        tabBarStyle: { backgroundColor: palette.surface, borderTopColor: palette.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: palette.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarButtonTestID: 'tab-today',
          tabBarIcon: tabIcon('barbell', 'barbell-outline'),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Coach',
          tabBarButtonTestID: 'tab-chat',
          tabBarIcon: tabIcon('chatbubble-ellipses', 'chatbubble-ellipses-outline'),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarButtonTestID: 'tab-history',
          tabBarIcon: tabIcon('time', 'time-outline'),
        }}
      />
      <Tabs.Screen
        name="health"
        options={{
          title: 'Health',
          tabBarButtonTestID: 'tab-health',
          tabBarIcon: tabIcon('heart', 'heart-outline'),
        }}
      />
    </Tabs>
  );
}
