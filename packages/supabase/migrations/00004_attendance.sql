-- School Super App: Attendance Module

-- ============================================
-- ATTENDANCE RECORDS
-- ============================================
CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'late', 'excused');

CREATE TABLE attendance_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status attendance_status NOT NULL DEFAULT 'present',
    check_in_time TIMESTAMPTZ,
    notes TEXT,
    reason TEXT, -- For late/absent/excused
    recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    parent_notified BOOLEAN DEFAULT FALSE,
    parent_notified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, class_id, date)
);

CREATE INDEX idx_attendance_school_id ON attendance_records(school_id);
CREATE INDEX idx_attendance_student_id ON attendance_records(student_id);
CREATE INDEX idx_attendance_class_id ON attendance_records(class_id);
CREATE INDEX idx_attendance_date ON attendance_records(date DESC);
CREATE INDEX idx_attendance_status ON attendance_records(status);

-- ============================================
-- ATTENDANCE SESSIONS (for batch attendance)
-- ============================================
CREATE TABLE attendance_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    total_students INTEGER DEFAULT 0,
    present_count INTEGER DEFAULT 0,
    absent_count INTEGER DEFAULT 0,
    late_count INTEGER DEFAULT 0,
    UNIQUE(class_id, date)
);

CREATE INDEX idx_attendance_sessions_class ON attendance_sessions(class_id);
CREATE INDEX idx_attendance_sessions_date ON attendance_sessions(date DESC);

-- ============================================
-- ATTENDANCE NOTIFICATIONS
-- ============================================
CREATE TABLE attendance_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    attendance_record_id UUID NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL, -- 'absent', 'late', 'excused'
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    read_at TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ
);

CREATE INDEX idx_attendance_notifications_recipient ON attendance_notifications(recipient_id);

-- ============================================
-- TRIGGERS
-- ============================================

-- Update session counts when attendance is recorded
CREATE OR REPLACE FUNCTION update_attendance_session_counts()
RETURNS TRIGGER AS $$
BEGIN
    -- Update or create session
    INSERT INTO attendance_sessions (school_id, class_id, date, recorded_by, total_students, present_count, absent_count, late_count)
    SELECT
        NEW.school_id,
        NEW.class_id,
        NEW.date,
        NEW.recorded_by,
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'present'),
        COUNT(*) FILTER (WHERE status = 'absent'),
        COUNT(*) FILTER (WHERE status = 'late')
    FROM attendance_records
    WHERE class_id = NEW.class_id AND date = NEW.date
    ON CONFLICT (class_id, date)
    DO UPDATE SET
        total_students = EXCLUDED.total_students,
        present_count = EXCLUDED.present_count,
        absent_count = EXCLUDED.absent_count,
        late_count = EXCLUDED.late_count,
        completed_at = CASE
            WHEN EXCLUDED.total_students = (
                SELECT COUNT(*) FROM class_enrollments WHERE class_id = NEW.class_id
            ) THEN NOW()
            ELSE NULL
        END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER attendance_update_session
    AFTER INSERT OR UPDATE ON attendance_records
    FOR EACH ROW EXECUTE FUNCTION update_attendance_session_counts();

-- Auto-create feed item for absent/late students
CREATE OR REPLACE FUNCTION create_attendance_feed_item()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status IN ('absent', 'late') AND (OLD IS NULL OR OLD.status != NEW.status) THEN
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
            'attendance',
            CASE
                WHEN NEW.status = 'absent' THEN 'Student Marked Absent'
                WHEN NEW.status = 'late' THEN 'Student Arrived Late'
            END,
            COALESCE(NEW.reason, 'No reason provided'),
            CASE WHEN NEW.status = 'absent' THEN 'high' ELSE 'normal' END,
            'student',
            NEW.student_id,
            jsonb_build_object(
                'attendance_record_id', NEW.id,
                'status', NEW.status,
                'date', NEW.date
            )
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER attendance_create_feed
    AFTER INSERT OR UPDATE ON attendance_records
    FOR EACH ROW EXECUTE FUNCTION create_attendance_feed_item();

-- Updated_at trigger
CREATE TRIGGER attendance_records_updated_at BEFORE UPDATE ON attendance_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_notifications ENABLE ROW LEVEL SECURITY;

-- Attendance Records: Teachers can manage their class, parents can view their children
CREATE POLICY "Teachers can manage class attendance"
    ON attendance_records FOR ALL
    USING (
        school_id = get_user_school_id()
        AND (
            is_admin()
            OR is_teacher_of_class(class_id)
        )
    );

CREATE POLICY "Parents can view child attendance"
    ON attendance_records FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND is_guardian_of(student_id)
    );

-- Attendance Sessions
CREATE POLICY "Staff can view sessions"
    ON attendance_sessions FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND get_user_role() IN ('admin', 'teacher')
    );

CREATE POLICY "Teachers can manage own sessions"
    ON attendance_sessions FOR ALL
    USING (
        school_id = get_user_school_id()
        AND (is_admin() OR is_teacher_of_class(class_id))
    );

-- Notifications
CREATE POLICY "Users can view own notifications"
    ON attendance_notifications FOR SELECT
    USING (recipient_id = auth.uid());

CREATE POLICY "System can create notifications"
    ON attendance_notifications FOR INSERT
    WITH CHECK (school_id = get_user_school_id());

CREATE POLICY "Users can update own notifications"
    ON attendance_notifications FOR UPDATE
    USING (recipient_id = auth.uid());
