import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/contexts/AuthContext';
import { PaymentRecipient, PaymentItem, Student } from '../../../src/lib/types';

interface PaymentWithDetails extends PaymentRecipient {
  payment_item: PaymentItem & {
    category?: { name: string; icon: string };
  };
  student: Student;
}

export default function PaymentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [payment, setPayment] = useState<PaymentWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [payFullAmount, setPayFullAmount] = useState(true);

  const fetchPayment = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('payment_recipients')
        .select(`
          *,
          payment_item:payment_items (
            *,
            category:payment_categories (name, icon)
          ),
          student:students (*)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      setPayment(data as PaymentWithDetails);

      // Set default payment amount
      const remaining = data.amount_due - data.amount_paid;
      setPaymentAmount(remaining.toFixed(2));
    } catch (error) {
      console.error('Error fetching payment:', error);
      Alert.alert('Error', 'Failed to load payment');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchPayment();
  }, [fetchPayment]);

  const handlePayment = async () => {
    if (!payment || !user) return;

    const amount = parseFloat(paymentAmount);
    const remaining = payment.amount_due - payment.amount_paid;

    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid payment amount');
      return;
    }

    if (amount > remaining) {
      Alert.alert('Invalid Amount', 'Payment amount cannot exceed the remaining balance');
      return;
    }

    if (payment.payment_item.allow_partial_payment && payment.payment_item.min_payment_amount) {
      if (amount < payment.payment_item.min_payment_amount && amount < remaining) {
        Alert.alert(
          'Minimum Payment',
          `Minimum payment amount is $${payment.payment_item.min_payment_amount.toFixed(2)}`
        );
        return;
      }
    }

    setProcessing(true);

    try {
      // In a real app, this would integrate with a payment provider like Stripe
      // For demo purposes, we'll simulate a successful payment

      // Create transaction record
      const { error: txError } = await supabase
        .from('payment_transactions')
        .insert({
          school_id: payment.payment_item.school_id,
          recipient_id: payment.id,
          amount,
          currency: payment.payment_item.currency,
          payment_method: 'card',
          payment_provider: 'demo',
          status: 'completed',
          paid_by: user.id,
          completed_at: new Date().toISOString(),
        });

      if (txError) throw txError;

      // Update recipient status (trigger will handle this, but let's update locally)
      const newPaidAmount = payment.amount_paid + amount;
      const newStatus = newPaidAmount >= payment.amount_due ? 'paid' : 'partial';

      await supabase
        .from('payment_recipients')
        .update({
          amount_paid: newPaidAmount,
          status: newStatus,
        })
        .eq('id', payment.id);

      Alert.alert(
        'Payment Successful!',
        `You have paid $${amount.toFixed(2)}${newStatus === 'paid' ? '. Payment complete!' : '.'}`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error) {
      console.error('Error processing payment:', error);
      Alert.alert('Payment Failed', 'There was an error processing your payment. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  if (!payment) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Payment not found</Text>
      </View>
    );
  }

  const remaining = payment.amount_due - payment.amount_paid;
  const isPaid = payment.status === 'paid';
  const isWaived = payment.status === 'waived';
  const canPay = !isPaid && !isWaived;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Payment Details',
          headerStyle: { backgroundColor: '#4F46E5' },
          headerTintColor: '#fff',
        }}
      />

      <ScrollView style={styles.container}>
        {/* Payment Header */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Text style={styles.headerIconText}>
              {payment.payment_item.category?.icon || '💳'}
            </Text>
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>{payment.payment_item.title}</Text>
            <Text style={styles.headerSubtitle}>
              For {payment.student.first_name} {payment.student.last_name}
            </Text>
            {payment.payment_item.category && (
              <Text style={styles.categoryText}>
                {payment.payment_item.category.name}
              </Text>
            )}
          </View>
        </View>

        {payment.payment_item.description && (
          <View style={styles.descriptionCard}>
            <Text style={styles.descriptionText}>
              {payment.payment_item.description}
            </Text>
          </View>
        )}

        {/* Amount Summary */}
        <View style={styles.amountCard}>
          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>Total Amount</Text>
            <Text style={styles.amountValue}>
              ${payment.amount_due.toFixed(2)}
            </Text>
          </View>

          {payment.amount_paid > 0 && (
            <View style={styles.amountRow}>
              <Text style={styles.amountLabel}>Amount Paid</Text>
              <Text style={[styles.amountValue, { color: '#10B981' }]}>
                -${payment.amount_paid.toFixed(2)}
              </Text>
            </View>
          )}

          <View style={styles.divider} />

          <View style={styles.amountRow}>
            <Text style={styles.remainingLabel}>
              {isPaid ? 'Status' : isWaived ? 'Status' : 'Balance Due'}
            </Text>
            <Text
              style={[
                styles.remainingValue,
                isPaid && { color: '#10B981' },
                isWaived && { color: '#6B7280' },
              ]}
            >
              {isPaid ? 'PAID' : isWaived ? 'WAIVED' : `$${remaining.toFixed(2)}`}
            </Text>
          </View>

          {payment.status === 'partial' && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${(payment.amount_paid / payment.amount_due) * 100}%` },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                {Math.round((payment.amount_paid / payment.amount_due) * 100)}% paid
              </Text>
            </View>
          )}
        </View>

        {payment.payment_item.due_date && (
          <View
            style={[
              styles.dueDateCard,
              new Date(payment.payment_item.due_date) < new Date() &&
                canPay && { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' },
            ]}
          >
            <Text
              style={[
                styles.dueDateText,
                new Date(payment.payment_item.due_date) < new Date() &&
                  canPay && { color: '#991B1B' },
              ]}
            >
              {new Date(payment.payment_item.due_date) < new Date() && canPay
                ? '⚠️ Payment was due on '
                : '📅 Due by '}
              {new Date(payment.payment_item.due_date).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
          </View>
        )}

        {/* Payment Form */}
        {canPay && (
          <View style={styles.paymentSection}>
            <Text style={styles.sectionTitle}>Make a Payment</Text>

            {payment.payment_item.allow_partial_payment && (
              <View style={styles.paymentOptions}>
                <TouchableOpacity
                  style={[
                    styles.paymentOption,
                    payFullAmount && styles.paymentOptionSelected,
                  ]}
                  onPress={() => {
                    setPayFullAmount(true);
                    setPaymentAmount(remaining.toFixed(2));
                  }}
                >
                  <Text
                    style={[
                      styles.paymentOptionText,
                      payFullAmount && styles.paymentOptionTextSelected,
                    ]}
                  >
                    Pay Full Amount
                  </Text>
                  <Text
                    style={[
                      styles.paymentOptionAmount,
                      payFullAmount && styles.paymentOptionTextSelected,
                    ]}
                  >
                    ${remaining.toFixed(2)}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.paymentOption,
                    !payFullAmount && styles.paymentOptionSelected,
                  ]}
                  onPress={() => setPayFullAmount(false)}
                >
                  <Text
                    style={[
                      styles.paymentOptionText,
                      !payFullAmount && styles.paymentOptionTextSelected,
                    ]}
                  >
                    Pay Custom Amount
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {(!payment.payment_item.allow_partial_payment || !payFullAmount) && (
              <View style={styles.amountInputContainer}>
                <Text style={styles.currencySymbol}>$</Text>
                <TextInput
                  style={styles.amountInput}
                  value={paymentAmount}
                  onChangeText={setPaymentAmount}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  editable={!payFullAmount || !payment.payment_item.allow_partial_payment}
                />
              </View>
            )}

            {payment.payment_item.min_payment_amount &&
              payment.payment_item.allow_partial_payment && (
                <Text style={styles.minPaymentText}>
                  Minimum payment: ${payment.payment_item.min_payment_amount.toFixed(2)}
                </Text>
              )}

            {/* Demo Payment Methods */}
            <View style={styles.paymentMethods}>
              <Text style={styles.methodsTitle}>Payment Method</Text>
              <TouchableOpacity style={styles.methodCard}>
                <Text style={styles.methodIcon}>💳</Text>
                <View style={styles.methodInfo}>
                  <Text style={styles.methodName}>Credit/Debit Card</Text>
                  <Text style={styles.methodDesc}>Visa, Mastercard, Amex</Text>
                </View>
                <Text style={styles.methodCheck}>✓</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.payButton, processing && { opacity: 0.7 }]}
              onPress={handlePayment}
              disabled={processing}
            >
              <Text style={styles.payButtonText}>
                {processing
                  ? 'Processing...'
                  : `Pay $${parseFloat(paymentAmount || '0').toFixed(2)}`}
              </Text>
            </TouchableOpacity>

            <Text style={styles.secureText}>
              🔒 Your payment information is secure and encrypted
            </Text>
          </View>
        )}

        {isPaid && (
          <View style={styles.paidBanner}>
            <Text style={styles.paidIcon}>✓</Text>
            <Text style={styles.paidText}>This payment has been completed</Text>
          </View>
        )}

        {isWaived && (
          <View style={[styles.paidBanner, { backgroundColor: '#F3F4F6' }]}>
            <Text style={styles.paidIcon}>📋</Text>
            <Text style={[styles.paidText, { color: '#6B7280' }]}>
              This payment has been waived
            </Text>
            {payment.waived_reason && (
              <Text style={styles.waivedReason}>
                Reason: {payment.waived_reason}
              </Text>
            )}
          </View>
        )}

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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#6B7280',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  headerIcon: {
    width: 60,
    height: 60,
    borderRadius: 14,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerIconText: {
    fontSize: 32,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  categoryText: {
    fontSize: 13,
    color: '#4F46E5',
    marginTop: 4,
    fontWeight: '500',
  },
  descriptionCard: {
    backgroundColor: '#fff',
    padding: 16,
    marginTop: 1,
  },
  descriptionText: {
    fontSize: 15,
    color: '#374151',
    lineHeight: 22,
  },
  amountCard: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  amountLabel: {
    fontSize: 15,
    color: '#6B7280',
  },
  amountValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 12,
  },
  remainingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  remainingValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#EF4444',
  },
  progressContainer: {
    marginTop: 16,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: '500',
    marginTop: 8,
    textAlign: 'right',
  },
  dueDateCard: {
    backgroundColor: '#FEF3C7',
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  dueDateText: {
    fontSize: 14,
    color: '#92400E',
    textAlign: 'center',
    fontWeight: '500',
  },
  paymentSection: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 20,
    borderRadius: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  paymentOptions: {
    marginBottom: 16,
    gap: 10,
  },
  paymentOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  paymentOptionSelected: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  paymentOptionText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#6B7280',
  },
  paymentOptionAmount: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  paymentOptionTextSelected: {
    color: '#4F46E5',
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: '600',
    color: '#374151',
  },
  amountInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: '600',
    color: '#111827',
    paddingVertical: 16,
    paddingLeft: 8,
  },
  minPaymentText: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 16,
  },
  paymentMethods: {
    marginBottom: 20,
  },
  methodsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 10,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#4F46E5',
  },
  methodIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  methodInfo: {
    flex: 1,
  },
  methodName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  methodDesc: {
    fontSize: 13,
    color: '#6B7280',
  },
  methodCheck: {
    fontSize: 18,
    color: '#4F46E5',
    fontWeight: 'bold',
  },
  payButton: {
    backgroundColor: '#4F46E5',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  payButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  secureText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 12,
  },
  paidBanner: {
    backgroundColor: '#D1FAE5',
    margin: 16,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
  },
  paidIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  paidText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#065F46',
  },
  waivedReason: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
  },
});
