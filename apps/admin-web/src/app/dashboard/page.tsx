import { createClient } from '@/lib/supabase/server';
import { StatCard } from '@/components/StatCard';
import { RecentActivity } from '@/components/RecentActivity';

export default async function DashboardPage() {
  const supabase = createClient();

  // Fetch stats in parallel
  const [
    { count: usersCount },
    { count: studentsCount },
    { count: classesCount },
    { data: recentFeed },
  ] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }),
    supabase.from('students').select('*', { count: 'exact', head: true }),
    supabase.from('classes').select('*', { count: 'exact', head: true }),
    supabase
      .from('feed_items')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const stats = [
    { name: 'Total Users', value: usersCount || 0, icon: '👥', color: 'blue' },
    { name: 'Students', value: studentsCount || 0, icon: '🎓', color: 'green' },
    { name: 'Classes', value: classesCount || 0, icon: '📚', color: 'purple' },
    { name: 'Announcements', value: recentFeed?.length || 0, icon: '📢', color: 'orange' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard Overview</h1>
        <p className="text-gray-600 mt-1">Welcome to your school admin dashboard</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <StatCard key={stat.name} {...stat} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentActivity items={recentFeed || []} />

        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-3">
            <a
              href="/dashboard/announcements/new"
              className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <span className="text-xl">📢</span>
              <span className="text-sm font-medium">New Announcement</span>
            </a>
            <a
              href="/dashboard/users/new"
              className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <span className="text-xl">👤</span>
              <span className="text-sm font-medium">Add User</span>
            </a>
            <a
              href="/dashboard/students/new"
              className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <span className="text-xl">🎓</span>
              <span className="text-sm font-medium">Add Student</span>
            </a>
            <a
              href="/dashboard/messages"
              className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <span className="text-xl">💬</span>
              <span className="text-sm font-medium">Send Message</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
