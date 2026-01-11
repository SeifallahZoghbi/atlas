'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface FormField {
  id: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'date';
  label: string;
  required: boolean;
  options?: string[];
}

interface ClassOption {
  id: string;
  name: string;
  grade: string;
}

const FIELD_TYPES = [
  { value: 'text', label: 'Short Text', icon: '📝' },
  { value: 'textarea', label: 'Long Text', icon: '📄' },
  { value: 'select', label: 'Dropdown', icon: '📋' },
  { value: 'checkbox', label: 'Checkbox', icon: '☑️' },
  { value: 'radio', label: 'Multiple Choice', icon: '🔘' },
  { value: 'date', label: 'Date', icon: '📅' },
];

const FORM_TYPES = [
  { value: 'permission', label: 'Permission Slip', icon: '✍️' },
  { value: 'consent', label: 'Consent Form', icon: '📋' },
  { value: 'survey', label: 'Survey', icon: '📊' },
  { value: 'registration', label: 'Registration', icon: '📝' },
  { value: 'medical', label: 'Medical Form', icon: '🏥' },
  { value: 'other', label: 'Other', icon: '📄' },
];

export default function NewFormPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState<ClassOption[]>([]);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    form_type: 'permission',
    target_type: 'school',
    target_id: '',
    requires_signature: true,
    requires_all_guardians: false,
    allow_decline: true,
    due_date: '',
  });

  const [fields, setFields] = useState<FormField[]>([]);
  const [showAddField, setShowAddField] = useState(false);
  const [newField, setNewField] = useState<Partial<FormField>>({
    type: 'text',
    label: '',
    required: false,
    options: [],
  });
  const [optionInput, setOptionInput] = useState('');

  useEffect(() => {
    fetchClasses();
  }, []);

  const fetchClasses = async () => {
    const { data } = await supabase
      .from('classes')
      .select('id, name, grade')
      .order('name');
    setClasses(data || []);
  };

  const addField = () => {
    if (!newField.label) return;

    const field: FormField = {
      id: crypto.randomUUID(),
      type: newField.type as FormField['type'],
      label: newField.label,
      required: newField.required || false,
      options: ['select', 'radio'].includes(newField.type || '')
        ? newField.options
        : undefined,
    };

    setFields([...fields, field]);
    setNewField({ type: 'text', label: '', required: false, options: [] });
    setOptionInput('');
    setShowAddField(false);
  };

  const removeField = (id: string) => {
    setFields(fields.filter((f) => f.id !== id));
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    const newFields = [...fields];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= fields.length) return;
    [newFields[index], newFields[swapIndex]] = [newFields[swapIndex], newFields[index]];
    setFields(newFields);
  };

  const addOption = () => {
    if (!optionInput.trim()) return;
    setNewField({
      ...newField,
      options: [...(newField.options || []), optionInput.trim()],
    });
    setOptionInput('');
  };

  const removeOption = (index: number) => {
    setNewField({
      ...newField,
      options: newField.options?.filter((_, i) => i !== index),
    });
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

      const { data: form, error } = await supabase
        .from('forms')
        .insert({
          school_id: userProfile?.school_id,
          title: formData.title,
          description: formData.description || null,
          form_type: formData.form_type,
          fields: fields,
          target_type: formData.target_type,
          target_id: formData.target_id || null,
          requires_signature: formData.requires_signature,
          requires_all_guardians: formData.requires_all_guardians,
          allow_decline: formData.allow_decline,
          due_date: formData.due_date || null,
          status: saveAsDraft ? 'draft' : 'active',
          created_by: userData.user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      // If publishing, create recipients
      if (!saveAsDraft && form) {
        await createRecipients(form.id, userProfile?.school_id);
      }

      router.push('/dashboard/forms');
    } catch (error) {
      console.error('Error creating form:', error);
      alert('Failed to create form');
    } finally {
      setLoading(false);
    }
  };

  const createRecipients = async (formId: string, schoolId: string) => {
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
        form_id: formId,
        student_id: studentId,
      }));

      await supabase.from('form_recipients').insert(recipients);
    }
  };

  const grades = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Create New Form</h1>
        <p className="text-gray-600 mt-1">Build a form for parents to complete</p>
      </div>

      <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-6">
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Form Details</h3>

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
                placeholder="e.g., Field Trip Permission - Zoo Visit"
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
                placeholder="Additional details about this form..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Form Type *
              </label>
              <div className="grid grid-cols-3 gap-2">
                {FORM_TYPES.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, form_type: type.value })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                      formData.form_type === type.value
                        ? 'bg-primary-100 text-primary-700 border-2 border-primary-500'
                        : 'bg-gray-100 text-gray-600 border-2 border-transparent'
                    }`}
                  >
                    <span>{type.icon}</span>
                    <span>{type.label}</span>
                  </button>
                ))}
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

            {formData.target_type === 'grade' && (
              <select
                value={formData.target_id}
                onChange={(e) => setFormData({ ...formData, target_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Select grade</option>
                {grades.map((grade) => (
                  <option key={grade} value={grade}>Grade {grade}</option>
                ))}
              </select>
            )}

            {formData.target_type === 'class' && (
              <select
                value={formData.target_id}
                onChange={(e) => setFormData({ ...formData, target_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Select class</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>{cls.name} ({cls.grade})</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Form Options</h3>

          <div className="space-y-3">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={formData.requires_signature}
                onChange={(e) =>
                  setFormData({ ...formData, requires_signature: e.target.checked })
                }
                className="w-4 h-4 text-primary-600 border-gray-300 rounded"
              />
              <span className="text-sm text-gray-700">Require parent signature</span>
            </label>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={formData.requires_all_guardians}
                onChange={(e) =>
                  setFormData({ ...formData, requires_all_guardians: e.target.checked })
                }
                className="w-4 h-4 text-primary-600 border-gray-300 rounded"
              />
              <span className="text-sm text-gray-700">Require all guardians to sign</span>
            </label>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={formData.allow_decline}
                onChange={(e) =>
                  setFormData({ ...formData, allow_decline: e.target.checked })
                }
                className="w-4 h-4 text-primary-600 border-gray-300 rounded"
              />
              <span className="text-sm text-gray-700">Allow parents to decline</span>
            </label>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Form Fields</h3>
            <button
              type="button"
              onClick={() => setShowAddField(true)}
              className="btn-secondary text-sm"
            >
              + Add Field
            </button>
          </div>

          {fields.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg">
              <p className="text-gray-500 text-sm">
                No fields added yet. Add fields to collect information from parents.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => moveField(index, 'up')}
                      disabled={index === 0}
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveField(index, 'down')}
                      disabled={index === fields.length - 1}
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    >
                      ▼
                    </button>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </p>
                    <p className="text-xs text-gray-500 capitalize">{field.type}</p>
                    {field.options && field.options.length > 0 && (
                      <p className="text-xs text-gray-400">
                        Options: {field.options.join(', ')}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeField(field.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {showAddField && (
            <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-white">
              <h4 className="font-medium text-gray-900 mb-3">Add New Field</h4>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">Field Type</label>
                  <select
                    value={newField.type}
                    onChange={(e) => setNewField({ ...newField, type: e.target.value as FormField['type'] })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    {FIELD_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.icon} {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-700 mb-1">Label</label>
                  <input
                    type="text"
                    value={newField.label}
                    onChange={(e) => setNewField({ ...newField, label: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="e.g., Emergency Contact Name"
                  />
                </div>

                {['select', 'radio'].includes(newField.type || '') && (
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Options</label>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={optionInput}
                        onChange={(e) => setOptionInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addOption())}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="Add an option"
                      />
                      <button
                        type="button"
                        onClick={addOption}
                        className="px-3 py-2 bg-gray-100 rounded-lg"
                      >
                        Add
                      </button>
                    </div>
                    {newField.options && newField.options.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {newField.options.map((opt, i) => (
                          <span
                            key={i}
                            className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-sm"
                          >
                            {opt}
                            <button
                              type="button"
                              onClick={() => removeOption(i)}
                              className="text-gray-500 hover:text-red-500"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newField.required}
                    onChange={(e) => setNewField({ ...newField, required: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-gray-700">Required field</span>
                </label>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddField(false)}
                    className="btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={addField}
                    className="btn-primary flex-1"
                  >
                    Add Field
                  </button>
                </div>
              </div>
            </div>
          )}
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
            {loading ? 'Publishing...' : 'Publish Form'}
          </button>
        </div>
      </form>
    </div>
  );
}
