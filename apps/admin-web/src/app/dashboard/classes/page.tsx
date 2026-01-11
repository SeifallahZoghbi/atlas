import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

export default async function ClassesPage() {
  const supabase = createClient();

  const { data: classes } = await supabase
    .from('classes')
    .select('*, teacher:users(first_name, last_name)')
    .order('grade', { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Classes</h1>
          <p className="text-gray-600 mt-1">Manage school classes</p>
        </div>
        <Link href="/dashboard/classes/new" className="btn-primary">
          + Add Class
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {classes?.length === 0 && (
          <div className="col-span-full card text-center py-12">
            <p className="text-gray-500">No classes found. Create your first class.</p>
          </div>
        )}
        {classes?.map((cls) => (
          <Link
            key={cls.id}
            href={`/dashboard/classes/${cls.id}`}
            className="card hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
                <span className="text-2xl">📚</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{cls.name}</h3>
                <p className="text-sm text-gray-500">Grade {cls.grade}</p>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Teacher</span>
                <span className="text-gray-900">
                  {cls.teacher
                    ? `${cls.teacher.first_name} ${cls.teacher.last_name}`
                    : 'Unassigned'}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
