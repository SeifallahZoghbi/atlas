import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

interface FormItem {
  id: string;
  title: string;
  description: string | null;
  form_type: string;
  target_type: string;
  requires_signature: boolean;
  due_date: string | null;
  status: string;
  created_at: string;
  _count?: {
    total: number;
    completed: number;
    pending: number;
  };
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'Draft', color: 'text-gray-600', bg: 'bg-gray-100' },
  active: { label: 'Active', color: 'text-green-600', bg: 'bg-green-100' },
  closed: { label: 'Closed', color: 'text-blue-600', bg: 'bg-blue-100' },
  cancelled: { label: 'Cancelled', color: 'text-red-600', bg: 'bg-red-100' },
};

const TYPE_ICONS: Record<string, string> = {
  permission: '✍️',
  consent: '📋',
  survey: '📊',
  registration: '📝',
  medical: '🏥',
  other: '📄',
};

export default async function FormsPage() {
  const supabase = createClient();

  // Fetch forms
  const { data: forms } = await supabase
    .from('forms')
    .select('*')
    .order('created_at', { ascending: false });

  // Get recipient stats for each form
  const formsWithStats = await Promise.all(
    (forms || []).map(async (form) => {
      const { data: recipients } = await supabase
        .from('form_recipients')
        .select('status')
        .eq('form_id', form.id);

      const total = recipients?.length || 0;
      const completed = recipients?.filter((r) => r.status === 'completed').length || 0;
      const pending = recipients?.filter((r) => r.status === 'pending' || r.status === 'viewed').length || 0;

      return {
        ...form,
        _count: { total, completed, pending },
      };
    })
  );

  // Calculate stats
  const activeForms = formsWithStats.filter((f) => f.status === 'active');
  const pendingSignatures = activeForms.reduce((sum, f) => sum + (f._count?.pending || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Forms</h1>
          <p className="text-gray-600 mt-1">Manage permission slips, surveys, and consent forms</p>
        </div>
        <Link href="/dashboard/forms/new" className="btn-primary">
          + New Form
        </Link>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card text-center">
          <p className="text-3xl font-bold text-gray-900">{formsWithStats.length}</p>
          <p className="text-sm text-gray-500">Total Forms</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-green-600">{activeForms.length}</p>
          <p className="text-sm text-gray-500">Active</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-orange-500">{pendingSignatures}</p>
          <p className="text-sm text-gray-500">Pending Signatures</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-primary-600">
            {activeForms.reduce((sum, f) => sum + (f._count?.completed || 0), 0)}
          </p>
          <p className="text-sm text-gray-500">Completed Today</p>
        </div>
      </div>

      {/* Form Type Quick Filters */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4">Form Types</h3>
        <div className="flex flex-wrap gap-3">
          {Object.entries(TYPE_ICONS).map(([type, icon]) => {
            const count = formsWithStats.filter(
              (f) => f.form_type === type && f.status === 'active'
            ).length;

            return (
              <div
                key={type}
                className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg"
              >
                <span className="text-xl">{icon}</span>
                <span className="text-sm font-medium text-gray-700 capitalize">{type}</span>
                <span className="text-xs text-gray-400">({count})</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Forms List */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4">All Forms</h3>

        {(!formsWithStats || formsWithStats.length === 0) ? (
          <div className="text-center py-12">
            <p className="text-4xl mb-4">📋</p>
            <p className="text-gray-500 mb-4">No forms created yet</p>
            <Link href="/dashboard/forms/new" className="btn-primary">
              Create First Form
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Form
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Target
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Due Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Progress
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {formsWithStats.map((form) => {
                  const config = STATUS_CONFIG[form.status] || STATUS_CONFIG.draft;
                  const progress = form._count?.total
                    ? Math.round((form._count.completed / form._count.total) * 100)
                    : 0;

                  return (
                    <tr key={form.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">
                            {TYPE_ICONS[form.form_type] || '📄'}
                          </span>
                          <div>
                            <p className="font-medium text-gray-900">{form.title}</p>
                            {form.requires_signature && (
                              <span className="text-xs text-primary-600">
                                ✍️ Signature required
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm text-gray-600 capitalize">
                          {form.form_type}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm text-gray-600 capitalize">
                          {form.target_type}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        {form.due_date ? (
                          <span className="text-sm text-gray-600">
                            {new Date(form.due_date).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">No due date</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="w-24">
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>{form._count?.completed || 0}/{form._count?.total || 0}</span>
                            <span>{progress}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-green-500 h-2 rounded-full"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`text-xs px-2 py-1 rounded-full ${config.bg} ${config.color}`}>
                          {config.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Link
                          href={`/dashboard/forms/${form.id}`}
                          className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pending Signatures Alert */}
      {pendingSignatures > 0 && (
        <div className="card border-orange-200">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">✍️</span>
            <h3 className="font-semibold text-gray-900">
              {pendingSignatures} Pending Signatures
            </h3>
          </div>
          <p className="text-sm text-gray-600">
            There are forms waiting for parent signatures. Consider sending reminders.
          </p>
          <button className="btn-secondary mt-4">
            Send Signature Reminders
          </button>
        </div>
      )}
    </div>
  );
}
