import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="trip/[id]"
        options={{
          headerShown: true,
          title: 'Active Trip',
          presentation: 'card',
        }}
      />
    </Stack>
  );
}
