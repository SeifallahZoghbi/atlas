-- School Super App: Student Logistics Module
-- Pickup/Dismissal Management

-- ============================================
-- AUTHORIZED PICKUPS (extends student_guardians)
-- ============================================
CREATE TABLE authorized_pickups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    relationship TEXT NOT NULL, -- 'mother', 'father', 'grandparent', 'nanny', 'other'
    phone TEXT NOT NULL,
    email TEXT,
    photo_url TEXT,
    id_number TEXT, -- ID card number for verification
    is_primary BOOLEAN DEFAULT FALSE,
    is_emergency_contact BOOLEAN DEFAULT FALSE,
    notes TEXT,
    added_by UUID REFERENCES users(id),
    verified BOOLEAN DEFAULT FALSE,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_authorized_pickups_student ON authorized_pickups(student_id);
CREATE INDEX idx_authorized_pickups_school ON authorized_pickups(school_id);

-- ============================================
-- DISMISSAL MODES
-- ============================================
CREATE TYPE dismissal_mode AS ENUM (
    'parent_pickup',    -- Parent/guardian picks up
    'bus',              -- Takes school bus
    'walker',           -- Walks home
    'after_school',     -- Stays for after-school program
    'carpool',          -- Carpool arrangement
    'other'
);

-- ============================================
-- STUDENT DEFAULT DISMISSAL SETTINGS
-- ============================================
CREATE TABLE student_dismissal_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    default_mode dismissal_mode NOT NULL DEFAULT 'parent_pickup',
    bus_route_id UUID, -- Reference to bus routes if applicable
    carpool_group TEXT,
    after_school_program TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id)
);

CREATE INDEX idx_dismissal_settings_student ON student_dismissal_settings(student_id);

-- ============================================
-- DAILY DISMISSAL RECORDS
-- ============================================
CREATE TYPE dismissal_status AS ENUM (
    'pending',          -- Waiting for dismissal
    'called',           -- Student called to pickup area
    'picked_up',        -- Successfully picked up
    'no_show',          -- Pickup person didn't arrive
    'cancelled'         -- Pickup cancelled
);

CREATE TABLE dismissal_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Dismissal details
    mode dismissal_mode NOT NULL,
    status dismissal_status NOT NULL DEFAULT 'pending',

    -- Pickup info (when mode = parent_pickup or carpool)
    pickup_person_id UUID REFERENCES authorized_pickups(id),
    pickup_person_name TEXT,
    pickup_vehicle_info TEXT, -- "Red Toyota Camry - ABC123"

    -- Timestamps
    expected_time TIME,
    called_at TIMESTAMPTZ,
    picked_up_at TIMESTAMPTZ,

    -- Staff handling
    called_by UUID REFERENCES users(id),
    released_by UUID REFERENCES users(id),

    -- Notes and changes
    notes TEXT,
    is_schedule_change BOOLEAN DEFAULT FALSE,
    change_reason TEXT,
    parent_notified BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, date)
);

CREATE INDEX idx_dismissal_records_date ON dismissal_records(date DESC);
CREATE INDEX idx_dismissal_records_student ON dismissal_records(student_id);
CREATE INDEX idx_dismissal_records_status ON dismissal_records(status);

-- ============================================
-- PICKUP REQUESTS (Parent-initiated changes)
-- ============================================
CREATE TYPE pickup_request_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'completed'
);

CREATE TABLE pickup_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL REFERENCES users(id),
    date DATE NOT NULL,

    -- Request details
    request_type TEXT NOT NULL, -- 'early_pickup', 'different_person', 'mode_change'
    new_mode dismissal_mode,
    pickup_person_id UUID REFERENCES authorized_pickups(id),
    new_pickup_person_name TEXT,
    new_pickup_person_phone TEXT,
    pickup_time TIME,
    reason TEXT,

    -- Status
    status pickup_request_status DEFAULT 'pending',
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pickup_requests_student ON pickup_requests(student_id);
CREATE INDEX idx_pickup_requests_date ON pickup_requests(date);
CREATE INDEX idx_pickup_requests_status ON pickup_requests(status);

-- ============================================
-- PICKUP QUEUE (Real-time pickup line)
-- ============================================
CREATE TABLE pickup_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Vehicle/Person info
    vehicle_tag TEXT, -- Car tag number for drive-through pickup
    pickup_person_name TEXT NOT NULL,
    pickup_person_phone TEXT,

    -- Students being picked up
    student_ids UUID[] NOT NULL,

    -- Queue status
    queue_position INTEGER,
    arrived_at TIMESTAMPTZ DEFAULT NOW(),
    called_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    -- Staff
    processed_by UUID REFERENCES users(id),

    notes TEXT
);

CREATE INDEX idx_pickup_queue_date ON pickup_queue(date);
CREATE INDEX idx_pickup_queue_school ON pickup_queue(school_id);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-create daily dismissal records from settings
CREATE OR REPLACE FUNCTION create_daily_dismissal_records()
RETURNS void AS $$
BEGIN
    INSERT INTO dismissal_records (school_id, student_id, date, mode)
    SELECT
        s.school_id,
        s.id,
        CURRENT_DATE,
        COALESCE(ds.default_mode, 'parent_pickup')
    FROM students s
    LEFT JOIN student_dismissal_settings ds ON ds.student_id = s.id
    WHERE NOT EXISTS (
        SELECT 1 FROM dismissal_records dr
        WHERE dr.student_id = s.id AND dr.date = CURRENT_DATE
    );
END;
$$ LANGUAGE plpgsql;

-- Create feed item when pickup status changes
CREATE OR REPLACE FUNCTION notify_pickup_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'called' AND (OLD IS NULL OR OLD.status != 'called') THEN
        INSERT INTO feed_items (
            school_id,
            type,
            title,
            body,
            priority,
            target_type,
            target_id,
            metadata
        ) VALUES (
            NEW.school_id,
            'pickup',
            'Student Ready for Pickup',
            'Your child has been called to the pickup area.',
            'high',
            'student',
            NEW.student_id,
            jsonb_build_object(
                'dismissal_record_id', NEW.id,
                'status', NEW.status
            )
        );
    ELSIF NEW.status = 'picked_up' AND OLD.status != 'picked_up' THEN
        INSERT INTO feed_items (
            school_id,
            type,
            title,
            body,
            priority,
            target_type,
            target_id,
            metadata
        ) VALUES (
            NEW.school_id,
            'pickup',
            'Pickup Complete',
            COALESCE(NEW.pickup_person_name, 'Authorized person') || ' picked up your child.',
            'normal',
            'student',
            NEW.student_id,
            jsonb_build_object(
                'dismissal_record_id', NEW.id,
                'picked_up_at', NEW.picked_up_at,
                'pickup_person', NEW.pickup_person_name
            )
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER dismissal_status_notify
    AFTER INSERT OR UPDATE ON dismissal_records
    FOR EACH ROW EXECUTE FUNCTION notify_pickup_status_change();

-- Updated_at triggers
CREATE TRIGGER authorized_pickups_updated_at BEFORE UPDATE ON authorized_pickups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER student_dismissal_settings_updated_at BEFORE UPDATE ON student_dismissal_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER dismissal_records_updated_at BEFORE UPDATE ON dismissal_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER pickup_requests_updated_at BEFORE UPDATE ON pickup_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE authorized_pickups ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_dismissal_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE dismissal_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE pickup_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE pickup_queue ENABLE ROW LEVEL SECURITY;

-- Authorized Pickups
CREATE POLICY "View authorized pickups"
    ON authorized_pickups FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND (
            get_user_role() IN ('admin', 'teacher')
            OR is_guardian_of(student_id)
        )
    );

CREATE POLICY "Parents can manage own child pickups"
    ON authorized_pickups FOR ALL
    USING (
        school_id = get_user_school_id()
        AND (is_admin() OR is_guardian_of(student_id))
    );

-- Dismissal Settings
CREATE POLICY "View dismissal settings"
    ON student_dismissal_settings FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND (
            get_user_role() IN ('admin', 'teacher')
            OR is_guardian_of(student_id)
        )
    );

CREATE POLICY "Manage dismissal settings"
    ON student_dismissal_settings FOR ALL
    USING (
        school_id = get_user_school_id()
        AND (is_admin() OR is_guardian_of(student_id))
    );

-- Dismissal Records
CREATE POLICY "Staff can manage dismissal records"
    ON dismissal_records FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('admin', 'teacher')
    );

CREATE POLICY "Parents can view child dismissal"
    ON dismissal_records FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND is_guardian_of(student_id)
    );

-- Pickup Requests
CREATE POLICY "View pickup requests"
    ON pickup_requests FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND (
            get_user_role() IN ('admin', 'teacher')
            OR requested_by = auth.uid()
            OR is_guardian_of(student_id)
        )
    );

CREATE POLICY "Parents can create pickup requests"
    ON pickup_requests FOR INSERT
    WITH CHECK (
        school_id = get_user_school_id()
        AND requested_by = auth.uid()
        AND is_guardian_of(student_id)
    );

CREATE POLICY "Staff can update pickup requests"
    ON pickup_requests FOR UPDATE
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('admin', 'teacher')
    );

-- Pickup Queue
CREATE POLICY "Staff can manage pickup queue"
    ON pickup_queue FOR ALL
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('admin', 'teacher')
    );
