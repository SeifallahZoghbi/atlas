import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/contexts/AuthContext';

interface BusRoute {
  id: string;
  route_number: string;
  name: string;
  route_type: string;
  start_time: string | null;
  estimated_duration_minutes: number | null;
  bus: {
    bus_number: string;
    color: string | null;
  } | null;
  stops_count?: number;
}

interface BusTrip {
  id: string;
  trip_type: string;
  status: string;
  students_on_board: number;
  current_stop_index: number;
  route: {
    route_number: string;
    name: string;
  };
}

export default function DriverHomeScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [routes, setRoutes] = useState<BusRoute[]>([]);
  const [activeTrip, setActiveTrip] = useState<BusTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const currentHour = new Date().getHours();
  const suggestedTripType = currentHour < 12 ? 'morning' : 'afternoon';

  const fetchData = useCallback(async () => {
    if (!user) return;

    try {
      // Fetch assigned routes
      const { data: routeData, error: routeError } = await supabase
        .from('bus_routes')
        .select(`
          *,
          bus:buses (bus_number, color)
        `)
        .eq('driver_id', user.id)
        .eq('status', 'active');

      if (routeError) throw routeError;

      // Get stop counts for each route
      const routesWithStops = await Promise.all(
        (routeData || []).map(async (route) => {
          const { count } = await supabase
            .from('bus_stops')
            .select('*', { count: 'exact', head: true })
            .eq('route_id', route.id)
            .eq('active', true);

          return { ...route, stops_count: count || 0 };
        })
      );

      setRoutes(routesWithStops);

      // Check for active trip
      const { data: tripData } = await supabase
        .from('bus_trips')
        .select(`
          *,
          route:bus_routes (route_number, name)
        `)
        .eq('driver_id', user.id)
        .eq('trip_date', today)
        .eq('status', 'in_progress')
        .single();

      setActiveTrip(tripData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, today]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const startTrip = async (route: BusRoute) => {
    if (activeTrip) {
      Alert.alert(
        'Active Trip',
        'You already have an active trip. Please complete it first.',
        [{ text: 'Go to Trip', onPress: () => router.push(`/(app)/trip/${activeTrip.id}`) }]
      );
      return;
    }

    Alert.alert(
      'Start Trip',
      `Start ${suggestedTripType} route ${route.route_number}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start',
          onPress: async () => {
            try {
              const { data: trip, error } = await supabase
                .from('bus_trips')
                .insert({
                  school_id: user!.school_id,
                  route_id: route.id,
                  bus_id: route.bus?.bus_number ? route.bus : null,
                  driver_id: user!.id,
                  trip_date: today,
                  trip_type: suggestedTripType,
                  status: 'in_progress',
                  scheduled_start: route.start_time,
                  actual_start: new Date().toISOString(),
                })
                .select(`
                  *,
                  route:bus_routes (route_number, name)
                `)
                .single();

              if (error) throw error;

              setActiveTrip(trip);
              router.push(`/(app)/trip/${trip.id}`);
            } catch (error) {
              console.error('Error starting trip:', error);
              Alert.alert('Error', 'Failed to start trip');
            }
          },
        },
      ]
    );
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1E40AF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.greeting}>
            Hello, {user?.first_name || 'Driver'}!
          </Text>
          <Text style={styles.date}>
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
        </View>
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Active Trip Banner */}
        {activeTrip && (
          <TouchableOpacity
            style={styles.activeTripBanner}
            onPress={() => router.push(`/(app)/trip/${activeTrip.id}`)}
          >
            <View style={styles.activeTripIcon}>
              <Text style={styles.activeTripIconText}>🚌</Text>
            </View>
            <View style={styles.activeTripInfo}>
              <Text style={styles.activeTripLabel}>ACTIVE TRIP</Text>
              <Text style={styles.activeTripTitle}>
                Route {activeTrip.route.route_number}
              </Text>
              <Text style={styles.activeTripSubtitle}>
                {activeTrip.students_on_board} students on board
              </Text>
            </View>
            <Text style={styles.activeTripArrow}>→</Text>
          </TouchableOpacity>
        )}

        {/* Routes Section */}
        <Text style={styles.sectionTitle}>Your Routes</Text>

        {routes.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🚌</Text>
            <Text style={styles.emptyTitle}>No Routes Assigned</Text>
            <Text style={styles.emptyText}>
              Contact your admin to get routes assigned
            </Text>
          </View>
        ) : (
          <View style={styles.routesList}>
            {routes.map((route) => (
              <TouchableOpacity
                key={route.id}
                style={styles.routeCard}
                onPress={() => startTrip(route)}
              >
                <View style={styles.routeHeader}>
                  <View style={styles.routeNumber}>
                    <Text style={styles.routeNumberText}>{route.route_number}</Text>
                  </View>
                  <View style={styles.routeInfo}>
                    <Text style={styles.routeName}>{route.name}</Text>
                    <Text style={styles.routeMeta}>
                      {route.stops_count} stops
                      {route.estimated_duration_minutes &&
                        ` • ~${route.estimated_duration_minutes} min`}
                    </Text>
                  </View>
                  <View style={styles.routeType}>
                    <Text style={styles.routeTypeText}>
                      {route.route_type === 'morning'
                        ? '🌅'
                        : route.route_type === 'afternoon'
                        ? '🌆'
                        : '🔄'}
                    </Text>
                  </View>
                </View>

                {route.bus && (
                  <View style={styles.busInfo}>
                    <Text style={styles.busInfoText}>
                      🚌 Bus #{route.bus.bus_number}
                      {route.bus.color && ` (${route.bus.color})`}
                    </Text>
                  </View>
                )}

                <View style={styles.startButton}>
                  <Text style={styles.startButtonText}>
                    Start {suggestedTripType === 'morning' ? 'Morning' : 'Afternoon'} Route
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E40AF',
    padding: 20,
    paddingTop: 60,
  },
  headerContent: {
    flex: 1,
  },
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  date: {
    fontSize: 14,
    color: '#93C5FD',
    marginTop: 4,
  },
  signOutButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
  },
  signOutText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  activeTripBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
  },
  activeTripIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeTripIconText: {
    fontSize: 24,
  },
  activeTripInfo: {
    flex: 1,
    marginLeft: 12,
  },
  activeTripLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 1,
  },
  activeTripTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  activeTripSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
  },
  activeTripArrow: {
    fontSize: 24,
    color: '#fff',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    backgroundColor: '#fff',
    borderRadius: 16,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
  },
  routesList: {
    gap: 12,
  },
  routeCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 12,
  },
  routeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  routeNumber: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#1E40AF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  routeNumberText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  routeInfo: {
    flex: 1,
    marginLeft: 12,
  },
  routeName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
  routeMeta: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  routeType: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  routeTypeText: {
    fontSize: 20,
  },
  busInfo: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  busInfoText: {
    fontSize: 14,
    color: '#6B7280',
  },
  startButton: {
    marginTop: 16,
    backgroundColor: '#1E40AF',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
