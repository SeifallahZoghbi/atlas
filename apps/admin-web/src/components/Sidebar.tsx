'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navigation = [
  { name: 'Overview', href: '/dashboard', icon: '📊' },
  { name: 'Users', href: '/dashboard/users', icon: '👥' },
  { name: 'Students', href: '/dashboard/students', icon: '🎓' },
  { name: 'Classes', href: '/dashboard/classes', icon: '📚' },
  { name: 'Announcements', href: '/dashboard/announcements', icon: '📢' },
  { name: 'Messages', href: '/dashboard/messages', icon: '💬' },
  { name: 'Attendance', href: '/dashboard/attendance', icon: '✅' },
  { name: 'Pickup', href: '/dashboard/pickup', icon: '🚗' },
  { name: 'Buses', href: '/dashboard/buses', icon: '🚌' },
  { name: 'Payments', href: '/dashboard/payments', icon: '💳' },
  { name: 'Forms', href: '/dashboard/forms', icon: '📋' },
  { name: 'Settings', href: '/dashboard/settings', icon: '⚙️' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 hidden lg:block">
      <div className="flex h-16 items-center gap-2 px-6 border-b border-gray-200">
        <span className="text-2xl">🏫</span>
        <span className="font-bold text-lg text-primary-600">School Admin</span>
      </div>

      <nav className="p-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.name}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
