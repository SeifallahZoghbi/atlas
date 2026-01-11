import { createClient } from '@/lib/supabase/server';

export default async function MessagesPage() {
  const supabase = createClient();

  const { data: conversations } = await supabase
    .from('conversations')
    .select('*')
    .order('last_message_at', { ascending: false, nullsFirst: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
          <p className="text-gray-600 mt-1">View and manage conversations</p>
        </div>
        <button className="btn-primary">+ New Broadcast</button>
      </div>

      <div className="card">
        <div className="divide-y divide-gray-200">
          {(!conversations || conversations.length === 0) && (
            <p className="py-12 text-center text-gray-500">
              No conversations yet. Start a broadcast to communicate with parents.
            </p>
          )}
          {conversations?.map((conv) => (
            <div
              key={conv.id}
              className="flex items-center gap-4 py-4 hover:bg-gray-50 px-4 -mx-4 cursor-pointer"
            >
              <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center">
                <span className="text-xl">
                  {conv.type === 'broadcast' ? '📢' : conv.type === 'class_group' ? '👥' : '💬'}
                </span>
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-gray-900">
                  {conv.name || `${conv.type} conversation`}
                </h3>
                <p className="text-sm text-gray-500">
                  {conv.type.replace('_', ' ')} • Last active{' '}
                  {conv.last_message_at
                    ? new Date(conv.last_message_at).toLocaleDateString()
                    : 'never'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
