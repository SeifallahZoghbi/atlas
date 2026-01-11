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
  TextInput,
} from 'react-native';
import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/contexts/AuthContext';
import { Student, AttendanceStatus, Class } from '../../../src/lib/types';

interface StudentWithAttendance extends Student {
  attendance_status?: AttendanceStatus;
  attendance_id?: string;
}

const STATUS_CONFIG = {
  present: { label: 'Present', color: '#10B981', bg: '#D1FAE5', icon: '✓' },
  absent: { label: 'Absent', color: '#EF4444', bg: '#FEE2E2', icon: '✗' },
  late: { label: 'Late', color: '#F59E0B', bg: '#FEF3C7', icon: '⏰' },
  excused: { label: 'Excused', color: '#6366F1', bg: '#E0E7FF', icon: '📝' },
};

function StudentRow({
  student,
  onStatusChange,
}: {
  student: StudentWithAttendance;
  onStatusChange: (studentId: string, status: AttendanceStatus) => void;
}) {
  const currentStatus = student.attendance_status || 'present';
  const config = STATUS_CONFIG[currentStatus];

  return (
    <View style={styles.studentRow}>
      <View style={styles.studentInfo}>
        <View style={[styles.avatar, { backgroundColor: config.bg }]}>
          <Text style={[styles.avatarText, { color: config.color }]}>
            {student.first_name[0]}{student.last_name[0]}
          </Text>
        </View>
        <Text style={styles.studentName}>
          {student.first_name} {student.last_name}
        </Text>
      </View>

      <View style={styles.statusButtons}>
        {(Object.keys(STATUS_CONFIG) as AttendanceStatus[]).map((status) => {
          const statusConfig = STATUS_CONFIG[status];
          const isSelected = currentStatus === status;

          return (
            <TouchableOpacity
              key={status}
              style={[
                styles.statusButton,
                isSelected && { backgroundColor: statusConfig.bg, borderColor: statusConfig.color },
              ]}
              onPress={() => onStatusChange(student.id, status)}
            >
              <Text
                style={[
                  styles.statusButtonText,
                  isSelected && { color: statusConfig.color },
                ]}
              >
                {statusConfig.icon}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function AttendanceScreen() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [students, setStudents] = useState<StudentWithAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [reasonData, setReasonData] = useState<{
    studentId: string;
    status: AttendanceStatus;
    reason: string;
  } | null>(null);

  const today = new Date().toISOString().split('T')[0];

  // Fetch teacher's classes
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

  // Fetch students and their attendance for selected class
  const fetchStudents = useCallback(async () => {
    if (!selectedClass || !user) return;

    try {
      // Get students enrolled in the class
      const { data: enrollments, error: enrollError } = await supabase
        .from('class_enrollments')
        .select('student_id, students(*)')
        .eq('class_id', selectedClass.id);

      if (enrollError) throw enrollError;

      // Get today's attendance records
      const { data: attendance, error: attError } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('class_id', selectedClass.id)
        .eq('date', today);

      if (attError) throw attError;

      // Merge students with attendance
      const studentsWithAttendance: StudentWithAttendance[] = (enrollments || [])
        .map((e) => {
          const student = e.students as Student;
          const record = attendance?.find((a) => a.student_id === student.id);
          return {
            ...student,
            attendance_status: record?.status as AttendanceStatus | undefined,
            attendance_id: record?.id,
          };
        })
        .sort((a, b) => a.last_name.localeCompare(b.last_name));

      setStudents(studentsWithAttendance);
    } catch (error) {
      console.error('Error fetching students:', error);
    }
  }, [selectedClass, user, today]);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  useEffect(() => {
    if (selectedClass) {
      fetchStudents();
    }
  }, [selectedClass, fetchStudents]);

  const handleStatusChange = async (studentId: string, status: AttendanceStatus) => {
    // If marking absent or late, ask for reason
    if (status === 'absent' || status === 'late') {
      setReasonData({ studentId, status, reason: '' });
      setShowReasonModal(true);
      return;
    }

    await saveAttendance(studentId, status);
  };

  const saveAttendance = async (
    studentId: string,
    status: AttendanceStatus,
    reason?: string
  ) => {
    if (!selectedClass || !user) return;

    setSaving(true);

    try {
      const student = students.find((s) => s.id === studentId);

      if (student?.attendance_id) {
        // Update existing record
        const { error } = await supabase
          .from('attendance_records')
          .update({
            status,
            reason: reason || null,
            check_in_time: status === 'present' || status === 'late' ? new Date().toISOString() : null,
          })
          .eq('id', student.attendance_id);

        if (error) throw error;
      } else {
        // Create new record
        const { error } = await supabase.from('attendance_records').insert({
          school_id: user.school_id,
          student_id: studentId,
          class_id: selectedClass.id,
          date: today,
          status,
          reason: reason || null,
          recorded_by: user.id,
          check_in_time: status === 'present' || status === 'late' ? new Date().toISOString() : null,
        });

        if (error) throw error;
      }

      // Update local state
      setStudents((prev) =>
        prev.map((s) =>
          s.id === studentId
            ? { ...s, attendance_status: status }
            : s
        )
      );
    } catch (error) {
      console.error('Error saving attendance:', error);
      Alert.alert('Error', 'Failed to save attendance');
    } finally {
      setSaving(false);
    }
  };

  const handleReasonSubmit = async () => {
    if (!reasonData) return;

    await saveAttendance(reasonData.studentId, reasonData.status, reasonData.reason);
    setShowReasonModal(false);
    setReasonData(null);
  };

  const markAllPresent = async () => {
    if (!selectedClass || !user) return;

    Alert.alert(
      'Mark All Present',
      'Mark all students as present?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setSaving(true);
            try {
              const unmarkedStudents = students.filter((s) => !s.attendance_status);

              for (const student of unmarkedStudents) {
                await supabase.from('attendance_records').insert({
                  school_id: user.school_id,
                  student_id: student.id,
                  class_id: selectedClass.id,
                  date: today,
                  status: 'present',
                  recorded_by: user.id,
                  check_in_time: new Date().toISOString(),
                });
              }

              fetchStudents();
            } catch (error) {
              console.error('Error marking all present:', error);
              Alert.alert('Error', 'Failed to mark all present');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const getStats = () => {
    const total = students.length;
    const present = students.filter((s) => s.attendance_status === 'present').length;
    const absent = students.filter((s) => s.attendance_status === 'absent').length;
    const late = students.filter((s) => s.attendance_status === 'late').length;
    const unmarked = students.filter((s) => !s.attendance_status).length;

    return { total, present, absent, late, unmarked };
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
        <Text style={styles.emptyIcon}>📚</Text>
        <Text style={styles.emptyTitle}>No Classes Assigned</Text>
        <Text style={styles.emptyText}>
          You don't have any classes assigned yet.
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
          <Text style={[styles.statValue, { color: '#10B981' }]}>{stats.present}</Text>
          <Text style={styles.statLabel}>Present</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#EF4444' }]}>{stats.absent}</Text>
          <Text style={styles.statLabel}>Absent</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#F59E0B' }]}>{stats.late}</Text>
          <Text style={styles.statLabel}>Late</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: '#9CA3AF' }]}>{stats.unmarked}</Text>
          <Text style={styles.statLabel}>Unmarked</Text>
        </View>
      </View>

      {/* Quick Action */}
      {stats.unmarked > 0 && (
        <TouchableOpacity
          style={styles.markAllButton}
          onPress={markAllPresent}
          disabled={saving}
        >
          <Text style={styles.markAllText}>
            ✓ Mark All Present ({stats.unmarked} remaining)
          </Text>
        </TouchableOpacity>
      )}

      {/* Student List */}
      <FlatList
        data={students}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <StudentRow student={item} onStatusChange={handleStatusChange} />
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No students enrolled</Text>
          </View>
        }
      />

      {/* Reason Modal */}
      <Modal visible={showReasonModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {reasonData?.status === 'absent' ? 'Absence Reason' : 'Late Arrival Reason'}
            </Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="Enter reason (optional)"
              value={reasonData?.reason || ''}
              onChangeText={(text) =>
                setReasonData((prev) => (prev ? { ...prev, reason: text } : null))
              }
              multiline
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowReasonModal(false);
                  setReasonData(null);
                }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={handleReasonSubmit}
              >
                <Text style={styles.modalConfirmText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {saving && (
        <View style={styles.savingOverlay}>
          <ActivityIndicator size="small" color="#fff" />
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
  markAllButton: {
    backgroundColor: '#10B981',
    margin: 12,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  markAllText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  listContent: {
    padding: 12,
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  studentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '600',
  },
  studentName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#374151',
  },
  statusButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  statusButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusButtonText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 16,
  },
  reasonInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  modalCancelButton: {
    padding: 12,
  },
  modalCancelText: {
    color: '#6B7280',
    fontWeight: '600',
  },
  modalConfirmButton: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  modalConfirmText: {
    color: '#fff',
    fontWeight: '600',
  },
  savingOverlay: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#4F46E5',
    borderRadius: 20,
    padding: 8,
  },
});
