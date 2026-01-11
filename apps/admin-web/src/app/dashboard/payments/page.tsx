import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

interface PaymentItem {
  id: string;
  title: string;
  description: string | null;
  amount: number;
  currency: string;
  target_type: string;
  due_date: string | null;
  status: string;
  created_at: string;
  category: {
    name: string;
    icon: string;
  } | null;
  _count?: {
    total: number;
    paid: number;
    pending: number;
  };
}

interface PaymentStats {
  total_items: number;
  total_amount: number;
  collected_amount: number;
  pending_amount: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'Draft', color: 'text-gray-600', bg: 'bg-gray-100' },
  active: { label: 'Active', color: 'text-green-600', bg: 'bg-green-100' },
  closed: { label: 'Closed', color: 'text-blue-600', bg: 'bg-blue-100' },
  cancelled: { label: 'Cancelled', color: 'text-red-600', bg: 'bg-red-100' },
};

export default async function PaymentsPage() {
  const supabase = createClient();

  // Fetch payment items with stats
  const { data: paymentItems } = await supabase
    .from('payment_items')
    .select(`
      *,
      category:payment_categories(name, icon)
    `)
    .order('created_at', { ascending: false });

  // Get payment recipient stats for each item
  const itemsWithStats = await Promise.all(
    (paymentItems || []).map(async (item) => {
      const { data: recipients } = await supabase
        .from('payment_recipients')
        .select('status, amount_due, amount_paid')
        .eq('payment_item_id', item.id);

      const total = recipients?.length || 0;
      const paid = recipients?.filter((r) => r.status === 'paid').length || 0;
      const pending = recipients?.filter((r) => r.status === 'pending' || r.status === 'partial').length || 0;
      const collectedAmount = recipients?.reduce((sum, r) => sum + (r.amount_paid || 0), 0) || 0;
      const totalDue = recipients?.reduce((sum, r) => sum + (r.amount_due || 0), 0) || 0;

      return {
        ...item,
        _count: { total, paid, pending },
        _amounts: { collected: collectedAmount, due: totalDue },
      };
    })
  );

  // Calculate overall stats
  const activeItems = itemsWithStats.filter((i) => i.status === 'active');
  const totalAmount = activeItems.reduce((sum, i) => sum + (i._amounts?.due || 0), 0);
  const collectedAmount = activeItems.reduce((sum, i) => sum + (i._amounts?.collected || 0), 0);
  const pendingAmount = totalAmount - collectedAmount;
  const collectionRate = totalAmount > 0 ? (collectedAmount / totalAmount) * 100 : 0;

  // Fetch categories
  const { data: categories } = await supabase
    .from('payment_categories')
    .select('*')
    .eq('active', true)
    .order('name');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
          <p className="text-gray-600 mt-1">Manage school fees, lunch payments, and more</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/payments/categories" className="btn-secondary">
            Categories
          </Link>
          <Link href="/dashboard/payments/new" className="btn-primary">
            + New Payment
          </Link>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card text-center">
          <p className="text-3xl font-bold text-gray-900">{activeItems.length}</p>
          <p className="text-sm text-gray-500">Active Payments</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-gray-900">${totalAmount.toFixed(2)}</p>
          <p className="text-sm text-gray-500">Total Due</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-green-600">${collectedAmount.toFixed(2)}</p>
          <p className="text-sm text-gray-500">Collected</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-primary-600">{collectionRate.toFixed(1)}%</p>
          <p className="text-sm text-gray-500">Collection Rate</p>
        </div>
      </div>

      {/* Payment Categories Quick View */}
      {categories && categories.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Categories</h3>
          <div className="flex flex-wrap gap-3">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg"
              >
                <span className="text-xl">{cat.icon}</span>
                <span className="text-sm font-medium text-gray-700">{cat.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment Items List */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4">All Payment Items</h3>

        {(!itemsWithStats || itemsWithStats.length === 0) ? (
          <div className="text-center py-12">
            <p className="text-4xl mb-4">💳</p>
            <p className="text-gray-500 mb-4">No payment items created yet</p>
            <Link href="/dashboard/payments/new" className="btn-primary">
              Create First Payment
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Payment
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Amount
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
                {itemsWithStats.map((item) => {
                  const config = STATUS_CONFIG[item.status] || STATUS_CONFIG.draft;
                  const progress = item._count?.total
                    ? Math.round((item._count.paid / item._count.total) * 100)
                    : 0;

                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{item.category?.icon || '💳'}</span>
                          <div>
                            <p className="font-medium text-gray-900">{item.title}</p>
                            <p className="text-xs text-gray-500">
                              {item.category?.name || 'Uncategorized'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-semibold text-gray-900">
                          ${item.amount.toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-500">{item.currency}</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm text-gray-600 capitalize">
                          {item.target_type}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        {item.due_date ? (
                          <span className="text-sm text-gray-600">
                            {new Date(item.due_date).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">No due date</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="w-24">
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>{item._count?.paid || 0}/{item._count?.total || 0}</span>
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
                          href={`/dashboard/payments/${item.id}`}
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

      {/* Outstanding Payments Alert */}
      {pendingAmount > 0 && (
        <div className="card border-orange-200">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">💰</span>
            <h3 className="font-semibold text-gray-900">
              Outstanding Balance: ${pendingAmount.toFixed(2)}
            </h3>
          </div>
          <p className="text-sm text-gray-600">
            There are outstanding payments across {activeItems.filter((i) => (i._count?.pending || 0) > 0).length} active payment items.
            Consider sending reminders to parents with pending payments.
          </p>
          <button className="btn-secondary mt-4">
            Send Payment Reminders
          </button>
        </div>
      )}
    </div>
  );
}
