import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { supabase } from '../../../src/lib/supabase';
import { Student, AttendanceRecord } from '../../../src/lib/types';

const STATUS_CONFIG = {
  present: { label: 'Present', color: '#10B981', bg: '#D1FAE5', icon: '✓' },
  absent: { label: 'Absent', color: '#EF4444', bg: '#FEE2E2', icon: '✗' },
  late: { label: 'Late', color: '#F59E0B', bg: '#FEF3C7', icon: '⏰' },
  excused: { label: 'Excused', color: '#6366F1', bg: '#E0E7FF', icon: '📝' },
};

function AttendanceItem({ record }: { record: AttendanceRecord }) {
  const config = STATUS_CONFIG[record.status];
  const date = new Date(record.date);
  const formattedDate = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <View style={styles.attendanceItem}>
      <View style={[styles.statusIndicator, { backgroundColor: config.bg }]}>
        <Text style={[styles.statusIcon, { color: config.color }]}>{config.icon}</Text>
      </View>
      <View style={styles.attendanceInfo}>
        <Text style={styles.attendanceDate}>{formattedDate}</Text>
        <Text style={[styles.attendanceStatus, { color: config.color }]}>
          {config.label}
        </Text>
        {record.reason && (
          <Text style={styles.attendanceReason}>{record.reason}</Text>
        )}
      </View>
      {record.check_in_time && (
        <Text style={styles.checkInTime}>
          {new Date(record.check_in_time).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      )}
    </View>
  );
}

export default function ChildDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [student, setStudent] = useState<Student | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      // Fetch student details
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select('*, classes(name)')
        .eq('id', id)
        .single();

      if (studentError) throw studentError;
      setStudent(studentData);

      // Fetch attendance history
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('student_id', id)
        .order('date', { ascending: false })
        .limit(90); // Last ~3 months

      if (attendanceError) throw attendanceError;
      setAttendance(attendanceData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const getStats = () => {
    const total = attendance.length;
    const present = attendance.filter((r) => r.status === 'present').length;
    const late = attendance.filter((r) => r.status === 'late').length;
    const absent = attendance.filter((r) => r.status === 'absent').length;
    const excused = attendance.filter((r) => r.status === 'excused').length;

    const attendanceRate = total > 0 ? ((present + late) / total) * 100 : 100;

    return { total, present, late, absent, excused, attendanceRate };
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  const stats = getStats();

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: student ? `${student.first_name}'s Attendance` : 'Attendance',
          headerStyle: { backgroundColor: '#4F46E5' },
          headerTintColor: '#fff',
        }}
      />

      <View style={styles.container}>
        {/* Stats Summary */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View style={styles.avatarLarge}>
              <Text style={styles.avatarLargeText}>
                {student?.first_name[0]}{student?.last_name[0]}
              </Text>
            </View>
            <View style={styles.summaryInfo}>
              <Text style={styles.studentName}>
                {student?.first_name} {student?.last_name}
              </Text>
              <Text style={styles.className}>
                {(student as any)?.classes?.name || `Grade ${student?.grade}`}
              </Text>
            </View>
            <View style={styles.rateCircle}>
              <Text style={styles.rateText}>{Math.round(stats.attendanceRate)}%</Text>
            </View>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: '#10B981' }]}>{stats.present}</Text>
              <Text style={styles.statLabel}>Present</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: '#F59E0B' }]}>{stats.late}</Text>
              <Text style={styles.statLabel}>Late</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: '#EF4444' }]}>{stats.absent}</Text>
              <Text style={styles.statLabel}>Absent</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: '#6366F1' }]}>{stats.excused}</Text>
              <Text style={styles.statLabel}>Excused</Text>
            </View>
          </View>
        </View>

        {/* Attendance History */}
        <View style={styles.historyHeader}>
          <Text style={styles.historyTitle}>Attendance History</Text>
          <Text style={styles.historySubtitle}>Last {stats.total} days recorded</Text>
        </View>

        <FlatList
          data={attendance}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <AttendanceItem record={item} />}
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
              <Text style={styles.emptyText}>No attendance records found</Text>
            </View>
          }
        />
      </View>
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
  summaryCard: {
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarLarge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLargeText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
  },
  summaryInfo: {
    flex: 1,
    marginLeft: 12,
  },
  studentName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  className: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  rateCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rateText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#10B981',
  },
  statsGrid: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 16,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  historyHeader: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  historySubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },
  attendanceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  statusIndicator: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusIcon: {
    fontSize: 18,
    fontWeight: '600',
  },
  attendanceInfo: {
    flex: 1,
    marginLeft: 12,
  },
  attendanceDate: {
    fontSize: 15,
    fontWeight: '500',
    color: '#374151',
  },
  attendanceStatus: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  attendanceReason: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    fontStyle: 'italic',
  },
  checkInTime: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
});
