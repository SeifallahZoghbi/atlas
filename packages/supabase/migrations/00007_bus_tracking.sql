-- =====================================================
-- BUS TRACKING MODULE
-- Real-time bus tracking, routes, and student assignments
-- =====================================================

-- Bus fleet
CREATE TABLE buses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  bus_number TEXT NOT NULL,
  license_plate TEXT,
  capacity INTEGER DEFAULT 40,
  make TEXT,
  model TEXT,
  year INTEGER,
  color TEXT,
  -- Features
  has_wheelchair_lift BOOLEAN DEFAULT false,
  has_ac BOOLEAN DEFAULT true,
  has_gps BOOLEAN DEFAULT true,
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'retired')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(school_id, bus_number)
);

-- Bus routes
CREATE TABLE bus_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  route_number TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  route_type TEXT NOT NULL CHECK (route_type IN ('morning', 'afternoon', 'both', 'field_trip', 'activity')),
  -- Assigned bus and driver
  bus_id UUID REFERENCES buses(id),
  driver_id UUID REFERENCES users(id),
  -- Timing
  estimated_duration_minutes INTEGER,
  start_time TIME,
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(school_id, route_number)
);

-- Bus stops on a route
CREATE TABLE bus_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  route_id UUID NOT NULL REFERENCES bus_routes(id) ON DELETE CASCADE,
  stop_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  -- Location
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  -- Timing
  scheduled_time TIME,
  estimated_wait_minutes INTEGER DEFAULT 2,
  -- Type
  stop_type TEXT DEFAULT 'regular' CHECK (stop_type IN ('regular', 'school', 'transfer')),
  -- Status
  active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(route_id, stop_number)
);

-- Student bus assignments
CREATE TABLE student_bus_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  -- Morning route
  morning_route_id UUID REFERENCES bus_routes(id),
  morning_stop_id UUID REFERENCES bus_stops(id),
  -- Afternoon route
  afternoon_route_id UUID REFERENCES bus_routes(id),
  afternoon_stop_id UUID REFERENCES bus_stops(id),
  -- Settings
  needs_wheelchair_lift BOOLEAN DEFAULT false,
  guardian_phone TEXT, -- For SMS alerts
  notes TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id)
);

-- Active bus trips (daily tracking)
CREATE TABLE bus_trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  route_id UUID NOT NULL REFERENCES bus_routes(id) ON DELETE CASCADE,
  bus_id UUID NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trip_date DATE NOT NULL,
  trip_type TEXT NOT NULL CHECK (trip_type IN ('morning', 'afternoon', 'field_trip', 'activity')),
  -- Status
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  -- Timing
  scheduled_start TIME,
  actual_start TIMESTAMPTZ,
  actual_end TIMESTAMPTZ,
  -- Current location
  current_latitude DECIMAL(10, 8),
  current_longitude DECIMAL(11, 8),
  current_speed DECIMAL(5, 2), -- mph
  current_heading DECIMAL(5, 2), -- degrees
  last_location_update TIMESTAMPTZ,
  -- Stats
  current_stop_index INTEGER DEFAULT 0,
  students_on_board INTEGER DEFAULT 0,
  -- Notes
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(route_id, trip_date, trip_type)
);

-- Bus location history (for tracking path)
CREATE TABLE bus_location_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES bus_trips(id) ON DELETE CASCADE,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  speed DECIMAL(5, 2),
  heading DECIMAL(5, 2),
  accuracy DECIMAL(6, 2), -- meters
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stop arrivals/departures
CREATE TABLE bus_stop_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES bus_trips(id) ON DELETE CASCADE,
  stop_id UUID NOT NULL REFERENCES bus_stops(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('arrived', 'departed', 'skipped')),
  scheduled_time TIME,
  actual_time TIMESTAMPTZ DEFAULT NOW(),
  students_boarded INTEGER DEFAULT 0,
  students_exited INTEGER DEFAULT 0,
  notes TEXT
);

-- Student scan events (boarding/exiting)
CREATE TABLE student_bus_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES bus_trips(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  stop_id UUID REFERENCES bus_stops(id),
  scan_type TEXT NOT NULL CHECK (scan_type IN ('board', 'exit')),
  scanned_at TIMESTAMPTZ DEFAULT NOW(),
  -- Parent notification
  parent_notified BOOLEAN DEFAULT false,
  notification_sent_at TIMESTAMPTZ
);

-- Bus alerts/incidents
CREATE TABLE bus_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  trip_id UUID REFERENCES bus_trips(id),
  route_id UUID REFERENCES bus_routes(id),
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'delay', 'breakdown', 'accident', 'route_change',
    'weather', 'emergency', 'student_incident', 'other'
  )),
  severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  message TEXT,
  -- Resolution
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id),
  resolution_notes TEXT,
  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX idx_buses_school ON buses(school_id);
CREATE INDEX idx_bus_routes_school ON bus_routes(school_id);
CREATE INDEX idx_bus_routes_driver ON bus_routes(driver_id);
CREATE INDEX idx_bus_stops_route ON bus_stops(route_id);
CREATE INDEX idx_student_bus_assignments_student ON student_bus_assignments(student_id);
CREATE INDEX idx_student_bus_assignments_morning_route ON student_bus_assignments(morning_route_id);
CREATE INDEX idx_student_bus_assignments_afternoon_route ON student_bus_assignments(afternoon_route_id);
CREATE INDEX idx_bus_trips_route_date ON bus_trips(route_id, trip_date);
CREATE INDEX idx_bus_trips_status ON bus_trips(status);
CREATE INDEX idx_bus_trips_driver ON bus_trips(driver_id);
CREATE INDEX idx_bus_location_history_trip ON bus_location_history(trip_id);
CREATE INDEX idx_bus_location_history_time ON bus_location_history(recorded_at);
CREATE INDEX idx_bus_stop_events_trip ON bus_stop_events(trip_id);
CREATE INDEX idx_student_bus_scans_trip ON student_bus_scans(trip_id);
CREATE INDEX idx_student_bus_scans_student ON student_bus_scans(student_id);
CREATE INDEX idx_bus_alerts_school ON bus_alerts(school_id);
CREATE INDEX idx_bus_alerts_trip ON bus_alerts(trip_id);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE buses ENABLE ROW LEVEL SECURITY;
ALTER TABLE bus_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bus_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_bus_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE bus_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE bus_location_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE bus_stop_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_bus_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE bus_alerts ENABLE ROW LEVEL SECURITY;

-- Buses: Admin/drivers can manage
CREATE POLICY buses_admin ON buses
  FOR ALL USING (
    school_id = get_user_school_id() AND
    get_user_role() IN ('admin', 'driver')
  );

CREATE POLICY buses_view ON buses
  FOR SELECT USING (school_id = get_user_school_id());

-- Bus Routes: Admin can manage, all can view
CREATE POLICY bus_routes_admin ON bus_routes
  FOR ALL USING (
    school_id = get_user_school_id() AND
    get_user_role() = 'admin'
  );

CREATE POLICY bus_routes_driver ON bus_routes
  FOR SELECT USING (
    school_id = get_user_school_id() AND
    (driver_id = auth.uid() OR get_user_role() IN ('admin', 'teacher'))
  );

CREATE POLICY bus_routes_parent ON bus_routes
  FOR SELECT USING (
    school_id = get_user_school_id()
  );

-- Bus Stops: All can view within school
CREATE POLICY bus_stops_view ON bus_stops
  FOR SELECT USING (school_id = get_user_school_id());

CREATE POLICY bus_stops_admin ON bus_stops
  FOR ALL USING (
    school_id = get_user_school_id() AND
    get_user_role() = 'admin'
  );

-- Student Bus Assignments: Parents see their students
CREATE POLICY student_bus_assignments_admin ON student_bus_assignments
  FOR ALL USING (
    school_id = get_user_school_id() AND
    get_user_role() IN ('admin', 'driver')
  );

CREATE POLICY student_bus_assignments_parent ON student_bus_assignments
  FOR SELECT USING (
    student_id IN (
      SELECT student_id FROM student_guardians WHERE user_id = auth.uid()
    )
  );

-- Bus Trips: Drivers can manage their trips
CREATE POLICY bus_trips_driver ON bus_trips
  FOR ALL USING (
    school_id = get_user_school_id() AND
    (driver_id = auth.uid() OR get_user_role() = 'admin')
  );

CREATE POLICY bus_trips_view ON bus_trips
  FOR SELECT USING (school_id = get_user_school_id());

-- Bus Location History: Same as trips
CREATE POLICY bus_location_history_driver ON bus_location_history
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM bus_trips bt
      WHERE bt.id = trip_id
      AND (bt.driver_id = auth.uid() OR get_user_role() = 'admin')
    )
  );

CREATE POLICY bus_location_history_view ON bus_location_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM bus_trips bt
      WHERE bt.id = trip_id
      AND bt.school_id = get_user_school_id()
    )
  );

-- Bus Stop Events
CREATE POLICY bus_stop_events_driver ON bus_stop_events
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM bus_trips bt
      WHERE bt.id = trip_id
      AND (bt.driver_id = auth.uid() OR get_user_role() = 'admin')
    )
  );

CREATE POLICY bus_stop_events_view ON bus_stop_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM bus_trips bt
      WHERE bt.id = trip_id
      AND bt.school_id = get_user_school_id()
    )
  );

-- Student Bus Scans
CREATE POLICY student_bus_scans_driver ON student_bus_scans
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM bus_trips bt
      WHERE bt.id = trip_id
      AND (bt.driver_id = auth.uid() OR get_user_role() = 'admin')
    )
  );

CREATE POLICY student_bus_scans_parent ON student_bus_scans
  FOR SELECT USING (
    student_id IN (
      SELECT student_id FROM student_guardians WHERE user_id = auth.uid()
    )
  );

-- Bus Alerts
CREATE POLICY bus_alerts_manage ON bus_alerts
  FOR ALL USING (
    school_id = get_user_school_id() AND
    get_user_role() IN ('admin', 'driver')
  );

CREATE POLICY bus_alerts_view ON bus_alerts
  FOR SELECT USING (school_id = get_user_school_id());

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

-- Create feed item when bus starts/delayed
CREATE OR REPLACE FUNCTION create_bus_feed_item()
RETURNS TRIGGER AS $$
BEGIN
  -- Create feed item for trip start
  IF NEW.status = 'in_progress' AND (OLD.status IS NULL OR OLD.status = 'scheduled') THEN
    INSERT INTO feed_items (
      school_id,
      type,
      title,
      body,
      priority,
      target_type,
      metadata
    )
    SELECT
      NEW.school_id,
      'bus',
      'Bus ' || b.bus_number || ' is on the way',
      'Route ' || r.route_number || ' (' || r.name || ') has started',
      'normal',
      'school',
      jsonb_build_object(
        'trip_id', NEW.id,
        'route_id', NEW.route_id,
        'bus_id', NEW.bus_id,
        'trip_type', NEW.trip_type
      )
    FROM bus_routes r
    JOIN buses b ON b.id = NEW.bus_id
    WHERE r.id = NEW.route_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_bus_trip_status_change
  AFTER INSERT OR UPDATE ON bus_trips
  FOR EACH ROW
  EXECUTE FUNCTION create_bus_feed_item();

-- Create feed item for bus alerts
CREATE OR REPLACE FUNCTION create_bus_alert_feed_item()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO feed_items (
    school_id,
    type,
    title,
    body,
    priority,
    target_type,
    metadata
  )
  VALUES (
    NEW.school_id,
    'bus',
    NEW.title,
    NEW.message,
    CASE
      WHEN NEW.severity = 'critical' THEN 'urgent'
      WHEN NEW.severity = 'warning' THEN 'high'
      ELSE 'normal'
    END,
    'school',
    jsonb_build_object(
      'alert_id', NEW.id,
      'alert_type', NEW.alert_type,
      'severity', NEW.severity,
      'trip_id', NEW.trip_id
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_bus_alert_created
  AFTER INSERT ON bus_alerts
  FOR EACH ROW
  EXECUTE FUNCTION create_bus_alert_feed_item();

-- Update trip student count on scan
CREATE OR REPLACE FUNCTION update_trip_student_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE bus_trips
  SET students_on_board = (
    SELECT
      COALESCE(SUM(CASE WHEN scan_type = 'board' THEN 1 ELSE -1 END), 0)
    FROM student_bus_scans
    WHERE trip_id = NEW.trip_id
  )
  WHERE id = NEW.trip_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_student_scan
  AFTER INSERT ON student_bus_scans
  FOR EACH ROW
  EXECUTE FUNCTION update_trip_student_count();
