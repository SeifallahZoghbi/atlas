import { Tabs } from 'expo-router';
import { Text, View } from 'react-native';
import { useAuth } from '../../../src/contexts/AuthContext';

function TabIcon({ name }: { name: string }) {
  const icons: Record<string, string> = {
    feed: '📋',
    messages: '💬',
    profile: '👤',
    attendance: '✅',
    dismissal: '🚗',
    children: '👨‍👩‍👧',
    payments: '💳',
    forms: '✍️',
  };

  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: 24 }}>{icons[name] || '📄'}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const { user } = useAuth();
  const isTeacher = user?.role === 'teacher' || user?.role === 'admin';
  const isParent = user?.role === 'parent';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#4F46E5',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: '#E5E7EB',
          paddingTop: 8,
          paddingBottom: 8,
          height: 64,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        headerStyle: {
          backgroundColor: '#4F46E5',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Feed',
          headerTitle: 'School Feed',
          tabBarIcon: () => <TabIcon name="feed" />,
        }}
      />

      {/* Teacher/Admin: Attendance tab */}
      <Tabs.Screen
        name="attendance"
        options={{
          title: 'Attendance',
          headerTitle: 'Take Attendance',
          tabBarIcon: () => <TabIcon name="attendance" />,
          href: isTeacher ? '/attendance' : null,
        }}
      />

      {/* Teacher/Admin: Dismissal tab */}
      <Tabs.Screen
        name="dismissal"
        options={{
          title: 'Dismissal',
          headerTitle: 'Dismissal',
          tabBarIcon: () => <TabIcon name="dismissal" />,
          href: isTeacher ? '/dismissal' : null,
        }}
      />

      {/* Parent: Children tab */}
      <Tabs.Screen
        name="children"
        options={{
          title: 'Children',
          headerTitle: 'My Children',
          tabBarIcon: () => <TabIcon name="children" />,
          href: isParent ? '/children' : null,
        }}
      />

      {/* Parent: Payments tab */}
      <Tabs.Screen
        name="payments"
        options={{
          title: 'Payments',
          headerTitle: 'Payments',
          tabBarIcon: () => <TabIcon name="payments" />,
          href: isParent ? '/payments' : null,
        }}
      />

      {/* Parent: Forms tab */}
      <Tabs.Screen
        name="forms"
        options={{
          title: 'Forms',
          headerTitle: 'Forms',
          tabBarIcon: () => <TabIcon name="forms" />,
          href: isParent ? '/forms' : null,
        }}
      />

      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          headerTitle: 'Messages',
          tabBarIcon: () => <TabIcon name="messages" />,
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          headerTitle: 'My Profile',
          tabBarIcon: () => <TabIcon name="profile" />,
        }}
      />
    </Tabs>
  );
}
