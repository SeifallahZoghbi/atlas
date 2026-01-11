-- School Super App: Row Level Security Policies
-- All policies enforce multi-tenant isolation via school_id

-- ============================================
-- ENABLE RLS ON ALL TABLES
-- ============================================
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_enrollments ENABLE ROW LEVEL SECURITY;

-- ============================================
-- SCHOOLS POLICIES
-- ============================================
-- Users can only see their own school
CREATE POLICY "Users can view own school"
    ON schools FOR SELECT
    USING (id = get_user_school_id());

-- Only admins can update school settings
CREATE POLICY "Admins can update school"
    ON schools FOR UPDATE
    USING (id = get_user_school_id() AND is_admin());

-- ============================================
-- USERS POLICIES
-- ============================================
-- Users can see other users in same school
CREATE POLICY "Users can view users in same school"
    ON users FOR SELECT
    USING (school_id = get_user_school_id());

-- Users can update own profile
CREATE POLICY "Users can update own profile"
    ON users FOR UPDATE
    USING (id = auth.uid());

-- Admins can insert new users
CREATE POLICY "Admins can insert users"
    ON users FOR INSERT
    WITH CHECK (school_id = get_user_school_id() AND is_admin());

-- ============================================
-- CLASSES POLICIES
-- ============================================
-- All school users can view classes
CREATE POLICY "Users can view classes in same school"
    ON classes FOR SELECT
    USING (school_id = get_user_school_id());

-- Admins can manage classes
CREATE POLICY "Admins can insert classes"
    ON classes FOR INSERT
    WITH CHECK (school_id = get_user_school_id() AND is_admin());

CREATE POLICY "Admins can update classes"
    ON classes FOR UPDATE
    USING (school_id = get_user_school_id() AND is_admin());

CREATE POLICY "Admins can delete classes"
    ON classes FOR DELETE
    USING (school_id = get_user_school_id() AND is_admin());

-- ============================================
-- STUDENTS POLICIES
-- ============================================
-- Admins and teachers see all students in school
-- Parents see only their linked students
CREATE POLICY "View students based on role"
    ON students FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND (
            get_user_role() IN ('admin', 'teacher')
            OR is_guardian_of(id)
        )
    );

-- Admins can manage students
CREATE POLICY "Admins can insert students"
    ON students FOR INSERT
    WITH CHECK (school_id = get_user_school_id() AND is_admin());

CREATE POLICY "Admins can update students"
    ON students FOR UPDATE
    USING (school_id = get_user_school_id() AND is_admin());

CREATE POLICY "Admins can delete students"
    ON students FOR DELETE
    USING (school_id = get_user_school_id() AND is_admin());

-- ============================================
-- STUDENT_GUARDIANS POLICIES
-- ============================================
-- View guardian links (admins see all, parents see own)
CREATE POLICY "View guardian links"
    ON student_guardians FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND (
            is_admin()
            OR user_id = auth.uid()
            OR get_user_role() = 'teacher'
        )
    );

-- Admins can manage guardian links
CREATE POLICY "Admins can insert guardian links"
    ON student_guardians FOR INSERT
    WITH CHECK (school_id = get_user_school_id() AND is_admin());

CREATE POLICY "Admins can update guardian links"
    ON student_guardians FOR UPDATE
    USING (school_id = get_user_school_id() AND is_admin());

CREATE POLICY "Admins can delete guardian links"
    ON student_guardians FOR DELETE
    USING (school_id = get_user_school_id() AND is_admin());

-- ============================================
-- CLASS_ENROLLMENTS POLICIES
-- ============================================
-- Teachers and admins can view enrollments
-- Parents can see their children's enrollments
CREATE POLICY "View enrollments"
    ON class_enrollments FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND (
            get_user_role() IN ('admin', 'teacher')
            OR is_guardian_of(student_id)
        )
    );

-- Admins can manage enrollments
CREATE POLICY "Admins can insert enrollments"
    ON class_enrollments FOR INSERT
    WITH CHECK (school_id = get_user_school_id() AND is_admin());

CREATE POLICY "Admins can delete enrollments"
    ON class_enrollments FOR DELETE
    USING (school_id = get_user_school_id() AND is_admin());
