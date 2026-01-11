import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/contexts/AuthContext';

interface BusAssignment {
  id: string;
  morning_route: {
    id: string;
    route_number: string;
    name: string;
    bus: { bus_number: string } | null;
  } | null;
  morning_stop: {
    id: string;
    name: string;
    scheduled_time: string | null;
  } | null;
  afternoon_route: {
    id: string;
    route_number: string;
    name: string;
    bus: { bus_number: string } | null;
  } | null;
  afternoon_stop: {
    id: string;
    name: string;
    scheduled_time: string | null;
  } | null;
  student: {
    first_name: string;
    last_name: string;
  };
}

interface ActiveTrip {
  id: string;
  trip_type: string;
  status: string;
  current_stop_index: number;
  students_on_board: number;
  current_latitude: number | null;
  current_longitude: number | null;
  last_location_update: string | null;
  route: {
    route_number: string;
    name: string;
  };
  bus: {
    bus_number: string;
  };
  stops_count: number;
}

interface BusScan {
  id: string;
  scan_type: 'board' | 'exit';
  scanned_at: string;
  stop: { name: string } | null;
}

export default function BusTrackingScreen() {
  const { studentId } = useLocalSearchParams<{ studentId: string }>();
  const { user } = useAuth();

  const [assignment, setAssignment] = useState<BusAssignment | null>(null);
  const [activeTrip, setActiveTrip] = useState<ActiveTrip | null>(null);
  const [todayScans, setTodayScans] = useState<BusScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const currentHour = new Date().getHours();
  const currentTripType = currentHour < 12 ? 'morning' : 'afternoon';

  const fetchData = useCallback(async () => {
    try {
      // Fetch bus assignment
      const { data: assignmentData } = await supabase
        .from('student_bus_assignments')
        .select(`
          *,
          morning_route:bus_routes!morning_route_id (
            id, route_number, name,
            bus:buses (bus_number)
          ),
          morning_stop:bus_stops!morning_stop_id (id, name, scheduled_time),
          afternoon_route:bus_routes!afternoon_route_id (
            id, route_number, name,
            bus:buses (bus_number)
          ),
          afternoon_stop:bus_stops!afternoon_stop_id (id, name, scheduled_time),
          student:students (first_name, last_name)
        `)
        .eq('student_id', studentId)
        .single();

      setAssignment(assignmentData);

      // Fetch active trip for current route
      const currentRouteId = currentTripType === 'morning'
        ? assignmentData?.morning_route?.id
        : assignmentData?.afternoon_route?.id;

      if (currentRouteId) {
        const { data: tripData } = await supabase
          .from('bus_trips')
          .select(`
            *,
            route:bus_routes (route_number, name),
            bus:buses (bus_number)
          `)
          .eq('route_id', currentRouteId)
          .eq('trip_date', today)
          .eq('trip_type', currentTripType)
          .in('status', ['scheduled', 'in_progress'])
          .single();

        if (tripData) {
          // Get stops count
          const { count } = await supabase
            .from('bus_stops')
            .select('*', { count: 'exact', head: true })
            .eq('route_id', currentRouteId)
            .eq('active', true);

          setActiveTrip({ ...tripData, stops_count: count || 0 });
        }
      }

      // Fetch today's scans for this student
      const { data: scansData } = await supabase
        .from('student_bus_scans')
        .select(`
          *,
          stop:bus_stops (name)
        `)
        .eq('student_id', studentId)
        .gte('scanned_at', `${today}T00:00:00`)
        .order('scanned_at', { ascending: false });

      setTodayScans(scansData || []);
    } catch (error) {
      console.error('Error fetching bus data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [studentId, today, currentTripType]);

  useEffect(() => {
    fetchData();

    // Subscribe to real-time updates
    const tripSubscription = supabase
      .channel('bus_trip_updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bus_trips',
          filter: `trip_date=eq.${today}`,
        },
        () => fetchData()
      )
      .subscribe();

    const scanSubscription = supabase
      .channel('bus_scan_updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'student_bus_scans',
          filter: `student_id=eq.${studentId}`,
        },
        () => fetchData()
      )
      .subscribe();

    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);

    return () => {
      tripSubscription.unsubscribe();
      scanSubscription.unsubscribe();
      clearInterval(interval);
    };
  }, [fetchData, today, studentId]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const getTimeAgo = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ago`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  const currentRoute = currentTripType === 'morning'
    ? assignment?.morning_route
    : assignment?.afternoon_route;

  const currentStop = currentTripType === 'morning'
    ? assignment?.morning_stop
    : assignment?.afternoon_stop;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: `${assignment?.student.first_name}'s Bus`,
          headerStyle: { backgroundColor: '#4F46E5' },
          headerTintColor: '#fff',
        }}
      />

      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#4F46E5']}
          />
        }
      >
        {/* Active Trip Status */}
        {activeTrip ? (
          <View style={[
            styles.statusCard,
            activeTrip.status === 'in_progress' ? styles.statusActive : styles.statusScheduled
          ]}>
            <View style={styles.statusHeader}>
              <Text style={styles.statusIcon}>🚌</Text>
              <View style={styles.statusInfo}>
                <Text style={styles.statusLabel}>
                  {activeTrip.status === 'in_progress' ? 'BUS IN TRANSIT' : 'SCHEDULED'}
                </Text>
                <Text style={styles.statusTitle}>
                  Route {activeTrip.route.route_number}
                </Text>
                <Text style={styles.statusSubtitle}>
                  Bus #{activeTrip.bus.bus_number}
                </Text>
              </View>
            </View>

            {activeTrip.status === 'in_progress' && (
              <>
                <View style={styles.progressSection}>
                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${(activeTrip.current_stop_index / activeTrip.stops_count) * 100}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.progressText}>
                    Stop {activeTrip.current_stop_index} of {activeTrip.stops_count}
                  </Text>
                </View>

                <View style={styles.tripStats}>
                  <View style={styles.tripStat}>
                    <Text style={styles.tripStatValue}>{activeTrip.students_on_board}</Text>
                    <Text style={styles.tripStatLabel}>Students On Board</Text>
                  </View>
                  <View style={styles.tripStat}>
                    <Text style={styles.tripStatValue}>
                      {activeTrip.last_location_update
                        ? getTimeAgo(activeTrip.last_location_update)
                        : '-'}
                    </Text>
                    <Text style={styles.tripStatLabel}>Last Update</Text>
                  </View>
                </View>
              </>
            )}
          </View>
        ) : (
          <View style={styles.noTripCard}>
            <Text style={styles.noTripIcon}>🚌</Text>
            <Text style={styles.noTripTitle}>No Active Trip</Text>
            <Text style={styles.noTripText}>
              The {currentTripType} bus hasn't started yet
            </Text>
          </View>
        )}

        {/* Student's Stop */}
        {currentStop && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {assignment?.student.first_name}'s Stop
            </Text>
            <View style={styles.stopCard}>
              <View style={styles.stopIcon}>
                <Text style={styles.stopIconText}>📍</Text>
              </View>
              <View style={styles.stopInfo}>
                <Text style={styles.stopName}>{currentStop.name}</Text>
                {currentStop.scheduled_time && (
                  <Text style={styles.stopTime}>
                    Scheduled: {currentStop.scheduled_time}
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Today's Activity */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today's Activity</Text>
          {todayScans.length === 0 ? (
            <View style={styles.noActivityCard}>
              <Text style={styles.noActivityText}>No bus activity recorded today</Text>
            </View>
          ) : (
            <View style={styles.activityList}>
              {todayScans.map((scan) => (
                <View key={scan.id} style={styles.activityItem}>
                  <View
                    style={[
                      styles.activityIcon,
                      scan.scan_type === 'board' ? styles.activityBoard : styles.activityExit,
                    ]}
                  >
                    <Text style={styles.activityIconText}>
                      {scan.scan_type === 'board' ? '↑' : '↓'}
                    </Text>
                  </View>
                  <View style={styles.activityInfo}>
                    <Text style={styles.activityTitle}>
                      {scan.scan_type === 'board' ? 'Boarded Bus' : 'Exited Bus'}
                    </Text>
                    <Text style={styles.activityMeta}>
                      {scan.stop?.name || 'Unknown stop'} •{' '}
                      {new Date(scan.scanned_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Route Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Route Information</Text>

          <View style={styles.routeCards}>
            {assignment?.morning_route && (
              <View style={styles.routeCard}>
                <View style={styles.routeHeader}>
                  <Text style={styles.routeEmoji}>🌅</Text>
                  <Text style={styles.routeLabel}>Morning</Text>
                </View>
                <Text style={styles.routeNumber}>
                  Route {assignment.morning_route.route_number}
                </Text>
                <Text style={styles.routeName}>{assignment.morning_route.name}</Text>
                {assignment.morning_stop && (
                  <Text style={styles.routeStop}>
                    Stop: {assignment.morning_stop.name}
                  </Text>
                )}
              </View>
            )}

            {assignment?.afternoon_route && (
              <View style={styles.routeCard}>
                <View style={styles.routeHeader}>
                  <Text style={styles.routeEmoji}>🌆</Text>
                  <Text style={styles.routeLabel}>Afternoon</Text>
                </View>
                <Text style={styles.routeNumber}>
                  Route {assignment.afternoon_route.route_number}
                </Text>
                <Text style={styles.routeName}>{assignment.afternoon_route.name}</Text>
                {assignment.afternoon_stop && (
                  <Text style={styles.routeStop}>
                    Stop: {assignment.afternoon_stop.name}
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusCard: {
    margin: 16,
    padding: 20,
    borderRadius: 16,
  },
  statusActive: {
    backgroundColor: '#10B981',
  },
  statusScheduled: {
    backgroundColor: '#6366F1',
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    fontSize: 40,
    marginRight: 16,
  },
  statusInfo: {
    flex: 1,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 1,
  },
  statusTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 4,
  },
  statusSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },
  progressSection: {
    marginTop: 20,
  },
  progressBar: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    backgroundColor: '#fff',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 8,
    textAlign: 'center',
  },
  tripStats: {
    flexDirection: 'row',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  tripStat: {
    flex: 1,
    alignItems: 'center',
  },
  tripStatValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  tripStatLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  noTripCard: {
    margin: 16,
    padding: 32,
    backgroundColor: '#fff',
    borderRadius: 16,
    alignItems: 'center',
  },
  noTripIcon: {
    fontSize: 48,
    marginBottom: 12,
    opacity: 0.5,
  },
  noTripTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
  },
  noTripText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  stopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
  },
  stopIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stopIconText: {
    fontSize: 20,
  },
  stopInfo: {
    flex: 1,
  },
  stopName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  stopTime: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  noActivityCard: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  noActivityText: {
    fontSize: 14,
    color: '#6B7280',
  },
  activityList: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityBoard: {
    backgroundColor: '#D1FAE5',
  },
  activityExit: {
    backgroundColor: '#FEE2E2',
  },
  activityIconText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  activityInfo: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
  },
  activityMeta: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  routeCards: {
    flexDirection: 'row',
    gap: 12,
  },
  routeCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
  },
  routeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  routeEmoji: {
    fontSize: 18,
    marginRight: 6,
  },
  routeLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  routeNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  routeName: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  routeStop: {
    fontSize: 12,
    color: '#4F46E5',
    marginTop: 8,
  },
});
