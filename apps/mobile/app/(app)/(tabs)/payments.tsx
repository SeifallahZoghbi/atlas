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
import { PaymentRecipient, PaymentItem, Student } from '../../../src/lib/types';

interface PaymentWithDetails extends PaymentRecipient {
  payment_item: PaymentItem & {
    category?: { name: string; icon: string };
  };
  student: Student;
}

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: '#F59E0B', bg: '#FEF3C7' },
  partial: { label: 'Partial', color: '#6366F1', bg: '#EEF2FF' },
  paid: { label: 'Paid', color: '#10B981', bg: '#D1FAE5' },
  waived: { label: 'Waived', color: '#6B7280', bg: '#F3F4F6' },
};

function PaymentCard({
  payment,
  onPay,
}: {
  payment: PaymentWithDetails;
  onPay: () => void;
}) {
  const config = STATUS_CONFIG[payment.status as keyof typeof STATUS_CONFIG];
  const remaining = payment.amount_due - payment.amount_paid;
  const progress = payment.amount_due > 0
    ? (payment.amount_paid / payment.amount_due) * 100
    : 0;

  const isOverdue = payment.payment_item.due_date &&
    new Date(payment.payment_item.due_date) < new Date() &&
    payment.status !== 'paid';

  return (
    <TouchableOpacity
      style={[styles.card, isOverdue && styles.cardOverdue]}
      onPress={onPay}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardIcon}>
          <Text style={styles.iconText}>
            {payment.payment_item.category?.icon || '💳'}
          </Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>{payment.payment_item.title}</Text>
          <Text style={styles.cardSubtitle}>
            For {payment.student.first_name} {payment.student.last_name}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
          <Text style={[styles.statusText, { color: config.color }]}>
            {config.label}
          </Text>
        </View>
      </View>

      <View style={styles.amountSection}>
        <View style={styles.amountRow}>
          <Text style={styles.amountLabel}>Total:</Text>
          <Text style={styles.amountValue}>
            ${payment.amount_due.toFixed(2)}
          </Text>
        </View>
        {payment.amount_paid > 0 && (
          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>Paid:</Text>
            <Text style={[styles.amountValue, { color: '#10B981' }]}>
              ${payment.amount_paid.toFixed(2)}
            </Text>
          </View>
        )}
        {payment.status !== 'paid' && payment.status !== 'waived' && (
          <View style={styles.amountRow}>
            <Text style={[styles.amountLabel, { fontWeight: '600' }]}>Remaining:</Text>
            <Text style={[styles.amountValue, { fontWeight: '700', color: '#EF4444' }]}>
              ${remaining.toFixed(2)}
            </Text>
          </View>
        )}
      </View>

      {payment.status === 'partial' && (
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      )}

      {payment.payment_item.due_date && (
        <View style={styles.dueDate}>
          <Text style={[styles.dueDateText, isOverdue && { color: '#EF4444' }]}>
            {isOverdue ? '⚠️ Overdue - ' : '📅 Due: '}
            {new Date(payment.payment_item.due_date).toLocaleDateString()}
          </Text>
        </View>
      )}

      {payment.status !== 'paid' && payment.status !== 'waived' && (
        <TouchableOpacity style={styles.payButton} onPress={onPay}>
          <Text style={styles.payButtonText}>Pay Now</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

export default function PaymentsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [payments, setPayments] = useState<PaymentWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  const fetchPayments = useCallback(async () => {
    if (!user) return;

    try {
      // Get children linked to parent
      const { data: guardianLinks } = await supabase
        .from('student_guardians')
        .select('student_id')
        .eq('user_id', user.id);

      const studentIds = guardianLinks?.map((l) => l.student_id) || [];

      if (studentIds.length === 0) {
        setPayments([]);
        return;
      }

      // Get payment recipients for these students
      const { data: recipients, error } = await supabase
        .from('payment_recipients')
        .select(`
          *,
          payment_item:payment_items (
            *,
            category:payment_categories (name, icon)
          ),
          student:students (*)
        `)
        .in('student_id', studentIds)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setPayments(recipients as PaymentWithDetails[] || []);
    } catch (error) {
      console.error('Error fetching payments:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPayments();
  }, [fetchPayments]);

  const handlePay = (payment: PaymentWithDetails) => {
    router.push(`/(app)/payment/${payment.id}`);
  };

  const filteredPayments = filter === 'pending'
    ? payments.filter((p) => p.status === 'pending' || p.status === 'partial')
    : payments;

  const totalPending = payments
    .filter((p) => p.status === 'pending' || p.status === 'partial')
    .reduce((sum, p) => sum + (p.amount_due - p.amount_paid), 0);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Summary */}
      {totalPending > 0 && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total Outstanding</Text>
          <Text style={styles.summaryValue}>${totalPending.toFixed(2)}</Text>
        </View>
      )}

      {/* Filter Tabs */}
      <View style={styles.filterTabs}>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'pending' && styles.filterTabActive]}
          onPress={() => setFilter('pending')}
        >
          <Text style={[styles.filterTabText, filter === 'pending' && styles.filterTabTextActive]}>
            Pending ({payments.filter((p) => p.status === 'pending' || p.status === 'partial').length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterTabText, filter === 'all' && styles.filterTabTextActive]}>
            All ({payments.length})
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredPayments}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PaymentCard payment={item} onPay={() => handlePay(item)} />
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
            <Text style={styles.emptyIcon}>💳</Text>
            <Text style={styles.emptyTitle}>
              {filter === 'pending' ? 'All Paid Up!' : 'No Payments'}
            </Text>
            <Text style={styles.emptyText}>
              {filter === 'pending'
                ? 'You have no pending payments'
                : 'No payment requests yet'}
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
  summaryCard: {
    backgroundColor: '#4F46E5',
    margin: 16,
    marginBottom: 8,
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#C7D2FE',
  },
  summaryValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 4,
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
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  amountSection: {
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  amountLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  amountValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  progressBar: {
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    marginBottom: 12,
  },
  progressFill: {
    height: 6,
    backgroundColor: '#10B981',
    borderRadius: 3,
  },
  dueDate: {
    marginBottom: 12,
  },
  dueDateText: {
    fontSize: 13,
    color: '#6B7280',
  },
  payButton: {
    backgroundColor: '#4F46E5',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  payButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
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
