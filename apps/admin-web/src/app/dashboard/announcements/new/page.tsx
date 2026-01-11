'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function NewAnnouncementPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from('users')
      .select('school_id')
      .eq('id', user.id)
      .single();

    const data = {
      school_id: profile?.school_id,
      type: formData.get('type'),
      title: formData.get('title'),
      body: formData.get('body'),
      priority: formData.get('priority'),
      target_type: formData.get('target_type'),
      author_id: user.id,
      action_required: formData.get('action_required') === 'on',
    };

    const { error: insertError } = await supabase.from('feed_items').insert(data);

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    router.push('/dashboard/announcements');
    router.refresh();
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link
          href="/dashboard/announcements"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to Announcements
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">New Announcement</h1>
        <p className="text-gray-600 mt-1">Create a new announcement for parents and staff</p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Type *
          </label>
          <select name="type" required className="input">
            <option value="announcement">Announcement</option>
            <option value="homework">Homework</option>
            <option value="payment">Payment</option>
            <option value="form">Form/Permission</option>
            <option value="emergency">Emergency</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Title *
          </label>
          <input
            type="text"
            name="title"
            required
            className="input"
            placeholder="Enter announcement title"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Message
          </label>
          <textarea
            name="body"
            rows={4}
            className="input"
            placeholder="Enter the announcement message"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Priority *
            </label>
            <select name="priority" required className="input">
              <option value="normal">Normal</option>
              <option value="low">Low</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Target Audience *
            </label>
            <select name="target_type" required className="input">
              <option value="school">Entire School</option>
              <option value="grade">Specific Grade</option>
              <option value="class">Specific Class</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            name="action_required"
            id="action_required"
            className="w-4 h-4 text-primary-600 rounded border-gray-300"
          />
          <label htmlFor="action_required" className="text-sm text-gray-700">
            Requires action from recipients
          </label>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
          >
            {loading ? 'Publishing...' : 'Publish Announcement'}
          </button>
          <Link href="/dashboard/announcements" className="btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
