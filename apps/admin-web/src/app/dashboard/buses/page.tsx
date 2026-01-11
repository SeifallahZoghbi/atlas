import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

interface BusTrip {
  id: string;
  trip_type: string;
  status: string;
  current_stop_index: number;
  students_on_board: number;
  last_location_update: string | null;
  route: {
    route_number: string;
    name: string;
  };
  bus: {
    bus_number: string;
  };
  driver: {
    first_name: string;
    last_name: string;
  };
}

interface BusRoute {
  id: string;
  route_number: string;
  name: string;
  route_type: string;
  status: string;
  estimated_duration_minutes: number | null;
  bus: {
    bus_number: string;
    color: string | null;
  } | null;
  driver: {
    first_name: string;
    last_name: string;
  } | null;
  stops_count?: number;
  students_count?: number;
}

interface BusAlert {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  message: string | null;
  resolved: boolean;
  created_at: string;
  trip: {
    route: {
      route_number: string;
    };
  } | null;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  scheduled: { bg: 'bg-gray-100', text: 'text-gray-600' },
  in_progress: { bg: 'bg-green-100', text: 'text-green-600' },
  completed: { bg: 'bg-blue-100', text: 'text-blue-600' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-600' },
};

const SEVERITY_COLORS: Record<string, string> = {
  info: 'border-blue-400 bg-blue-50',
  warning: 'border-yellow-400 bg-yellow-50',
  critical: 'border-red-400 bg-red-50',
};

export default async function BusesPage() {
  const supabase = createClient();
  const today = new Date().toISOString().split('T')[0];

  // Fetch active trips
  const { data: activeTrips } = await supabase
    .from('bus_trips')
    .select(`
      *,
      route:bus_routes (route_number, name),
      bus:buses (bus_number),
      driver:users (first_name, last_name)
    `)
    .eq('trip_date', today)
    .in('status', ['scheduled', 'in_progress'])
    .order('status', { ascending: false });

  // Fetch all routes with stats
  const { data: routes } = await supabase
    .from('bus_routes')
    .select(`
      *,
      bus:buses (bus_number, color),
      driver:users (first_name, last_name)
    `)
    .eq('status', 'active')
    .order('route_number');

  const routesWithStats = await Promise.all(
    (routes || []).map(async (route) => {
      const { count: stopsCount } = await supabase
        .from('bus_stops')
        .select('*', { count: 'exact', head: true })
        .eq('route_id', route.id)
        .eq('active', true);

      const { count: morningStudents } = await supabase
        .from('student_bus_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('morning_route_id', route.id)
        .eq('active', true);

      const { count: afternoonStudents } = await supabase
        .from('student_bus_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('afternoon_route_id', route.id)
        .eq('active', true);

      return {
        ...route,
        stops_count: stopsCount || 0,
        students_count: Math.max(morningStudents || 0, afternoonStudents || 0),
      };
    })
  );

  // Fetch buses
  const { data: buses } = await supabase
    .from('buses')
    .select('*')
    .order('bus_number');

  // Fetch recent alerts
  const { data: alerts } = await supabase
    .from('bus_alerts')
    .select(`
      *,
      trip:bus_trips (
        route:bus_routes (route_number)
      )
    `)
    .eq('resolved', false)
    .order('created_at', { ascending: false })
    .limit(5);

  // Calculate stats
  const inProgressTrips = (activeTrips || []).filter((t) => t.status === 'in_progress');
  const scheduledTrips = (activeTrips || []).filter((t) => t.status === 'scheduled');
  const totalStudentsOnBuses = inProgressTrips.reduce((sum, t) => sum + (t.students_on_board || 0), 0);

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
          <h1 className="text-2xl font-bold text-gray-900">Bus Tracking</h1>
          <p className="text-gray-600 mt-1">{todayFormatted}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/buses/routes" className="btn-secondary">
            Manage Routes
          </Link>
          <Link href="/dashboard/buses/fleet" className="btn-secondary">
            Fleet
          </Link>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card text-center">
          <p className="text-3xl font-bold text-green-600">{inProgressTrips.length}</p>
          <p className="text-sm text-gray-500">Buses Active</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-gray-600">{scheduledTrips.length}</p>
          <p className="text-sm text-gray-500">Scheduled</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-primary-600">{totalStudentsOnBuses}</p>
          <p className="text-sm text-gray-500">Students On Buses</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-gray-900">{routesWithStats.length}</p>
          <p className="text-sm text-gray-500">Active Routes</p>
        </div>
      </div>

      {/* Active Alerts */}
      {alerts && alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-4 border-l-4 rounded-r-lg ${SEVERITY_COLORS[alert.severity]}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{alert.title}</p>
                  {alert.message && (
                    <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
                  )}
                </div>
                <span className="text-sm text-gray-500">
                  {new Date(alert.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Trips */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Active Trips</h3>
            <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
              Live
            </span>
          </div>

          {(!activeTrips || activeTrips.length === 0) ? (
            <p className="text-gray-500 text-sm py-8 text-center">
              No active trips right now
            </p>
          ) : (
            <div className="space-y-3">
              {activeTrips.map((trip) => {
                const colors = STATUS_COLORS[trip.status];
                const isLive = trip.status === 'in_progress';

                return (
                  <div
                    key={trip.id}
                    className={`p-4 rounded-lg ${isLive ? 'bg-green-50 border border-green-200' : 'bg-gray-50'}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">🚌</span>
                        <div>
                          <p className="font-medium text-gray-900">
                            Route {trip.route.route_number}
                          </p>
                          <p className="text-xs text-gray-500">
                            Bus #{trip.bus.bus_number} • {trip.driver.first_name} {trip.driver.last_name}
                          </p>
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${colors.bg} ${colors.text}`}>
                        {trip.status === 'in_progress' ? 'Live' : 'Scheduled'}
                      </span>
                    </div>

                    {isLive && (
                      <div className="flex items-center justify-between text-sm mt-3 pt-3 border-t border-green-200">
                        <span className="text-gray-600">
                          Stop {trip.current_stop_index} • {trip.students_on_board} students
                        </span>
                        <span className="text-green-600">
                          {trip.last_location_update
                            ? `Updated ${Math.floor(
                                (Date.now() - new Date(trip.last_location_update).getTime()) / 60000
                              )}m ago`
                            : 'No GPS data'}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Routes Overview */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Routes</h3>
            <Link href="/dashboard/buses/routes/new" className="text-sm text-primary-600">
              + Add Route
            </Link>
          </div>

          {(!routesWithStats || routesWithStats.length === 0) ? (
            <div className="text-center py-8">
              <p className="text-4xl mb-4">🚌</p>
              <p className="text-gray-500 mb-4">No routes configured</p>
              <Link href="/dashboard/buses/routes/new" className="btn-primary">
                Create First Route
              </Link>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {routesWithStats.map((route) => (
                <div
                  key={route.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-primary-100 flex items-center justify-center">
                      <span className="text-primary-700 font-bold">{route.route_number}</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{route.name}</p>
                      <p className="text-xs text-gray-500">
                        {route.stops_count} stops • {route.students_count} students
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    {route.driver ? (
                      <p>{route.driver.first_name} {route.driver.last_name}</p>
                    ) : (
                      <p className="text-orange-500">No driver</p>
                    )}
                    {route.bus ? (
                      <p>Bus #{route.bus.bus_number}</p>
                    ) : (
                      <p className="text-orange-500">No bus</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Fleet Status */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Fleet Status</h3>
          <Link href="/dashboard/buses/fleet" className="text-sm text-primary-600">
            Manage Fleet
          </Link>
        </div>

        {(!buses || buses.length === 0) ? (
          <p className="text-gray-500 text-sm py-4 text-center">
            No buses in fleet
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {buses.map((bus) => {
              const isActive = inProgressTrips.some((t) => t.bus_id === bus.id);
              const isScheduled = scheduledTrips.some((t) => t.bus_id === bus.id);

              return (
                <div
                  key={bus.id}
                  className={`p-3 rounded-lg text-center ${
                    isActive
                      ? 'bg-green-50 border border-green-200'
                      : isScheduled
                      ? 'bg-blue-50 border border-blue-200'
                      : bus.status === 'maintenance'
                      ? 'bg-orange-50 border border-orange-200'
                      : 'bg-gray-50'
                  }`}
                >
                  <p className="text-2xl mb-1">🚌</p>
                  <p className="font-bold text-gray-900">#{bus.bus_number}</p>
                  <p className="text-xs text-gray-500">
                    {isActive
                      ? '🟢 Active'
                      : isScheduled
                      ? '🔵 Scheduled'
                      : bus.status === 'maintenance'
                      ? '🟠 Maintenance'
                      : '⚪ Available'}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
