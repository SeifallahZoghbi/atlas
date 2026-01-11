import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/contexts/AuthContext';
import { Form, FormField, FormRecipient, Student } from '../../../src/lib/types';

interface FormWithDetails extends FormRecipient {
  form: Form;
  student: Student;
}

const TYPE_ICONS: Record<string, string> = {
  permission: '✍️',
  consent: '📋',
  survey: '📊',
  registration: '📝',
  medical: '🏥',
  other: '📄',
};

export default function FormDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const [formData, setFormData] = useState<FormWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [signatureName, setSignatureName] = useState('');
  const [decision, setDecision] = useState<'approved' | 'declined' | null>(null);
  const [declineReason, setDeclineReason] = useState('');

  const fetchFormData = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('form_recipients')
        .select(`
          *,
          form:forms (*),
          student:students (*)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      setFormData(data as FormWithDetails);

      // Pre-populate user's name for signature
      if (user) {
        setSignatureName(`${user.first_name} ${user.last_name}`);
      }
    } catch (error) {
      console.error('Error fetching form:', error);
      Alert.alert('Error', 'Failed to load form');
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useEffect(() => {
    fetchFormData();
  }, [fetchFormData]);

  const handleResponseChange = (fieldId: string, value: unknown) => {
    setResponses((prev) => ({ ...prev, [fieldId]: value }));
  };

  const validateForm = (): boolean => {
    if (!formData?.form.fields) return true;

    const fields = formData.form.fields as FormField[];
    for (const field of fields) {
      if (field.required) {
        const value = responses[field.id];
        if (value === undefined || value === null || value === '') {
          Alert.alert('Required Field', `Please fill in "${field.label}"`);
          return false;
        }
      }
    }

    if (formData.form.requires_signature && !signatureName.trim()) {
      Alert.alert('Signature Required', 'Please provide your signature');
      return false;
    }

    return true;
  };

  const handleSubmit = async (approve: boolean) => {
    if (approve && !validateForm()) return;

    if (!approve && formData?.form.allow_decline) {
      setDecision('declined');
      setShowSignatureModal(true);
      return;
    }

    if (formData?.form.requires_signature) {
      setDecision('approved');
      setShowSignatureModal(true);
      return;
    }

    await submitForm('approved');
  };

  const submitForm = async (finalDecision: 'approved' | 'declined') => {
    setSubmitting(true);

    try {
      // Create form response
      const { error: responseError } = await supabase
        .from('form_responses')
        .insert({
          form_id: formData!.form.id,
          recipient_id: formData!.id,
          student_id: formData!.student_id,
          responses,
          decision: finalDecision,
          decline_reason: finalDecision === 'declined' ? declineReason : null,
          signature_name: signatureName || null,
          signed_by: user!.id,
          signed_at: new Date().toISOString(),
        });

      if (responseError) throw responseError;

      // Update recipient status
      const { error: updateError } = await supabase
        .from('form_recipients')
        .update({
          status: finalDecision === 'approved' ? 'completed' : 'declined',
        })
        .eq('id', formData!.id);

      if (updateError) throw updateError;

      Alert.alert(
        'Success',
        finalDecision === 'approved'
          ? 'Form submitted successfully!'
          : 'Form declined successfully.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error) {
      console.error('Error submitting form:', error);
      Alert.alert('Error', 'Failed to submit form');
    } finally {
      setSubmitting(false);
      setShowSignatureModal(false);
    }
  };

  const renderField = (field: FormField) => {
    const value = responses[field.id];

    switch (field.type) {
      case 'text':
        return (
          <TextInput
            style={styles.textInput}
            value={value as string || ''}
            onChangeText={(text) => handleResponseChange(field.id, text)}
            placeholder={field.placeholder || 'Enter text...'}
          />
        );

      case 'textarea':
        return (
          <TextInput
            style={[styles.textInput, styles.textArea]}
            value={value as string || ''}
            onChangeText={(text) => handleResponseChange(field.id, text)}
            placeholder={field.placeholder || 'Enter text...'}
            multiline
            numberOfLines={4}
          />
        );

      case 'select':
        return (
          <View style={styles.optionsContainer}>
            {field.options?.map((option, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.optionButton,
                  value === option && styles.optionButtonSelected,
                ]}
                onPress={() => handleResponseChange(field.id, option)}
              >
                <Text
                  style={[
                    styles.optionText,
                    value === option && styles.optionTextSelected,
                  ]}
                >
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        );

      case 'radio':
        return (
          <View style={styles.radioContainer}>
            {field.options?.map((option, index) => (
              <TouchableOpacity
                key={index}
                style={styles.radioOption}
                onPress={() => handleResponseChange(field.id, option)}
              >
                <View style={styles.radioCircle}>
                  {value === option && <View style={styles.radioSelected} />}
                </View>
                <Text style={styles.radioLabel}>{option}</Text>
              </TouchableOpacity>
            ))}
          </View>
        );

      case 'checkbox':
        return (
          <TouchableOpacity
            style={styles.checkboxContainer}
            onPress={() => handleResponseChange(field.id, !value)}
          >
            <View style={[styles.checkbox, value && styles.checkboxSelected]}>
              {value && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>{field.label}</Text>
          </TouchableOpacity>
        );

      case 'date':
        return (
          <TextInput
            style={styles.textInput}
            value={value as string || ''}
            onChangeText={(text) => handleResponseChange(field.id, text)}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
          />
        );

      default:
        return (
          <TextInput
            style={styles.textInput}
            value={value as string || ''}
            onChangeText={(text) => handleResponseChange(field.id, text)}
          />
        );
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  if (!formData) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Form not found</Text>
      </View>
    );
  }

  const isCompleted = formData.status === 'completed' || formData.status === 'declined';
  const fields = (formData.form.fields || []) as FormField[];

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: formData.form.title,
          headerStyle: { backgroundColor: '#4F46E5' },
          headerTintColor: '#fff',
        }}
      />

      <ScrollView style={styles.container}>
        {/* Form Header */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Text style={styles.headerIconText}>
              {TYPE_ICONS[formData.form.form_type] || '📄'}
            </Text>
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>{formData.form.title}</Text>
            <Text style={styles.headerSubtitle}>
              For {formData.student.first_name} {formData.student.last_name}
            </Text>
          </View>
        </View>

        {formData.form.description && (
          <View style={styles.descriptionCard}>
            <Text style={styles.descriptionText}>{formData.form.description}</Text>
          </View>
        )}

        {formData.form.due_date && (
          <View style={styles.dueDateBanner}>
            <Text style={styles.dueDateText}>
              📅 Due: {new Date(formData.form.due_date).toLocaleDateString()}
            </Text>
          </View>
        )}

        {isCompleted ? (
          <View style={[
            styles.completedBanner,
            formData.status === 'declined' && { backgroundColor: '#FEE2E2' }
          ]}>
            <Text style={[
              styles.completedText,
              formData.status === 'declined' && { color: '#991B1B' }
            ]}>
              {formData.status === 'completed'
                ? '✓ Form has been completed'
                : '✗ Form was declined'}
            </Text>
          </View>
        ) : (
          <>
            {/* Form Fields */}
            {fields.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Form Fields</Text>
                {fields.map((field) => (
                  <View key={field.id} style={styles.fieldContainer}>
                    {field.type !== 'checkbox' && (
                      <Text style={styles.fieldLabel}>
                        {field.label}
                        {field.required && <Text style={styles.required}> *</Text>}
                      </Text>
                    )}
                    {renderField(field)}
                  </View>
                ))}
              </View>
            )}

            {/* Signature Section */}
            {formData.form.requires_signature && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Signature</Text>
                <View style={styles.signatureBox}>
                  <Text style={styles.signatureLabel}>
                    Type your full name to sign
                  </Text>
                  <TextInput
                    style={styles.signatureInput}
                    value={signatureName}
                    onChangeText={setSignatureName}
                    placeholder="Your full name"
                  />
                  {signatureName && (
                    <View style={styles.signaturePreview}>
                      <Text style={styles.signaturePreviewText}>{signatureName}</Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              {formData.form.allow_decline && (
                <TouchableOpacity
                  style={styles.declineButton}
                  onPress={() => handleSubmit(false)}
                  disabled={submitting}
                >
                  <Text style={styles.declineButtonText}>Decline</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.submitButton,
                  !formData.form.allow_decline && { flex: 1 },
                ]}
                onPress={() => handleSubmit(true)}
                disabled={submitting}
              >
                <Text style={styles.submitButtonText}>
                  {submitting ? 'Submitting...' : formData.form.requires_signature ? 'Sign & Submit' : 'Submit'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Signature Confirmation Modal */}
      <Modal visible={showSignatureModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {decision === 'approved' ? 'Confirm Signature' : 'Confirm Decline'}
            </Text>

            {decision === 'approved' ? (
              <>
                <Text style={styles.modalText}>
                  By signing, you confirm that you have read and agree to the terms of this form.
                </Text>
                <View style={styles.signatureConfirmBox}>
                  <Text style={styles.signatureConfirmLabel}>Signature:</Text>
                  <Text style={styles.signatureConfirmText}>{signatureName}</Text>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.modalText}>
                  Please provide a reason for declining this form.
                </Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  value={declineReason}
                  onChangeText={setDeclineReason}
                  placeholder="Reason for declining..."
                  multiline
                  numberOfLines={3}
                />
              </>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowSignatureModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirmButton,
                  decision === 'declined' && { backgroundColor: '#EF4444' },
                ]}
                onPress={() => submitForm(decision!)}
                disabled={submitting}
              >
                <Text style={styles.modalConfirmText}>
                  {submitting ? 'Processing...' : 'Confirm'}
                </Text>
              </TouchableOpacity>
            </View>
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
    padding: 16,
    backgroundColor: '#fff',
  },
  headerIcon: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerIconText: {
    fontSize: 28,
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
  dueDateBanner: {
    backgroundColor: '#FEF3C7',
    padding: 12,
    alignItems: 'center',
  },
  dueDateText: {
    fontSize: 14,
    color: '#92400E',
    fontWeight: '500',
  },
  completedBanner: {
    backgroundColor: '#D1FAE5',
    padding: 20,
    margin: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  completedText: {
    fontSize: 16,
    color: '#065F46',
    fontWeight: '600',
  },
  section: {
    backgroundColor: '#fff',
    marginTop: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  fieldContainer: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  required: {
    color: '#EF4444',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionButtonSelected: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4F46E5',
  },
  optionText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  optionTextSelected: {
    color: '#4F46E5',
  },
  radioContainer: {
    gap: 12,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  radioSelected: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4F46E5',
  },
  radioLabel: {
    fontSize: 15,
    color: '#374151',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkboxSelected: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 15,
    color: '#374151',
    flex: 1,
  },
  signatureBox: {
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  signatureLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  signatureInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  signaturePreview: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
  },
  signaturePreviewText: {
    fontSize: 24,
    fontStyle: 'italic',
    color: '#1F2937',
    fontFamily: 'serif',
  },
  actionButtons: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  declineButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
  },
  declineButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#991B1B',
  },
  submitButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
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
    marginBottom: 12,
  },
  modalText: {
    fontSize: 15,
    color: '#6B7280',
    marginBottom: 16,
    lineHeight: 22,
  },
  signatureConfirmBox: {
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 10,
    marginBottom: 16,
  },
  signatureConfirmLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 8,
  },
  signatureConfirmText: {
    fontSize: 22,
    fontStyle: 'italic',
    color: '#1F2937',
    fontFamily: 'serif',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  modalConfirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
