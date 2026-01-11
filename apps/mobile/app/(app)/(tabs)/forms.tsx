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
import { FormRecipient, Form, Student } from '../../../src/lib/types';

interface FormWithDetails extends FormRecipient {
  form: Form;
  student: Student;
}

const STATUS_CONFIG = {
  pending: { label: 'Action Required', color: '#F59E0B', bg: '#FEF3C7', icon: '⏳' },
  viewed: { label: 'Viewed', color: '#6366F1', bg: '#EEF2FF', icon: '👁️' },
  completed: { label: 'Completed', color: '#10B981', bg: '#D1FAE5', icon: '✓' },
  declined: { label: 'Declined', color: '#EF4444', bg: '#FEE2E2', icon: '✗' },
  expired: { label: 'Expired', color: '#6B7280', bg: '#F3F4F6', icon: '⏰' },
};

const TYPE_ICONS: Record<string, string> = {
  permission: '✍️',
  consent: '📋',
  survey: '📊',
  registration: '📝',
  medical: '🏥',
  other: '📄',
};

function FormCard({
  formRecipient,
  onOpen,
}: {
  formRecipient: FormWithDetails;
  onOpen: () => void;
}) {
  const config = STATUS_CONFIG[formRecipient.status as keyof typeof STATUS_CONFIG];
  const isActionRequired = formRecipient.status === 'pending' || formRecipient.status === 'viewed';

  const isOverdue = formRecipient.form.due_date &&
    new Date(formRecipient.form.due_date) < new Date() &&
    isActionRequired;

  return (
    <TouchableOpacity
      style={[styles.card, isOverdue && styles.cardOverdue]}
      onPress={onOpen}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardIcon}>
          <Text style={styles.iconText}>
            {TYPE_ICONS[formRecipient.form.form_type] || '📄'}
          </Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>{formRecipient.form.title}</Text>
          <Text style={styles.cardSubtitle}>
            For {formRecipient.student.first_name} {formRecipient.student.last_name}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
          <Text style={[styles.statusText, { color: config.color }]}>
            {config.icon} {config.label}
          </Text>
        </View>
      </View>

      {formRecipient.form.description && (
        <Text style={styles.description} numberOfLines={2}>
          {formRecipient.form.description}
        </Text>
      )}

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Type:</Text>
          <Text style={styles.metaValue}>{formRecipient.form.form_type}</Text>
        </View>
        {formRecipient.form.requires_signature && (
          <View style={styles.signatureBadge}>
            <Text style={styles.signatureText}>✍️ Signature Required</Text>
          </View>
        )}
      </View>

      {formRecipient.form.due_date && (
        <View style={styles.dueDate}>
          <Text style={[styles.dueDateText, isOverdue && { color: '#EF4444' }]}>
            {isOverdue ? '⚠️ Overdue - ' : '📅 Due: '}
            {new Date(formRecipient.form.due_date).toLocaleDateString()}
          </Text>
        </View>
      )}

      {isActionRequired && (
        <TouchableOpacity style={styles.openButton} onPress={onOpen}>
          <Text style={styles.openButtonText}>
            {formRecipient.form.requires_signature ? 'Sign Form' : 'Complete Form'}
          </Text>
        </TouchableOpacity>
      )}

      {formRecipient.status === 'completed' && (
        <View style={styles.completedBanner}>
          <Text style={styles.completedText}>
            ✓ Completed on {formRecipient.viewed_at
              ? new Date(formRecipient.viewed_at).toLocaleDateString()
              : 'N/A'}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function FormsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [forms, setForms] = useState<FormWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  const fetchForms = useCallback(async () => {
    if (!user) return;

    try {
      // Get children linked to parent
      const { data: guardianLinks } = await supabase
        .from('student_guardians')
        .select('student_id')
        .eq('user_id', user.id);

      const studentIds = guardianLinks?.map((l) => l.student_id) || [];

      if (studentIds.length === 0) {
        setForms([]);
        return;
      }

      // Get form recipients for these students
      const { data: recipients, error } = await supabase
        .from('form_recipients')
        .select(`
          *,
          form:forms (*),
          student:students (*)
        `)
        .in('student_id', studentIds)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Filter to only show active forms
      const activeFormRecipients = (recipients || []).filter(
        (r) => r.form?.status === 'active'
      );

      setForms(activeFormRecipients as FormWithDetails[]);
    } catch (error) {
      console.error('Error fetching forms:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    fetchForms();
  }, [fetchForms]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchForms();
  }, [fetchForms]);

  const handleOpenForm = (formRecipient: FormWithDetails) => {
    // Mark as viewed if pending
    if (formRecipient.status === 'pending') {
      supabase
        .from('form_recipients')
        .update({ status: 'viewed', viewed_at: new Date().toISOString() })
        .eq('id', formRecipient.id)
        .then(() => fetchForms());
    }

    router.push(`/(app)/form/${formRecipient.id}`);
  };

  const filteredForms = filter === 'pending'
    ? forms.filter((f) => f.status === 'pending' || f.status === 'viewed')
    : forms;

  const pendingCount = forms.filter((f) => f.status === 'pending' || f.status === 'viewed').length;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Action Required Banner */}
      {pendingCount > 0 && (
        <View style={styles.bannerCard}>
          <Text style={styles.bannerIcon}>📋</Text>
          <View style={styles.bannerInfo}>
            <Text style={styles.bannerTitle}>Forms Need Attention</Text>
            <Text style={styles.bannerText}>
              {pendingCount} form{pendingCount > 1 ? 's' : ''} awaiting your response
            </Text>
          </View>
        </View>
      )}

      {/* Filter Tabs */}
      <View style={styles.filterTabs}>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'pending' && styles.filterTabActive]}
          onPress={() => setFilter('pending')}
        >
          <Text style={[styles.filterTabText, filter === 'pending' && styles.filterTabTextActive]}>
            Pending ({pendingCount})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterTabText, filter === 'all' && styles.filterTabTextActive]}>
            All ({forms.length})
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredForms}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <FormCard formRecipient={item} onOpen={() => handleOpenForm(item)} />
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
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>
              {filter === 'pending' ? 'All Caught Up!' : 'No Forms'}
            </Text>
            <Text style={styles.emptyText}>
              {filter === 'pending'
                ? 'No forms need your attention'
                : 'No forms have been sent yet'}
            </Text>
          </View>
        }
      />
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
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    margin: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  bannerIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  bannerInfo: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400E',
  },
  bannerText: {
    fontSize: 14,
    color: '#B45309',
    marginTop: 2,
  },
  filterTabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterTabActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterTabTextActive: {
    color: '#fff',
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardOverdue: {
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 22,
  },
  cardInfo: {
    flex: 1,
    marginLeft: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  description: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  metaValue: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  signatureBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  signatureText: {
    fontSize: 11,
    color: '#4F46E5',
    fontWeight: '500',
  },
  dueDate: {
    marginBottom: 12,
  },
  dueDateText: {
    fontSize: 13,
    color: '#6B7280',
  },
  openButton: {
    backgroundColor: '#4F46E5',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  openButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  completedBanner: {
    backgroundColor: '#D1FAE5',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  completedText: {
    fontSize: 13,
    color: '#065F46',
    fontWeight: '500',
  },
  emptyContainer: {
    paddingVertical: 48,
    alignItems: 'center',
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
});
