import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

interface AttendanceSession {
  id: string;
  class_id: string;
  date: string;
  total_students: number;
  present_count: number;
  absent_count: number;
  late_count: number;
  completed_at: string | null;
  classes: {
    name: string;
    grade: string;
    teacher: {
      first_name: string;
      last_name: string;
    } | null;
  };
}

interface AbsentStudent {
  id: string;
  date: string;
  reason: string | null;
  students: {
    first_name: string;
    last_name: string;
    grade: string;
  };
  classes: {
    name: string;
  };
}

export default async function AttendancePage() {
  const supabase = createClient();
  const today = new Date().toISOString().split('T')[0];

  // Fetch today's attendance sessions
  const { data: sessions } = await supabase
    .from('attendance_sessions')
    .select(`
      *,
      classes (
        name,
        grade,
        teacher:users (first_name, last_name)
      )
    `)
    .eq('date', today)
    .order('completed_at', { ascending: true, nullsFirst: false });

  // Fetch all classes to show which haven't taken attendance
  const { data: allClasses } = await supabase
    .from('classes')
    .select('*, teacher:users(first_name, last_name)')
    .order('name');

  // Fetch today's absent students
  const { data: absentRecords } = await supabase
    .from('attendance_records')
    .select(`
      id,
      date,
      reason,
      students (first_name, last_name, grade),
      classes (name)
    `)
    .eq('date', today)
    .eq('status', 'absent')
    .order('created_at', { ascending: false });

  const absentStudents = (absentRecords || []) as unknown as AbsentStudent[];

  const sessionMap = new Map(sessions?.map((s) => [s.class_id, s]) || []);
  const classesWithoutAttendance = allClasses?.filter(
    (c) => !sessionMap.has(c.id)
  );

  // Calculate overall stats
  const totalStudents = sessions?.reduce((sum, s) => sum + s.total_students, 0) || 0;
  const totalPresent = sessions?.reduce((sum, s) => sum + s.present_count, 0) || 0;
  const totalAbsent = sessions?.reduce((sum, s) => sum + s.absent_count, 0) || 0;
  const totalLate = sessions?.reduce((sum, s) => sum + s.late_count, 0) || 0;
  const attendanceRate = totalStudents > 0 ? ((totalPresent + totalLate) / totalStudents) * 100 : 0;

  const todayFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
          <p className="text-gray-600 mt-1">{todayFormatted}</p>
        </div>
        <Link href="/dashboard/attendance/history" className="btn-secondary">
          View History
        </Link>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="card text-center">
          <p className="text-3xl font-bold text-gray-900">{totalStudents}</p>
          <p className="text-sm text-gray-500">Total Students</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-green-600">{totalPresent}</p>
          <p className="text-sm text-gray-500">Present</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-orange-500">{totalLate}</p>
          <p className="text-sm text-gray-500">Late</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-red-600">{totalAbsent}</p>
          <p className="text-sm text-gray-500">Absent</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-primary-600">
            {attendanceRate.toFixed(1)}%
          </p>
          <p className="text-sm text-gray-500">Attendance Rate</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Classes That Completed Attendance */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">
              Attendance Taken ({sessions?.length || 0})
            </h3>
            <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
              Completed
            </span>
          </div>

          {(!sessions || sessions.length === 0) ? (
            <p className="text-gray-500 text-sm py-4 text-center">
              No attendance taken yet today
            </p>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {session.classes.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {session.classes.teacher
                        ? `${session.classes.teacher.first_name} ${session.classes.teacher.last_name}`
                        : 'No teacher'}
                    </p>
                  </div>
                  <div className="flex gap-3 text-sm">
                    <span className="text-green-600">
                      ✓ {session.present_count}
                    </span>
                    <span className="text-orange-500">
                      ⏰ {session.late_count}
                    </span>
                    <span className="text-red-600">
                      ✗ {session.absent_count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Classes Missing Attendance */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">
              Pending ({classesWithoutAttendance?.length || 0})
            </h3>
            <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded-full">
              Not Started
            </span>
          </div>

          {(!classesWithoutAttendance || classesWithoutAttendance.length === 0) ? (
            <p className="text-green-600 text-sm py-4 text-center">
              All classes have taken attendance today!
            </p>
          ) : (
            <div className="space-y-3">
              {classesWithoutAttendance.map((cls) => (
                <div
                  key={cls.id}
                  className="flex items-center justify-between p-3 bg-orange-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-900">{cls.name}</p>
                    <p className="text-xs text-gray-500">
                      {cls.teacher
                        ? `${cls.teacher.first_name} ${cls.teacher.last_name}`
                        : 'No teacher assigned'}
                    </p>
                  </div>
                  <span className="text-orange-600 text-sm">Pending</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Absent Students Alert */}
      {absentStudents && absentStudents.length > 0 && (
        <div className="card border-red-200">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">🚨</span>
            <h3 className="font-semibold text-gray-900">
              Absent Students Today ({absentStudents.length})
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
                    Reason
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {absentStudents.map((record) => (
                  <tr key={record.id}>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {record.students.first_name} {record.students.last_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {record.classes.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {record.reason || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
