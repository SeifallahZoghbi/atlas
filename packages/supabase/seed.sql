-- School Super App: Seed Data for Development
-- Run after migrations to populate test data

-- ============================================
-- TEST SCHOOL
-- ============================================
INSERT INTO schools (id, name, slug, settings) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Westview Academy', 'westview-academy', '{"timezone": "America/New_York", "language": "en"}');

-- ============================================
-- TEST CLASSES
-- ============================================
INSERT INTO classes (id, school_id, name, grade) VALUES
    ('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111', 'Class 5A', '5'),
    ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Class 5B', '5'),
    ('22222222-2222-2222-2222-222222222223', '11111111-1111-1111-1111-111111111111', 'Class 6A', '6');

-- ============================================
-- TEST STUDENTS
-- ============================================
INSERT INTO students (id, school_id, first_name, last_name, grade, class_id, student_number) VALUES
    ('33333333-3333-3333-3333-333333333331', '11111111-1111-1111-1111-111111111111', 'Emma', 'Johnson', '5', '22222222-2222-2222-2222-222222222221', 'STU001'),
    ('33333333-3333-3333-3333-333333333332', '11111111-1111-1111-1111-111111111111', 'Liam', 'Johnson', '6', '22222222-2222-2222-2222-222222222223', 'STU002'),
    ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Olivia', 'Williams', '5', '22222222-2222-2222-2222-222222222221', 'STU003'),
    ('33333333-3333-3333-3333-333333333334', '11111111-1111-1111-1111-111111111111', 'Noah', 'Brown', '5', '22222222-2222-2222-2222-222222222222', 'STU004');

-- ============================================
-- CLASS ENROLLMENTS
-- ============================================
INSERT INTO class_enrollments (school_id, class_id, student_id) VALUES
    ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221', '33333333-3333-3333-3333-333333333331'),
    ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222223', '33333333-3333-3333-3333-333333333332'),
    ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221', '33333333-3333-3333-3333-333333333333'),
    ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333334');

-- ============================================
-- NOTE: Users must be created through Supabase Auth
-- After creating auth users, run these to link profiles:
-- ============================================
/*
-- Example: After creating users via supabase auth, run:

-- Admin user
INSERT INTO users (id, school_id, email, role, first_name, last_name) VALUES
    ('<auth-user-uuid>', '11111111-1111-1111-1111-111111111111', 'admin@westview.edu', 'admin', 'Sarah', 'Admin');

-- Teacher user
INSERT INTO users (id, school_id, email, role, first_name, last_name) VALUES
    ('<auth-user-uuid>', '11111111-1111-1111-1111-111111111111', 'teacher@westview.edu', 'teacher', 'Michael', 'Teacher');

-- Parent user
INSERT INTO users (id, school_id, email, role, first_name, last_name) VALUES
    ('<auth-user-uuid>', '11111111-1111-1111-1111-111111111111', 'parent@example.com', 'parent', 'John', 'Johnson');

-- Link parent to students
INSERT INTO student_guardians (school_id, student_id, user_id, relationship, is_primary) VALUES
    ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333331', '<parent-uuid>', 'father', true),
    ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333332', '<parent-uuid>', 'father', true);

-- Assign teacher to class
UPDATE classes SET teacher_id = '<teacher-uuid>' WHERE id = '22222222-2222-2222-2222-222222222221';
*/

-- ============================================
-- SAMPLE FEED ITEMS
-- ============================================
INSERT INTO feed_items (school_id, type, title, body, priority, target_type, author_id) VALUES
    ('11111111-1111-1111-1111-111111111111', 'announcement', 'Welcome Back to School!', 'We are excited to welcome all students back for the new semester. Please check your class schedules.', 'high', 'school', NULL),
    ('11111111-1111-1111-1111-111111111111', 'announcement', 'Parent-Teacher Conference', 'Parent-teacher conferences will be held next Friday. Please sign up for a slot.', 'normal', 'school', NULL),
    ('11111111-1111-1111-1111-111111111111', 'homework', 'Math Assignment Due', 'Chapter 5 exercises are due tomorrow. Please complete problems 1-20.', 'normal', 'class', '22222222-2222-2222-2222-222222222221');

-- ============================================
-- SAMPLE CONVERSATION (will need real user IDs)
-- ============================================
INSERT INTO conversations (id, school_id, type, name, class_id) VALUES
    ('44444444-4444-4444-4444-444444444441', '11111111-1111-1111-1111-111111111111', 'class_group', 'Class 5A Parents', '22222222-2222-2222-2222-222222222221');
