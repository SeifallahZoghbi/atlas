import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="chat/[id]"
        options={{
          headerShown: true,
          title: 'Chat',
          presentation: 'card',
        }}
      />
      <Stack.Screen
        name="child/[id]"
        options={{
          headerShown: true,
          title: 'Attendance',
          presentation: 'card',
        }}
      />
      <Stack.Screen
        name="pickup/[studentId]"
        options={{
          headerShown: true,
          title: 'Pickup Management',
          presentation: 'card',
        }}
      />
      <Stack.Screen
        name="form/[id]"
        options={{
          headerShown: true,
          title: 'Form',
          presentation: 'card',
        }}
      />
      <Stack.Screen
        name="payment/[id]"
        options={{
          headerShown: true,
          title: 'Payment',
          presentation: 'card',
        }}
      />
      <Stack.Screen
        name="bus/[studentId]"
        options={{
          headerShown: true,
          title: 'Bus Tracking',
          presentation: 'card',
        }}
      />
    </Stack>
  );
}
