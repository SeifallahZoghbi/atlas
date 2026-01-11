import { createClient } from '@/lib/supabase/server';

interface DismissalRecord {
  id: string;
  student_id: string;
  date: string;
  mode: string;
  status: string;
  is_schedule_change: boolean;
  called_at: string | null;
  picked_up_at: string | null;
  students: {
    first_name: string;
    last_name: string;
    grade: string;
  };
  classes: {
    name: string;
  } | null;
}

interface ClassStats {
  class_id: string;
  class_name: string;
  total: number;
  pending: number;
  called: number;
  picked_up: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Waiting', color: 'text-gray-600', bg: 'bg-gray-100' },
  called: { label: 'Called', color: 'text-orange-600', bg: 'bg-orange-100' },
  picked_up: { label: 'Picked Up', color: 'text-green-600', bg: 'bg-green-100' },
  no_show: { label: 'No Show', color: 'text-red-600', bg: 'bg-red-100' },
  cancelled: { label: 'Cancelled', color: 'text-gray-400', bg: 'bg-gray-50' },
};

const MODE_LABELS: Record<string, string> = {
  parent_pickup: 'Parent Pickup',
  bus: 'School Bus',
  walker: 'Walker',
  after_school: 'After School',
  carpool: 'Carpool',
  other: 'Other',
};

export default async function PickupDashboardPage() {
  const supabase = createClient();
  const today = new Date().toISOString().split('T')[0];

  // Fetch today's dismissal records with student and class info
  const { data: dismissals } = await supabase
    .from('dismissal_records')
    .select(`
      *,
      students (first_name, last_name, grade),
      classes (name)
    `)
    .eq('date', today)
    .order('status')
    .order('called_at', { ascending: true, nullsFirst: true });

  // Fetch schedule changes for today
  const { data: scheduleChanges } = await supabase
    .from('dismissal_records')
    .select(`
      *,
      students (first_name, last_name, grade),
      classes (name)
    `)
    .eq('date', today)
    .eq('is_schedule_change', true)
    .order('created_at', { ascending: false });

  // Calculate overall stats
  const allRecords = dismissals || [];
  const totalStudents = allRecords.length;
  const pending = allRecords.filter((r) => r.status === 'pending').length;
  const called = allRecords.filter((r) => r.status === 'called').length;
  const pickedUp = allRecords.filter((r) => r.status === 'picked_up').length;
  const noShow = allRecords.filter((r) => r.status === 'no_show').length;

  // Calculate by mode
  const byMode = allRecords.reduce((acc, r) => {
    acc[r.mode] = (acc[r.mode] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Calculate class-level stats
  const classStatsMap = new Map<string, ClassStats>();
  allRecords.forEach((r) => {
    const classId = r.class_id || 'unassigned';
    const className = r.classes?.name || 'Unassigned';

    if (!classStatsMap.has(classId)) {
      classStatsMap.set(classId, {
        class_id: classId,
        class_name: className,
        total: 0,
        pending: 0,
        called: 0,
        picked_up: 0,
      });
    }

    const stats = classStatsMap.get(classId)!;
    stats.total++;
    if (r.status === 'pending') stats.pending++;
    if (r.status === 'called') stats.called++;
    if (r.status === 'picked_up') stats.picked_up++;
  });

  const classStats = Array.from(classStatsMap.values())
    .sort((a, b) => b.pending - a.pending);

  // Currently called students (waiting to be picked up)
  const currentlyCalled = allRecords
    .filter((r) => r.status === 'called')
    .sort((a, b) => new Date(a.called_at!).getTime() - new Date(b.called_at!).getTime());

  // Recently picked up
  const recentlyPickedUp = allRecords
    .filter((r) => r.status === 'picked_up')
    .sort((a, b) => new Date(b.picked_up_at!).getTime() - new Date(a.picked_up_at!).getTime())
    .slice(0, 10);

  const todayFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const completionRate = totalStudents > 0
    ? ((pickedUp / totalStudents) * 100).toFixed(1)
    : '0';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pickup & Dismissal</h1>
          <p className="text-gray-600 mt-1">{todayFormatted}</p>
        </div>
        <div className="flex gap-2">
          <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            Live Updates
          </span>
        </div>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="card text-center">
          <p className="text-3xl font-bold text-gray-900">{totalStudents}</p>
          <p className="text-sm text-gray-500">Total Students</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-gray-600">{pending}</p>
          <p className="text-sm text-gray-500">Waiting</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-orange-500">{called}</p>
          <p className="text-sm text-gray-500">Called</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-green-600">{pickedUp}</p>
          <p className="text-sm text-gray-500">Picked Up</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-primary-600">{completionRate}%</p>
          <p className="text-sm text-gray-500">Completed</p>
        </div>
      </div>

      {/* Dismissal Mode Breakdown */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4">Dismissal Methods Today</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Object.entries(byMode).map(([mode, count]) => (
            <div key={mode} className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">{count as number}</p>
              <p className="text-xs text-gray-500">{MODE_LABELS[mode] || mode}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Currently Called Students */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">
              Currently Called ({currentlyCalled.length})
            </h3>
            <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded-full">
              Waiting for Pickup
            </span>
          </div>

          {currentlyCalled.length === 0 ? (
            <p className="text-gray-500 text-sm py-4 text-center">
              No students currently called
            </p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {currentlyCalled.map((record) => {
                const waitTime = Math.floor(
                  (Date.now() - new Date(record.called_at!).getTime()) / 60000
                );

                return (
                  <div
                    key={record.id}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      waitTime > 10 ? 'bg-red-50' : 'bg-orange-50'
                    }`}
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {record.students.first_name} {record.students.last_name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {record.classes?.name || 'No class'} - {MODE_LABELS[record.mode]}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-medium ${waitTime > 10 ? 'text-red-600' : 'text-orange-600'}`}>
                        {waitTime} min
                      </p>
                      <p className="text-xs text-gray-500">waiting</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Class Progress */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">
              Class Progress
            </h3>
          </div>

          {classStats.length === 0 ? (
            <p className="text-gray-500 text-sm py-4 text-center">
              No dismissal data for today
            </p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {classStats.map((cls) => {
                const progress = cls.total > 0
                  ? Math.round((cls.picked_up / cls.total) * 100)
                  : 0;

                return (
                  <div key={cls.class_id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium text-gray-900">{cls.class_name}</p>
                      <span className="text-sm text-gray-600">{progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex gap-4 mt-2 text-xs text-gray-500">
                      <span>Waiting: {cls.pending}</span>
                      <span className="text-orange-600">Called: {cls.called}</span>
                      <span className="text-green-600">Done: {cls.picked_up}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Schedule Changes Alert */}
      {scheduleChanges && scheduleChanges.length > 0 && (
        <div className="card border-yellow-200">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">⚠️</span>
            <h3 className="font-semibold text-gray-900">
              Schedule Changes Today ({scheduleChanges.length})
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Student
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Class
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Dismissal Mode
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {scheduleChanges.map((record) => {
                  const config = STATUS_CONFIG[record.status] || STATUS_CONFIG.pending;

                  return (
                    <tr key={record.id} className="bg-yellow-50">
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {record.students.first_name} {record.students.last_name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {record.classes?.name || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {MODE_LABELS[record.mode] || record.mode}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full ${config.bg} ${config.color}`}>
                          {config.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recently Picked Up */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">
            Recently Picked Up
          </h3>
          <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
            Last 10
          </span>
        </div>

        {recentlyPickedUp.length === 0 ? (
          <p className="text-gray-500 text-sm py-4 text-center">
            No students picked up yet
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            {recentlyPickedUp.map((record) => (
              <div
                key={record.id}
                className="flex items-center justify-between p-3 bg-green-50 rounded-lg"
              >
                <div>
                  <p className="font-medium text-gray-900 text-sm">
                    {record.students.first_name} {record.students.last_name[0]}.
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(record.picked_up_at!).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <span className="text-green-500 text-lg">✓</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* No Show Students */}
      {noShow > 0 && (
        <div className="card border-red-200">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">🚨</span>
            <h3 className="font-semibold text-gray-900">
              No Show ({noShow})
            </h3>
          </div>

          <div className="space-y-2">
            {allRecords
              .filter((r) => r.status === 'no_show')
              .map((record) => (
                <div
                  key={record.id}
                  className="flex items-center justify-between p-3 bg-red-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {record.students.first_name} {record.students.last_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {record.classes?.name || 'No class'} - Expected: {MODE_LABELS[record.mode]}
                    </p>
                  </div>
                  <span className="text-red-600 text-sm font-medium">Not Picked Up</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
