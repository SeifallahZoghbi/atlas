interface FeedItem {
  id: string;
  type: string;
  title: string;
  created_at: string;
  priority: string;
}

const typeIcons: Record<string, string> = {
  announcement: '📢',
  homework: '📚',
  attendance: '✅',
  pickup: '🚗',
  bus: '🚌',
  payment: '💳',
  form: '📝',
  emergency: '🚨',
};

function formatDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString();
}

export function RecentActivity({ items }: { items: FeedItem[] }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Recent Activity</h3>
        <a
          href="/dashboard/announcements"
          className="text-sm text-primary-600 hover:text-primary-700"
        >
          View all
        </a>
      </div>

      {items.length === 0 ? (
        <p className="text-gray-500 text-sm py-4 text-center">No recent activity</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <span className="text-xl">{typeIcons[item.type] || '📄'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {item.title}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {item.type.charAt(0).toUpperCase() + item.type.slice(1)} •{' '}
                  {formatDate(item.created_at)}
                </p>
              </div>
              {item.priority === 'urgent' && (
                <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded">
                  Urgent
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
