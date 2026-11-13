import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarButtonTestID: 'tab-today' }} />
      <Tabs.Screen name="chat" options={{ title: 'Coach', tabBarButtonTestID: 'tab-chat' }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarButtonTestID: 'tab-history' }} />
      <Tabs.Screen name="health" options={{ title: 'Health', tabBarButtonTestID: 'tab-health' }} />
    </Tabs>
  );
}
