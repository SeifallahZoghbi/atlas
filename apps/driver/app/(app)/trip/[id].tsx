import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/contexts/AuthContext';

interface BusStop {
  id: string;
  stop_number: number;
  name: string;
  address: string | null;
  scheduled_time: string | null;
  latitude: number | null;
  longitude: number | null;
  arrived?: boolean;
  departed?: boolean;
}

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  grade: string;
  stop_id: string;
  boarded?: boolean;
}

interface Trip {
  id: string;
  route_id: string;
  bus_id: string;
  trip_date: string;
  trip_type: string;
  status: string;
  current_stop_index: number;
  students_on_board: number;
  route: {
    route_number: string;
    name: string;
    estimated_duration_minutes: number | null;
  };
  bus: {
    bus_number: string;
  };
}

export default function ActiveTripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [stops, setStops] = useState<BusStop[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [showStudentList, setShowStudentList] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertType, setAlertType] = useState<string>('delay');
  const [trackingLocation, setTrackingLocation] = useState(false);

  const locationSubscription = useRef<Location.LocationSubscription | null>(null);

  const fetchTripData = useCallback(async () => {
    try {
      // Fetch trip
      const { data: tripData, error: tripError } = await supabase
        .from('bus_trips')
        .select(`
          *,
          route:bus_routes (route_number, name, estimated_duration_minutes),
          bus:buses (bus_number)
        `)
        .eq('id', id)
        .single();

      if (tripError) throw tripError;
      setTrip(tripData);
      setCurrentStopIndex(tripData.current_stop_index || 0);

      // Fetch stops
      const { data: stopsData } = await supabase
        .from('bus_stops')
        .select('*')
        .eq('route_id', tripData.route_id)
        .eq('active', true)
        .order('stop_number');

      // Get stop events to mark arrived/departed
      const { data: stopEvents } = await supabase
        .from('bus_stop_events')
        .select('stop_id, event_type')
        .eq('trip_id', id);

      const eventsByStop = new Map();
      stopEvents?.forEach((e) => {
        if (!eventsByStop.has(e.stop_id)) {
          eventsByStop.set(e.stop_id, []);
        }
        eventsByStop.get(e.stop_id).push(e.event_type);
      });

      const stopsWithEvents = (stopsData || []).map((stop) => {
        const events = eventsByStop.get(stop.id) || [];
        return {
          ...stop,
          arrived: events.includes('arrived'),
          departed: events.includes('departed'),
        };
      });

      setStops(stopsWithEvents);

      // Fetch students assigned to this route
      const routeField = tripData.trip_type === 'morning'
        ? 'morning_route_id'
        : 'afternoon_route_id';
      const stopField = tripData.trip_type === 'morning'
        ? 'morning_stop_id'
        : 'afternoon_stop_id';

      const { data: assignmentsData } = await supabase
        .from('student_bus_assignments')
        .select(`
          *,
          student:students (id, first_name, last_name, grade)
        `)
        .eq(routeField, tripData.route_id)
        .eq('active', true);

      // Get scan events
      const { data: scans } = await supabase
        .from('student_bus_scans')
        .select('student_id, scan_type')
        .eq('trip_id', id);

      const boardedStudents = new Set(
        scans?.filter((s) => s.scan_type === 'board').map((s) => s.student_id) || []
      );

      const studentsData = (assignmentsData || []).map((a) => ({
        id: a.student.id,
        first_name: a.student.first_name,
        last_name: a.student.last_name,
        grade: a.student.grade,
        stop_id: a[stopField],
        boarded: boardedStudents.has(a.student.id),
      }));

      setStudents(studentsData);
    } catch (error) {
      console.error('Error fetching trip:', error);
      Alert.alert('Error', 'Failed to load trip data');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTripData();
    startLocationTracking();

    return () => {
      stopLocationTracking();
    };
  }, [fetchTripData]);

  const startLocationTracking = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required for tracking');
        return;
      }

      setTrackingLocation(true);

      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000, // Every 5 seconds
          distanceInterval: 10, // Or every 10 meters
        },
        (location) => {
          updateLocation(location);
        }
      );
    } catch (error) {
      console.error('Error starting location tracking:', error);
    }
  };

  const stopLocationTracking = () => {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }
    setTrackingLocation(false);
  };

  const updateLocation = async (location: Location.LocationObject) => {
    try {
      // Update trip location
      await supabase
        .from('bus_trips')
        .update({
          current_latitude: location.coords.latitude,
          current_longitude: location.coords.longitude,
          current_speed: location.coords.speed,
          current_heading: location.coords.heading,
          last_location_update: new Date().toISOString(),
        })
        .eq('id', id);

      // Save to history
      await supabase.from('bus_location_history').insert({
        trip_id: id,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        speed: location.coords.speed,
        heading: location.coords.heading,
        accuracy: location.coords.accuracy,
      });
    } catch (error) {
      console.error('Error updating location:', error);
    }
  };

  const handleArriveAtStop = async (stop: BusStop) => {
    try {
      await supabase.from('bus_stop_events').insert({
        trip_id: id,
        stop_id: stop.id,
        event_type: 'arrived',
        scheduled_time: stop.scheduled_time,
      });

      await supabase
        .from('bus_trips')
        .update({ current_stop_index: stop.stop_number })
        .eq('id', id);

      fetchTripData();
    } catch (error) {
      Alert.alert('Error', 'Failed to record arrival');
    }
  };

  const handleDepartFromStop = async (stop: BusStop, studentsBoarded: number, studentsExited: number) => {
    try {
      await supabase.from('bus_stop_events').insert({
        trip_id: id,
        stop_id: stop.id,
        event_type: 'departed',
        students_boarded: studentsBoarded,
        students_exited: studentsExited,
      });

      fetchTripData();
    } catch (error) {
      Alert.alert('Error', 'Failed to record departure');
    }
  };

  const handleScanStudent = async (student: Student, scanType: 'board' | 'exit') => {
    try {
      await supabase.from('student_bus_scans').insert({
        trip_id: id,
        student_id: student.id,
        stop_id: stops[currentStopIndex]?.id,
        scan_type: scanType,
      });

      fetchTripData();
    } catch (error) {
      Alert.alert('Error', 'Failed to record student scan');
    }
  };

  const handleEndTrip = () => {
    Alert.alert(
      'End Trip',
      'Are you sure you want to end this trip?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Trip',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase
                .from('bus_trips')
                .update({
                  status: 'completed',
                  actual_end: new Date().toISOString(),
                })
                .eq('id', id);

              stopLocationTracking();
              router.back();
            } catch (error) {
              Alert.alert('Error', 'Failed to end trip');
            }
          },
        },
      ]
    );
  };

  const handleSendAlert = async () => {
    try {
      await supabase.from('bus_alerts').insert({
        school_id: user!.school_id,
        trip_id: id,
        route_id: trip?.route_id,
        alert_type: alertType,
        severity: alertType === 'delay' ? 'info' : 'warning',
        title: `Bus ${trip?.bus.bus_number} - ${alertType === 'delay' ? 'Running Late' : 'Issue Reported'}`,
        message: `Route ${trip?.route.route_number} has reported a ${alertType}`,
        created_by: user!.id,
      });

      setShowAlertModal(false);
      Alert.alert('Success', 'Alert sent to school');
    } catch (error) {
      Alert.alert('Error', 'Failed to send alert');
    }
  };

  if (loading || !trip) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1E40AF" />
      </View>
    );
  }

  const currentStop = stops[currentStopIndex];
  const studentsOnBoard = students.filter((s) => s.boarded).length;
  const studentsAtCurrentStop = students.filter((s) => s.stop_id === currentStop?.id);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: `Route ${trip.route.route_number}`,
          headerStyle: { backgroundColor: '#1E40AF' },
          headerTintColor: '#fff',
          headerRight: () => (
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setShowAlertModal(true)}
            >
              <Text style={styles.headerButtonText}>⚠️ Alert</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <View style={styles.container}>
        {/* Status Bar */}
        <View style={styles.statusBar}>
          <View style={styles.statusItem}>
            <Text style={styles.statusIcon}>🚌</Text>
            <Text style={styles.statusValue}>{studentsOnBoard}</Text>
            <Text style={styles.statusLabel}>On Board</Text>
          </View>
          <View style={styles.statusItem}>
            <Text style={styles.statusIcon}>📍</Text>
            <Text style={styles.statusValue}>
              {currentStopIndex + 1}/{stops.length}
            </Text>
            <Text style={styles.statusLabel}>Stops</Text>
          </View>
          <View style={styles.statusItem}>
            <Text style={[styles.statusIcon, !trackingLocation && { opacity: 0.5 }]}>
              {trackingLocation ? '📡' : '⏸️'}
            </Text>
            <Text style={styles.statusValue}>
              {trackingLocation ? 'Live' : 'Paused'}
            </Text>
            <Text style={styles.statusLabel}>GPS</Text>
          </View>
        </View>

        {/* Current Stop */}
        {currentStop && (
          <View style={styles.currentStopCard}>
            <View style={styles.currentStopHeader}>
              <Text style={styles.currentStopLabel}>CURRENT STOP</Text>
              <Text style={styles.currentStopName}>{currentStop.name}</Text>
              {currentStop.address && (
                <Text style={styles.currentStopAddress}>{currentStop.address}</Text>
              )}
            </View>

            <View style={styles.stopActions}>
              {!currentStop.arrived ? (
                <TouchableOpacity
                  style={styles.arriveButton}
                  onPress={() => handleArriveAtStop(currentStop)}
                >
                  <Text style={styles.arriveButtonText}>Arrive at Stop</Text>
                </TouchableOpacity>
              ) : !currentStop.departed ? (
                <TouchableOpacity
                  style={styles.departButton}
                  onPress={() =>
                    handleDepartFromStop(
                      currentStop,
                      studentsAtCurrentStop.filter((s) => s.boarded).length,
                      0
                    )
                  }
                >
                  <Text style={styles.departButtonText}>Depart from Stop</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.completedBadge}>
                  <Text style={styles.completedText}>✓ Completed</Text>
                </View>
              )}
            </View>

            {studentsAtCurrentStop.length > 0 && (
              <View style={styles.studentsAtStop}>
                <Text style={styles.studentsAtStopTitle}>
                  Students at this stop ({studentsAtCurrentStop.length})
                </Text>
                {studentsAtCurrentStop.map((student) => (
                  <TouchableOpacity
                    key={student.id}
                    style={styles.studentRow}
                    onPress={() =>
                      handleScanStudent(student, student.boarded ? 'exit' : 'board')
                    }
                  >
                    <View style={styles.studentInfo}>
                      <Text style={styles.studentName}>
                        {student.first_name} {student.last_name}
                      </Text>
                      <Text style={styles.studentGrade}>Grade {student.grade}</Text>
                    </View>
                    <View
                      style={[
                        styles.studentStatus,
                        student.boarded && styles.studentBoarded,
                      ]}
                    >
                      <Text
                        style={[
                          styles.studentStatusText,
                          student.boarded && styles.studentBoardedText,
                        ]}
                      >
                        {student.boarded ? 'On Bus' : 'Tap to Board'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Stops List */}
        <View style={styles.stopsSection}>
          <View style={styles.stopsSectionHeader}>
            <Text style={styles.stopsSectionTitle}>All Stops</Text>
            <TouchableOpacity onPress={() => setShowStudentList(true)}>
              <Text style={styles.viewAllStudents}>View All Students</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.stopsList}>
            {stops.map((stop, index) => (
              <TouchableOpacity
                key={stop.id}
                style={[
                  styles.stopItem,
                  index === currentStopIndex && styles.stopItemCurrent,
                  stop.departed && styles.stopItemCompleted,
                ]}
                onPress={() => setCurrentStopIndex(index)}
              >
                <View
                  style={[
                    styles.stopNumber,
                    stop.departed && styles.stopNumberCompleted,
                    index === currentStopIndex && styles.stopNumberCurrent,
                  ]}
                >
                  {stop.departed ? (
                    <Text style={styles.stopNumberText}>✓</Text>
                  ) : (
                    <Text style={styles.stopNumberText}>{stop.stop_number}</Text>
                  )}
                </View>
                <View style={styles.stopInfo}>
                  <Text style={styles.stopName}>{stop.name}</Text>
                  {stop.scheduled_time && (
                    <Text style={styles.stopTime}>{stop.scheduled_time}</Text>
                  )}
                </View>
                <Text style={styles.stopStudentCount}>
                  {students.filter((s) => s.stop_id === stop.id).length} 👤
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* End Trip Button */}
        <TouchableOpacity style={styles.endTripButton} onPress={handleEndTrip}>
          <Text style={styles.endTripButtonText}>End Trip</Text>
        </TouchableOpacity>
      </View>

      {/* Alert Modal */}
      <Modal visible={showAlertModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Send Alert</Text>
            <View style={styles.alertOptions}>
              {['delay', 'breakdown', 'weather', 'other'].map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.alertOption,
                    alertType === type && styles.alertOptionSelected,
                  ]}
                  onPress={() => setAlertType(type)}
                >
                  <Text
                    style={[
                      styles.alertOptionText,
                      alertType === type && styles.alertOptionTextSelected,
                    ]}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowAlertModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={handleSendAlert}
              >
                <Text style={styles.modalConfirmText}>Send Alert</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Students List Modal */}
      <Modal visible={showStudentList} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '70%' }]}>
            <Text style={styles.modalTitle}>All Students ({students.length})</Text>
            <FlatList
              data={students}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={styles.studentListItem}>
                  <View style={styles.studentInfo}>
                    <Text style={styles.studentName}>
                      {item.first_name} {item.last_name}
                    </Text>
                    <Text style={styles.studentGrade}>Grade {item.grade}</Text>
                  </View>
                  <View
                    style={[
                      styles.studentStatus,
                      item.boarded && styles.studentBoarded,
                    ]}
                  >
                    <Text
                      style={[
                        styles.studentStatusText,
                        item.boarded && styles.studentBoardedText,
                      ]}
                    >
                      {item.boarded ? 'On Bus' : 'Not Boarded'}
                    </Text>
                  </View>
                </View>
              )}
            />
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowStudentList(false)}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
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
  },
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerButtonText: {
    color: '#fff',
    fontSize: 14,
  },
  statusBar: {
    flexDirection: 'row',
    backgroundColor: '#1E40AF',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  statusItem: {
    flex: 1,
    alignItems: 'center',
  },
  statusIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  statusValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  statusLabel: {
    fontSize: 11,
    color: '#93C5FD',
  },
  currentStopCard: {
    margin: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  currentStopHeader: {
    marginBottom: 16,
  },
  currentStopLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#6B7280',
    letterSpacing: 1,
    marginBottom: 4,
  },
  currentStopName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  currentStopAddress: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  stopActions: {
    marginBottom: 16,
  },
  arriveButton: {
    backgroundColor: '#10B981',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  arriveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  departButton: {
    backgroundColor: '#F59E0B',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  departButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  completedBadge: {
    backgroundColor: '#D1FAE5',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  completedText: {
    color: '#065F46',
    fontSize: 16,
    fontWeight: '600',
  },
  studentsAtStop: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 16,
  },
  studentsAtStopTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
  },
  studentGrade: {
    fontSize: 13,
    color: '#6B7280',
  },
  studentStatus: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
  },
  studentBoarded: {
    backgroundColor: '#D1FAE5',
  },
  studentStatusText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
  },
  studentBoardedText: {
    color: '#065F46',
  },
  stopsSection: {
    flex: 1,
    paddingHorizontal: 16,
  },
  stopsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  stopsSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  viewAllStudents: {
    fontSize: 14,
    color: '#1E40AF',
    fontWeight: '500',
  },
  stopsList: {
    flex: 1,
  },
  stopItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  stopItemCurrent: {
    borderWidth: 2,
    borderColor: '#1E40AF',
  },
  stopItemCompleted: {
    opacity: 0.6,
  },
  stopNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stopNumberCurrent: {
    backgroundColor: '#1E40AF',
  },
  stopNumberCompleted: {
    backgroundColor: '#10B981',
  },
  stopNumberText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  stopInfo: {
    flex: 1,
  },
  stopName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  stopTime: {
    fontSize: 12,
    color: '#6B7280',
  },
  stopStudentCount: {
    fontSize: 13,
    color: '#6B7280',
  },
  endTripButton: {
    margin: 16,
    backgroundColor: '#EF4444',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  endTripButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  alertOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  alertOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  alertOptionSelected: {
    backgroundColor: '#EEF2FF',
    borderColor: '#1E40AF',
  },
  alertOptionText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  alertOptionTextSelected: {
    color: '#1E40AF',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '600',
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#1E40AF',
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  studentListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalCloseButton: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#1E40AF',
    alignItems: 'center',
  },
  modalCloseText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
