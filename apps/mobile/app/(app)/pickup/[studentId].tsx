import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/contexts/AuthContext';
import {
  Student,
  AuthorizedPickup,
  DismissalSettings,
  DismissalRecord,
  DismissalMode,
} from '../../../src/lib/types';

const MODE_OPTIONS: { value: DismissalMode; label: string; icon: string }[] = [
  { value: 'parent_pickup', label: 'Parent Pickup', icon: '🚗' },
  { value: 'bus', label: 'School Bus', icon: '🚌' },
  { value: 'walker', label: 'Walker', icon: '🚶' },
  { value: 'after_school', label: 'After School', icon: '📚' },
  { value: 'carpool', label: 'Carpool', icon: '🚙' },
];

export default function PickupManagementScreen() {
  const { studentId } = useLocalSearchParams<{ studentId: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [student, setStudent] = useState<Student | null>(null);
  const [settings, setSettings] = useState<DismissalSettings | null>(null);
  const [authorizedPickups, setAuthorizedPickups] = useState<AuthorizedPickup[]>([]);
  const [todayStatus, setTodayStatus] = useState<DismissalRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const [showAddPickup, setShowAddPickup] = useState(false);
  const [showChangeMode, setShowChangeMode] = useState(false);
  const [newPickup, setNewPickup] = useState({
    name: '',
    relationship: '',
    phone: '',
    id_number: '',
  });

  const today = new Date().toISOString().split('T')[0];

  const fetchData = useCallback(async () => {
    try {
      // Fetch student
      const { data: studentData } = await supabase
        .from('students')
        .select('*')
        .eq('id', studentId)
        .single();
      setStudent(studentData);

      // Fetch dismissal settings
      const { data: settingsData } = await supabase
        .from('student_dismissal_settings')
        .select('*')
        .eq('student_id', studentId)
        .single();
      setSettings(settingsData);

      // Fetch authorized pickups
      const { data: pickupsData } = await supabase
        .from('authorized_pickups')
        .select('*')
        .eq('student_id', studentId)
        .eq('active', true)
        .order('is_primary', { ascending: false });
      setAuthorizedPickups(pickupsData || []);

      // Fetch today's status
      const { data: statusData } = await supabase
        .from('dismissal_records')
        .select('*')
        .eq('student_id', studentId)
        .eq('date', today)
        .single();
      setTodayStatus(statusData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [studentId, today]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddPickup = async () => {
    if (!newPickup.name || !newPickup.relationship || !newPickup.phone) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    try {
      const { error } = await supabase.from('authorized_pickups').insert({
        school_id: user?.school_id,
        student_id: studentId,
        name: newPickup.name,
        relationship: newPickup.relationship,
        phone: newPickup.phone,
        id_number: newPickup.id_number || null,
        added_by: user?.id,
      });

      if (error) throw error;

      setShowAddPickup(false);
      setNewPickup({ name: '', relationship: '', phone: '', id_number: '' });
      fetchData();
      Alert.alert('Success', 'Authorized pickup person added');
    } catch (error) {
      Alert.alert('Error', 'Failed to add pickup person');
    }
  };

  const handleRemovePickup = async (pickup: AuthorizedPickup) => {
    Alert.alert(
      'Remove Pickup Person',
      `Remove ${pickup.name} from authorized pickups?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase
                .from('authorized_pickups')
                .update({ active: false })
                .eq('id', pickup.id);
              fetchData();
            } catch (error) {
              Alert.alert('Error', 'Failed to remove pickup person');
            }
          },
        },
      ]
    );
  };

  const handleChangeTodayMode = async (mode: DismissalMode) => {
    try {
      if (todayStatus) {
        await supabase
          .from('dismissal_records')
          .update({
            mode,
            is_schedule_change: true,
            parent_notified: false,
          })
          .eq('id', todayStatus.id);
      } else {
        await supabase.from('dismissal_records').insert({
          school_id: user?.school_id,
          student_id: studentId,
          date: today,
          mode,
          is_schedule_change: true,
        });
      }

      setShowChangeMode(false);
      fetchData();
      Alert.alert('Success', 'Today\'s dismissal updated');
    } catch (error) {
      Alert.alert('Error', 'Failed to update dismissal');
    }
  };

  const handleSetDefaultMode = async (mode: DismissalMode) => {
    try {
      if (settings) {
        await supabase
          .from('student_dismissal_settings')
          .update({ default_mode: mode })
          .eq('id', settings.id);
      } else {
        await supabase.from('student_dismissal_settings').insert({
          school_id: user?.school_id,
          student_id: studentId,
          default_mode: mode,
        });
      }

      fetchData();
      Alert.alert('Success', 'Default dismissal mode updated');
    } catch (error) {
      Alert.alert('Error', 'Failed to update default mode');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  const statusConfig = {
    pending: { label: 'Waiting', color: '#6B7280', bg: '#F3F4F6' },
    called: { label: 'Called to Pickup', color: '#F59E0B', bg: '#FEF3C7' },
    picked_up: { label: 'Picked Up', color: '#10B981', bg: '#D1FAE5' },
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: `${student?.first_name}'s Pickup`,
          headerStyle: { backgroundColor: '#4F46E5' },
          headerTintColor: '#fff',
        }}
      />

      <ScrollView style={styles.container}>
        {/* Today's Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today's Status</Text>
          <View style={styles.statusCard}>
            {todayStatus ? (
              <>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: statusConfig[todayStatus.status as keyof typeof statusConfig]?.bg || '#F3F4F6' },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      { color: statusConfig[todayStatus.status as keyof typeof statusConfig]?.color || '#6B7280' },
                    ]}
                  >
                    {statusConfig[todayStatus.status as keyof typeof statusConfig]?.label || todayStatus.status}
                  </Text>
                </View>
                <Text style={styles.modeText}>
                  {MODE_OPTIONS.find((m) => m.value === todayStatus.mode)?.icon}{' '}
                  {MODE_OPTIONS.find((m) => m.value === todayStatus.mode)?.label}
                </Text>
                {todayStatus.is_schedule_change && (
                  <Text style={styles.changeNote}>⚠️ Schedule change for today</Text>
                )}
              </>
            ) : (
              <Text style={styles.noStatusText}>No dismissal record for today</Text>
            )}

            <TouchableOpacity
              style={styles.changeButton}
              onPress={() => setShowChangeMode(true)}
            >
              <Text style={styles.changeButtonText}>Change Today's Pickup</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Default Mode */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Default Dismissal</Text>
          <View style={styles.modeGrid}>
            {MODE_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.modeOption,
                  settings?.default_mode === option.value && styles.modeOptionActive,
                ]}
                onPress={() => handleSetDefaultMode(option.value)}
              >
                <Text style={styles.modeIcon}>{option.icon}</Text>
                <Text
                  style={[
                    styles.modeLabel,
                    settings?.default_mode === option.value && styles.modeLabelActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Authorized Pickups */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Authorized Pickup Persons</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowAddPickup(true)}
            >
              <Text style={styles.addButtonText}>+ Add</Text>
            </TouchableOpacity>
          </View>

          {authorizedPickups.length === 0 ? (
            <View style={styles.emptyPickups}>
              <Text style={styles.emptyText}>No authorized pickup persons added</Text>
            </View>
          ) : (
            authorizedPickups.map((pickup) => (
              <View key={pickup.id} style={styles.pickupCard}>
                <View style={styles.pickupInfo}>
                  <View style={styles.pickupHeader}>
                    <Text style={styles.pickupName}>{pickup.name}</Text>
                    {pickup.is_primary && (
                      <View style={styles.primaryBadge}>
                        <Text style={styles.primaryText}>Primary</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.pickupRelation}>{pickup.relationship}</Text>
                  <Text style={styles.pickupPhone}>📞 {pickup.phone}</Text>
                  {pickup.id_number && (
                    <Text style={styles.pickupId}>ID: {pickup.id_number}</Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => handleRemovePickup(pickup)}
                >
                  <Text style={styles.removeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Add Pickup Modal */}
      <Modal visible={showAddPickup} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Authorized Pickup</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Full Name *</Text>
              <TextInput
                style={styles.input}
                value={newPickup.name}
                onChangeText={(text) => setNewPickup({ ...newPickup, name: text })}
                placeholder="Enter full name"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Relationship *</Text>
              <TextInput
                style={styles.input}
                value={newPickup.relationship}
                onChangeText={(text) => setNewPickup({ ...newPickup, relationship: text })}
                placeholder="e.g., Grandmother, Uncle, Nanny"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Phone Number *</Text>
              <TextInput
                style={styles.input}
                value={newPickup.phone}
                onChangeText={(text) => setNewPickup({ ...newPickup, phone: text })}
                placeholder="Enter phone number"
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>ID Number (optional)</Text>
              <TextInput
                style={styles.input}
                value={newPickup.id_number}
                onChangeText={(text) => setNewPickup({ ...newPickup, id_number: text })}
                placeholder="For verification"
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowAddPickup(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleAddPickup}>
                <Text style={styles.saveButtonText}>Add Person</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Change Mode Modal */}
      <Modal visible={showChangeMode} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Change Today's Pickup</Text>
            <Text style={styles.modalSubtitle}>
              Select how {student?.first_name} will be dismissed today
            </Text>

            {MODE_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={styles.modeSelectOption}
                onPress={() => handleChangeTodayMode(option.value)}
              >
                <Text style={styles.modeSelectIcon}>{option.icon}</Text>
                <Text style={styles.modeSelectLabel}>{option.label}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowChangeMode(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
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
    backgroundColor: '#F3F4F6',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 12,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  statusCard: {
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modeText: {
    fontSize: 16,
    color: '#374151',
    marginBottom: 4,
  },
  changeNote: {
    fontSize: 13,
    color: '#F59E0B',
    marginTop: 8,
  },
  noStatusText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  changeButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#4F46E5',
    borderRadius: 8,
  },
  changeButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  modeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modeOption: {
    width: '48%',
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  modeOptionActive: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  modeIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  modeLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  modeLabelActive: {
    color: '#4F46E5',
  },
  addButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#EEF2FF',
    borderRadius: 6,
  },
  addButtonText: {
    color: '#4F46E5',
    fontWeight: '600',
    fontSize: 13,
  },
  emptyPickups: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  pickupCard: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  pickupInfo: {
    flex: 1,
  },
  pickupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pickupName: {
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
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  pickupRelation: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  pickupPhone: {
    fontSize: 13,
    color: '#374151',
    marginTop: 4,
  },
  pickupId: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  removeButton: {
    padding: 8,
  },
  removeButtonText: {
    fontSize: 16,
    color: '#EF4444',
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
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  cancelButtonText: {
    color: '#6B7280',
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    padding: 14,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#4F46E5',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  modeSelectOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    marginBottom: 8,
  },
  modeSelectIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  modeSelectLabel: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '500',
  },
});
