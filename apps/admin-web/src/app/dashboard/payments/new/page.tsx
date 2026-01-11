'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface PaymentCategory {
  id: string;
  name: string;
  icon: string;
}

interface ClassOption {
  id: string;
  name: string;
  grade: string;
}

export default function NewPaymentPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<PaymentCategory[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    amount: '',
    category_id: '',
    target_type: 'school',
    target_id: '',
    due_date: '',
    allow_partial_payment: false,
    min_payment_amount: '',
    status: 'draft',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [catResult, classResult] = await Promise.all([
      supabase.from('payment_categories').select('*').eq('active', true).order('name'),
      supabase.from('classes').select('id, name, grade').order('name'),
    ]);

    setCategories(catResult.data || []);
    setClasses(classResult.data || []);
  };

  const handleSubmit = async (e: React.FormEvent, saveAsDraft = false) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data: userProfile } = await supabase
        .from('users')
        .select('school_id')
        .eq('id', userData.user?.id)
        .single();

      const { data: payment, error } = await supabase
        .from('payment_items')
        .insert({
          school_id: userProfile?.school_id,
          title: formData.title,
          description: formData.description || null,
          amount: parseFloat(formData.amount),
          category_id: formData.category_id || null,
          target_type: formData.target_type,
          target_id: formData.target_id || null,
          due_date: formData.due_date || null,
          allow_partial_payment: formData.allow_partial_payment,
          min_payment_amount: formData.min_payment_amount
            ? parseFloat(formData.min_payment_amount)
            : null,
          status: saveAsDraft ? 'draft' : 'active',
          created_by: userData.user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      // If publishing, create recipients based on target
      if (!saveAsDraft && payment) {
        await createRecipients(payment.id, userProfile?.school_id);
      }

      router.push('/dashboard/payments');
    } catch (error) {
      console.error('Error creating payment:', error);
      alert('Failed to create payment');
    } finally {
      setLoading(false);
    }
  };

  const createRecipients = async (paymentId: string, schoolId: string) => {
    let studentIds: string[] = [];

    if (formData.target_type === 'school') {
      const { data } = await supabase
        .from('students')
        .select('id')
        .eq('school_id', schoolId);
      studentIds = data?.map((s) => s.id) || [];
    } else if (formData.target_type === 'class' && formData.target_id) {
      const { data } = await supabase
        .from('class_enrollments')
        .select('student_id')
        .eq('class_id', formData.target_id);
      studentIds = data?.map((e) => e.student_id) || [];
    } else if (formData.target_type === 'grade') {
      const { data } = await supabase
        .from('students')
        .select('id')
        .eq('school_id', schoolId)
        .eq('grade', formData.target_id);
      studentIds = data?.map((s) => s.id) || [];
    }

    if (studentIds.length > 0) {
      const recipients = studentIds.map((studentId) => ({
        payment_item_id: paymentId,
        student_id: studentId,
        amount_due: parseFloat(formData.amount),
      }));

      await supabase.from('payment_recipients').insert(recipients);
    }
  };

  const grades = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Create New Payment</h1>
        <p className="text-gray-600 mt-1">Set up a new payment request for parents</p>
      </div>

      <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-6">
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Payment Details</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title *
              </label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="e.g., Field Trip Fee - Museum Visit"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Additional details about this payment..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="0"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <select
                  value={formData.category_id}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">Select category</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.icon} {cat.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={formData.due_date}
                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Target Audience</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Who should pay?
              </label>
              <div className="grid grid-cols-4 gap-2">
                {['school', 'grade', 'class', 'student'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFormData({ ...formData, target_type: type, target_id: '' })}
                    className={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${
                      formData.target_type === type
                        ? 'bg-primary-100 text-primary-700 border-2 border-primary-500'
                        : 'bg-gray-100 text-gray-600 border-2 border-transparent'
                    }`}
                  >
                    {type === 'school' ? 'All Students' : type}
                  </button>
                ))}
              </div>
            </div>

            {formData.target_type === 'grade' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Grade
                </label>
                <select
                  value={formData.target_id}
                  onChange={(e) => setFormData({ ...formData, target_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">Select grade</option>
                  {grades.map((grade) => (
                    <option key={grade} value={grade}>
                      Grade {grade}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {formData.target_type === 'class' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Class
                </label>
                <select
                  value={formData.target_id}
                  onChange={(e) => setFormData({ ...formData, target_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">Select class</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name} ({cls.grade})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Payment Options</h3>

          <div className="space-y-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={formData.allow_partial_payment}
                onChange={(e) =>
                  setFormData({ ...formData, allow_partial_payment: e.target.checked })
                }
                className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">Allow partial payments</span>
            </label>

            {formData.allow_partial_payment && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Minimum Payment Amount
                </label>
                <div className="relative w-48">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.min_payment_amount}
                    onChange={(e) =>
                      setFormData({ ...formData, min_payment_amount: e.target.value })
                    }
                    className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    placeholder="0.00"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="btn-secondary flex-1"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={(e) => handleSubmit(e, true)}
            disabled={loading}
            className="btn-secondary flex-1"
          >
            {loading ? 'Saving...' : 'Save as Draft'}
          </button>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary flex-1"
          >
            {loading ? 'Publishing...' : 'Publish Payment'}
          </button>
        </div>
      </form>
    </div>
  );
}
