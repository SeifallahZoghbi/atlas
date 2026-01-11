import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/contexts/AuthContext';
import { Student, AttendanceRecord, DismissalRecord } from '../../../src/lib/types';

interface ChildWithStats extends Student {
  class_name?: string;
  recent_attendance: AttendanceRecord[];
  attendance_rate: number;
  today_dismissal?: DismissalRecord;
  has_bus_assignment?: boolean;
}

const STATUS_COLORS = {
  present: '#10B981',
  absent: '#EF4444',
  late: '#F59E0B',
  excused: '#6366F1',
};

const DISMISSAL_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Waiting', color: '#6B7280' },
  called: { label: 'Called', color: '#F59E0B' },
  picked_up: { label: 'Picked Up', color: '#10B981' },
};

function AttendanceDot({ status }: { status: string }) {
  return (
    <View
      style={[
        styles.attendanceDot,
        { backgroundColor: STATUS_COLORS[status as keyof typeof STATUS_COLORS] || '#9CA3AF' },
      ]}
    />
  );
}

function ChildCard({
  child,
  onViewAttendance,
  onManagePickup,
  onTrackBus,
}: {
  child: ChildWithStats;
  onViewAttendance: () => void;
  onManagePickup: () => void;
  onTrackBus: () => void;
}) {
  const last7Days = child.recent_attendance.slice(0, 7);
  const dismissalStatus = child.today_dismissal?.status
    ? DISMISSAL_STATUS_LABELS[child.today_dismissal.status]
    : null;

  return (
    <View style={styles.childCard}>
      <TouchableOpacity onPress={onViewAttendance} activeOpacity={0.7}>
        <View style={styles.childHeader}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>
              {child.first_name[0]}{child.last_name[0]}
            </Text>
          </View>
          <View style={styles.childInfo}>
            <Text style={styles.childName}>
              {child.first_name} {child.last_name}
            </Text>
            <Text style={styles.childClass}>
              {child.class_name || `Grade ${child.grade}`}
            </Text>
          </View>
          <View style={styles.attendanceRate}>
            <Text style={styles.rateValue}>{Math.round(child.attendance_rate)}%</Text>
            <Text style={styles.rateLabel}>Attendance</Text>
          </View>
        </View>

        <View style={styles.recentAttendance}>
          <Text style={styles.recentLabel}>Last 7 days:</Text>
          <View style={styles.dotsContainer}>
            {last7Days.length === 0 ? (
              <Text style={styles.noDataText}>No attendance data</Text>
            ) : (
              last7Days.map((record, index) => (
                <AttendanceDot key={index} status={record.status} />
              ))
            )}
          </View>
        </View>

        {child.recent_attendance.length > 0 && child.recent_attendance[0].status !== 'present' && (
          <View style={styles.alertBanner}>
            <Text style={styles.alertText}>
              {child.recent_attendance[0].status === 'absent'
                ? '⚠️ Marked absent today'
                : child.recent_attendance[0].status === 'late'
                ? '⏰ Arrived late today'
                : '📝 Excused today'}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Pickup Status & Actions */}
      <View style={styles.pickupSection}>
        <View style={styles.pickupStatus}>
          <Text style={styles.pickupLabel}>Today's Pickup:</Text>
          {dismissalStatus ? (
            <View style={[styles.dismissalBadge, { backgroundColor: dismissalStatus.color + '20' }]}>
              <Text style={[styles.dismissalText, { color: dismissalStatus.color }]}>
                {dismissalStatus.label}
              </Text>
            </View>
          ) : (
            <Text style={styles.noDismissalText}>Not set</Text>
          )}
        </View>

        <View style={styles.actionButtons}>
          {child.has_bus_assignment && (
            <TouchableOpacity style={styles.busButton} onPress={onTrackBus}>
              <Text style={styles.busButtonText}>🚌 Track Bus</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.pickupButton} onPress={onManagePickup}>
            <Text style={styles.pickupButtonText}>🚗 Pickup</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function ChildrenScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [children, setChildren] = useState<ChildWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const fetchChildren = useCallback(async () => {
    if (!user) return;

    try {
      // Get children linked to this parent
      const { data: guardianLinks, error: guardianError } = await supabase
        .from('student_guardians')
        .select(`
          student_id,
          students (
            *,
            classes (name)
          )
        `)
        .eq('user_id', user.id);

      if (guardianError) throw guardianError;

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const childrenWithStats: ChildWithStats[] = await Promise.all(
        (guardianLinks || []).map(async (link) => {
          const student = link.students as Student & { classes?: { name: string } };

          // Get attendance records for last 30 days
          const { data: attendance } = await supabase
            .from('attendance_records')
            .select('*')
            .eq('student_id', student.id)
            .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
            .order('date', { ascending: false });

          // Get today's dismissal status
          const { data: dismissal } = await supabase
            .from('dismissal_records')
            .select('*')
            .eq('student_id', student.id)
            .eq('date', today)
            .single();

          // Check for bus assignment
          const { count: busCount } = await supabase
            .from('student_bus_assignments')
            .select('*', { count: 'exact', head: true })
            .eq('student_id', student.id)
            .eq('active', true);

          const records = attendance || [];
          const presentCount = records.filter(
            (r) => r.status === 'present' || r.status === 'late'
          ).length;
          const rate = records.length > 0 ? (presentCount / records.length) * 100 : 100;

          return {
            ...student,
            class_name: student.classes?.name,
            recent_attendance: records,
            attendance_rate: rate,
            today_dismissal: dismissal,
            has_bus_assignment: (busCount || 0) > 0,
          };
        })
      );

      setChildren(childrenWithStats);
    } catch (error) {
      console.error('Error fetching children:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, today]);

  useEffect(() => {
    fetchChildren();

    // Subscribe to real-time dismissal updates
    const subscription = supabase
      .channel('dismissal_updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dismissal_records',
          filter: `date=eq.${today}`,
        },
        () => {
          fetchChildren();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchChildren, today]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchChildren();
  }, [fetchChildren]);

  const handleViewAttendance = (child: ChildWithStats) => {
    router.push(`/(app)/child/${child.id}`);
  };

  const handleManagePickup = (child: ChildWithStats) => {
    router.push(`/(app)/pickup/${child.id}`);
  };

  const handleTrackBus = (child: ChildWithStats) => {
    router.push(`/(app)/bus/${child.id}`);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={children}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ChildCard
            child={item}
            onViewAttendance={() => handleViewAttendance(item)}
            onManagePickup={() => handleManagePickup(item)}
            onTrackBus={() => handleTrackBus(item)}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#4F46E5']}
            tintColor="#4F46E5"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>👨‍👩‍👧</Text>
            <Text style={styles.emptyTitle}>No Children Linked</Text>
            <Text style={styles.emptyText}>
              Contact your school to link your children to your account
            </Text>
          </View>
        }
        ListHeaderComponent={
          children.length > 0 ? (
            <View style={styles.header}>
              <Text style={styles.headerTitle}>My Children</Text>
              <Text style={styles.headerSubtitle}>
                Tap to view attendance or manage pickup
              </Text>
            </View>
          ) : null
        }
      />

      {/* Legend */}
      {children.length > 0 && (
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: STATUS_COLORS.present }]} />
            <Text style={styles.legendText}>Present</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: STATUS_COLORS.late }]} />
            <Text style={styles.legendText}>Late</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: STATUS_COLORS.absent }]} />
            <Text style={styles.legendText}>Absent</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: STATUS_COLORS.excused }]} />
            <Text style={styles.legendText}>Excused</Text>
          </View>
        </View>
      )}
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
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  header: {
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  childCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  childHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  childInfo: {
    flex: 1,
    marginLeft: 12,
  },
  childName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
  childClass: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  attendanceRate: {
    alignItems: 'center',
  },
  rateValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#10B981',
  },
  rateLabel: {
    fontSize: 11,
    color: '#6B7280',
  },
  recentAttendance: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  recentLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginRight: 12,
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  attendanceDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  noDataText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  alertBanner: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 10,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
  },
  alertText: {
    fontSize: 13,
    color: '#92400E',
    fontWeight: '500',
  },
  pickupSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  pickupStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pickupLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  dismissalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  dismissalText: {
    fontSize: 12,
    fontWeight: '600',
  },
  noDismissalText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  busButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
  },
  busButtonText: {
    fontSize: 13,
    color: '#D97706',
    fontWeight: '600',
  },
  pickupButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
  },
  pickupButtonText: {
    fontSize: 13,
    color: '#4F46E5',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
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
    paddingHorizontal: 32,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    color: '#6B7280',
  },
});
