import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/contexts/AuthContext';
import { DismissalRecord, DismissalStatus, DismissalMode, Class, AuthorizedPickup } from '../../../src/lib/types';

interface StudentDismissal extends DismissalRecord {
  student: {
    id: string;
    first_name: string;
    last_name: string;
    grade: string;
  };
  authorized_pickups?: AuthorizedPickup[];
}

const STATUS_CONFIG: Record<DismissalStatus, { label: string; color: string; bg: string; icon: string }> = {
  pending: { label: 'Waiting', color: '#6B7280', bg: '#F3F4F6', icon: '⏳' },
  called: { label: 'Called', color: '#F59E0B', bg: '#FEF3C7', icon: '📢' },
  picked_up: { label: 'Picked Up', color: '#10B981', bg: '#D1FAE5', icon: '✓' },
  no_show: { label: 'No Show', color: '#EF4444', bg: '#FEE2E2', icon: '⚠️' },
  cancelled: { label: 'Cancelled', color: '#9CA3AF', bg: '#F3F4F6', icon: '✗' },
};

const MODE_LABELS: Record<DismissalMode, string> = {
  parent_pickup: '🚗 Parent Pickup',
  bus: '🚌 Bus',
  walker: '🚶 Walker',
  after_school: '📚 After School',
  carpool: '🚙 Carpool',
  other: '📋 Other',
};

function DismissalCard({
  record,
  onCall,
  onPickup,
  onViewPickups,
}: {
  record: StudentDismissal;
  onCall: () => void;
  onPickup: () => void;
  onViewPickups: () => void;
}) {
  const config = STATUS_CONFIG[record.status];

  return (
    <View style={[styles.card, { borderLeftColor: config.color, borderLeftWidth: 4 }]}>
      <View style={styles.cardHeader}>
        <View style={styles.studentInfo}>
          <View style={[styles.avatar, { backgroundColor: config.bg }]}>
            <Text style={styles.avatarText}>
              {record.student.first_name[0]}{record.student.last_name[0]}
            </Text>
          </View>
          <View>
            <Text style={styles.studentName}>
              {record.student.first_name} {record.student.last_name}
            </Text>
            <Text style={styles.dismissalMode}>{MODE_LABELS[record.mode]}</Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
          <Text style={[styles.statusText, { color: config.color }]}>
            {config.icon} {config.label}
          </Text>
        </View>
      </View>

      {record.mode === 'parent_pickup' && record.pickup_person_name && (
        <View style={styles.pickupInfo}>
          <Text style={styles.pickupLabel}>Pickup by:</Text>
          <Text style={styles.pickupPerson}>{record.pickup_person_name}</Text>
          {record.pickup_vehicle_info && (
            <Text style={styles.vehicleInfo}>{record.pickup_vehicle_info}</Text>
          )}
        </View>
      )}

      {record.is_schedule_change && (
        <View style={styles.changeAlert}>
          <Text style={styles.changeText}>⚠️ Schedule change today</Text>
        </View>
      )}

      <View style={styles.cardActions}>
        {record.mode === 'parent_pickup' && (
          <TouchableOpacity style={styles.actionButton} onPress={onViewPickups}>
            <Text style={styles.actionButtonText}>👥 Authorized</Text>
          </TouchableOpacity>
        )}

        {record.status === 'pending' && (
          <TouchableOpacity
            style={[styles.actionButton, styles.callButton]}
            onPress={onCall}
          >
            <Text style={styles.callButtonText}>📢 Call Student</Text>
          </TouchableOpacity>
        )}

        {record.status === 'called' && (
          <TouchableOpacity
            style={[styles.actionButton, styles.pickupButton]}
            onPress={onPickup}
          >
            <Text style={styles.pickupButtonText}>✓ Mark Picked Up</Text>
          </TouchableOpacity>
        )}

        {record.status === 'picked_up' && record.picked_up_at && (
          <Text style={styles.timeText}>
            Picked up at {new Date(record.picked_up_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        )}
      </View>
    </View>
  );
}

export default function DismissalScreen() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [dismissals, setDismissals] = useState<StudentDismissal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPickupsModal, setShowPickupsModal] = useState(false);
  const [selectedPickups, setSelectedPickups] = useState<AuthorizedPickup[]>([]);
  const [selectedStudentName, setSelectedStudentName] = useState('');

  const today = new Date().toISOString().split('T')[0];

  const fetchClasses = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .eq('teacher_id', user.id)
        .order('name');

      if (error) throw error;
      setClasses(data || []);

      if (data && data.length > 0 && !selectedClass) {
        setSelectedClass(data[0]);
      }
    } catch (error) {
      console.error('Error fetching classes:', error);
    } finally {
      setLoading(false);
    }
  }, [user, selectedClass]);

  const fetchDismissals = useCallback(async () => {
    if (!selectedClass) return;

    try {
      // Get students in class
      const { data: enrollments } = await supabase
        .from('class_enrollments')
        .select('student_id')
        .eq('class_id', selectedClass.id);

      const studentIds = enrollments?.map((e) => e.student_id) || [];

      if (studentIds.length === 0) {
        setDismissals([]);
        return;
      }

      // Get today's dismissal records
      const { data: records, error } = await supabase
        .from('dismissal_records')
        .select(`
          *,
          student:students(id, first_name, last_name, grade)
        `)
        .in('student_id', studentIds)
        .eq('date', today)
        .order('status');

      if (error) throw error;

      // If no records exist, create them
      if (!records || records.length === 0) {
        // Get students with their settings
        const { data: students } = await supabase
          .from('students')
          .select(`
            *,
            dismissal_settings:student_dismissal_settings(default_mode)
          `)
          .in('id', studentIds);

        // Create dismissal records for each student
        const newRecords = students?.map((s) => ({
          school_id: user!.school_id,
          student_id: s.id,
          date: today,
          mode: s.dismissal_settings?.[0]?.default_mode || 'parent_pickup',
          status: 'pending' as DismissalStatus,
        }));

        if (newRecords && newRecords.length > 0) {
          await supabase.from('dismissal_records').insert(newRecords);
          // Refetch
          fetchDismissals();
          return;
        }
      }

      setDismissals(records as StudentDismissal[] || []);
    } catch (error) {
      console.error('Error fetching dismissals:', error);
    }
  }, [selectedClass, today, user]);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  useEffect(() => {
    if (selectedClass) {
      fetchDismissals();

      // Subscribe to real-time updates
      const subscription = supabase
        .channel('dismissal_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'dismissal_records',
            filter: `date=eq.${today}`,
          },
          () => {
            fetchDismissals();
          }
        )
        .subscribe();

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [selectedClass, fetchDismissals, today]);

  const handleCall = async (record: StudentDismissal) => {
    try {
      await supabase
        .from('dismissal_records')
        .update({
          status: 'called',
          called_at: new Date().toISOString(),
          called_by: user?.id,
        })
        .eq('id', record.id);

      fetchDismissals();
    } catch (error) {
      Alert.alert('Error', 'Failed to call student');
    }
  };

  const handlePickup = async (record: StudentDismissal) => {
    try {
      await supabase
        .from('dismissal_records')
        .update({
          status: 'picked_up',
          picked_up_at: new Date().toISOString(),
          released_by: user?.id,
        })
        .eq('id', record.id);

      fetchDismissals();
    } catch (error) {
      Alert.alert('Error', 'Failed to mark as picked up');
    }
  };

  const handleViewPickups = async (record: StudentDismissal) => {
    try {
      const { data } = await supabase
        .from('authorized_pickups')
        .select('*')
        .eq('student_id', record.student_id)
        .eq('active', true)
        .order('is_primary', { ascending: false });

      setSelectedPickups(data || []);
      setSelectedStudentName(`${record.student.first_name} ${record.student.last_name}`);
      setShowPickupsModal(true);
    } catch (error) {
      console.error('Error fetching pickups:', error);
    }
  };

  const getStats = () => {
    const total = dismissals.length;
    const pending = dismissals.filter((d) => d.status === 'pending').length;
    const called = dismissals.filter((d) => d.status === 'called').length;
    const pickedUp = dismissals.filter((d) => d.status === 'picked_up').length;

    return { total, pending, called, pickedUp };
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  if (classes.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>🚗</Text>
        <Text style={styles.emptyTitle}>No Classes Assigned</Text>
        <Text style={styles.emptyText}>
          You don't have any classes assigned for dismissal.
        </Text>
      </View>
    );
  }

  const stats = getStats();

  return (
    <View style={styles.container}>
      {/* Class Selector */}
      <View style={styles.classSelector}>
        {classes.map((cls) => (
          <TouchableOpacity
            key={cls.id}
            style={[
              styles.classTab,
              selectedClass?.id === cls.id && styles.classTabActive,
            ]}
            onPress={() => setSelectedClass(cls)}
          >
            <Text
              style={[
                styles.classTabText,
                selectedClass?.id === cls.id && styles.classTabTextActive,
              ]}
            >
              {cls.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.total}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#6B7280' }]}>{stats.pending}</Text>
          <Text style={styles.statLabel}>Waiting</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#F59E0B' }]}>{stats.called}</Text>
          <Text style={styles.statLabel}>Called</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#10B981' }]}>{stats.pickedUp}</Text>
          <Text style={styles.statLabel}>Done</Text>
        </View>
      </View>

      {/* Dismissal List */}
      <FlatList
        data={dismissals}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <DismissalCard
            record={item}
            onCall={() => handleCall(item)}
            onPickup={() => handlePickup(item)}
            onViewPickups={() => handleViewPickups(item)}
          />
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No students for dismissal</Text>
          </View>
        }
      />

      {/* Authorized Pickups Modal */}
      <Modal visible={showPickupsModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Authorized Pickups for {selectedStudentName}
            </Text>

            {selectedPickups.length === 0 ? (
              <Text style={styles.noPickupsText}>
                No authorized pickup persons on file
              </Text>
            ) : (
              selectedPickups.map((pickup) => (
                <View key={pickup.id} style={styles.pickupItem}>
                  <View style={styles.pickupItemHeader}>
                    <Text style={styles.pickupItemName}>{pickup.name}</Text>
                    {pickup.is_primary && (
                      <View style={styles.primaryBadge}>
                        <Text style={styles.primaryText}>Primary</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.pickupItemRelation}>{pickup.relationship}</Text>
                  <Text style={styles.pickupItemPhone}>📞 {pickup.phone}</Text>
                  {pickup.id_number && (
                    <Text style={styles.pickupItemId}>ID: {pickup.id_number}</Text>
                  )}
                </View>
              ))
            )}

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowPickupsModal(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  classSelector: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 8,
    gap: 8,
  },
  classTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  classTabActive: {
    backgroundColor: '#4F46E5',
  },
  classTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  classTabTextActive: {
    color: '#fff',
  },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#374151',
  },
  statLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  listContent: {
    padding: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  studentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  studentName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  dismissalMode: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pickupInfo: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  pickupLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  pickupPerson: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginTop: 2,
  },
  vehicleInfo: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  changeAlert: {
    marginTop: 12,
    padding: 8,
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
  },
  changeText: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '500',
  },
  cardActions: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
    alignItems: 'center',
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  actionButtonText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },
  callButton: {
    backgroundColor: '#FEF3C7',
    flex: 1,
    alignItems: 'center',
  },
  callButtonText: {
    color: '#92400E',
    fontWeight: '600',
  },
  pickupButton: {
    backgroundColor: '#D1FAE5',
    flex: 1,
    alignItems: 'center',
  },
  pickupButtonText: {
    color: '#065F46',
    fontWeight: '600',
  },
  timeText: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: '500',
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
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  noPickupsText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    paddingVertical: 24,
  },
  pickupItem: {
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 8,
  },
  pickupItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pickupItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  primaryBadge: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  primaryText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
  pickupItemRelation: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  pickupItemPhone: {
    fontSize: 13,
    color: '#374151',
    marginTop: 4,
  },
  pickupItemId: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  closeButton: {
    marginTop: 16,
    padding: 14,
    backgroundColor: '#4F46E5',
    borderRadius: 10,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});
