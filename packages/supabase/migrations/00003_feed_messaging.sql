-- School Super App: Unified Feed & Messaging Schema

-- ============================================
-- FEED ITEMS
-- ============================================
CREATE TYPE feed_item_type AS ENUM (
    'announcement',
    'homework',
    'attendance',
    'pickup',
    'bus',
    'payment',
    'form',
    'emergency'
);

CREATE TYPE feed_target_type AS ENUM (
    'school',      -- visible to entire school
    'grade',       -- visible to specific grade
    'class',       -- visible to specific class
    'student'      -- visible to specific student's parents
);

CREATE TYPE feed_priority AS ENUM ('low', 'normal', 'high', 'urgent');

CREATE TABLE feed_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    type feed_item_type NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    metadata JSONB DEFAULT '{}',
    priority feed_priority DEFAULT 'normal',

    -- Targeting
    target_type feed_target_type NOT NULL DEFAULT 'school',
    target_id UUID, -- class_id, student_id, or NULL for school-wide
    target_grade TEXT, -- for grade-level targeting

    -- Authorship
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,

    -- For actionable items
    action_required BOOLEAN DEFAULT FALSE,
    action_deadline TIMESTAMPTZ
);

CREATE INDEX idx_feed_items_school_id ON feed_items(school_id);
CREATE INDEX idx_feed_items_type ON feed_items(type);
CREATE INDEX idx_feed_items_target ON feed_items(target_type, target_id);
CREATE INDEX idx_feed_items_created_at ON feed_items(created_at DESC);

-- ============================================
-- FEED ITEM RECIPIENTS (for tracking read status)
-- ============================================
CREATE TABLE feed_item_recipients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    feed_item_id UUID NOT NULL REFERENCES feed_items(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    action_completed_at TIMESTAMPTZ,
    UNIQUE(feed_item_id, user_id)
);

CREATE INDEX idx_feed_recipients_user ON feed_item_recipients(user_id);
CREATE INDEX idx_feed_recipients_item ON feed_item_recipients(feed_item_id);

-- ============================================
-- CONVERSATIONS
-- ============================================
CREATE TYPE conversation_type AS ENUM (
    'direct',       -- 1:1 teacher-parent
    'class_group',  -- class group chat
    'grade_group',  -- grade group chat
    'broadcast'     -- admin announcements
);

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    type conversation_type NOT NULL,
    name TEXT, -- for group chats
    class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_message_at TIMESTAMPTZ
);

CREATE INDEX idx_conversations_school_id ON conversations(school_id);
CREATE INDEX idx_conversations_class_id ON conversations(class_id);
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC);

-- ============================================
-- CONVERSATION PARTICIPANTS
-- ============================================
CREATE TYPE participant_role AS ENUM ('member', 'admin');

CREATE TABLE conversation_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role participant_role DEFAULT 'member',
    muted BOOLEAN DEFAULT FALSE,
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    last_read_at TIMESTAMPTZ,
    UNIQUE(conversation_id, user_id)
);

CREATE INDEX idx_participants_conversation ON conversation_participants(conversation_id);
CREATE INDEX idx_participants_user ON conversation_participants(user_id);

-- ============================================
-- MESSAGES
-- ============================================
CREATE TYPE message_type AS ENUM ('text', 'action', 'system');
CREATE TYPE action_type AS ENUM ('sign', 'pay', 'rsvp', 'acknowledge');

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Content
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',

    -- Message type
    message_type message_type DEFAULT 'text',
    action_type action_type,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    edited_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(conversation_id, created_at DESC);

-- ============================================
-- MESSAGE READS
-- ============================================
CREATE TABLE message_reads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(message_id, user_id)
);

CREATE INDEX idx_message_reads_message ON message_reads(message_id);
CREATE INDEX idx_message_reads_user ON message_reads(user_id);

-- ============================================
-- MESSAGE ACTION RESPONSES
-- ============================================
CREATE TABLE message_action_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    response JSONB NOT NULL, -- { signed: true, rsvp: 'yes', etc }
    responded_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(message_id, user_id)
);

CREATE INDEX idx_action_responses_message ON message_action_responses(message_id);

-- ============================================
-- TRIGGERS
-- ============================================

-- Update conversation last_message_at when new message is created
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations
    SET last_message_at = NEW.created_at, updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER messages_update_conversation
    AFTER INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION update_conversation_last_message();

-- Updated_at triggers for new tables
CREATE TRIGGER feed_items_updated_at BEFORE UPDATE ON feed_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- RLS POLICIES FOR FEED & MESSAGING
-- ============================================
ALTER TABLE feed_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_item_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_action_responses ENABLE ROW LEVEL SECURITY;

-- FEED ITEMS: View based on targeting
CREATE POLICY "View feed items"
    ON feed_items FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND (
            -- School-wide items visible to all
            target_type = 'school'
            -- Grade items visible to parents with students in that grade
            OR (target_type = 'grade' AND EXISTS (
                SELECT 1 FROM students s
                JOIN student_guardians sg ON sg.student_id = s.id
                WHERE sg.user_id = auth.uid() AND s.grade = feed_items.target_grade
            ))
            -- Class items visible to class teacher and parents
            OR (target_type = 'class' AND (
                is_teacher_of_class(target_id)
                OR EXISTS (
                    SELECT 1 FROM class_enrollments ce
                    JOIN student_guardians sg ON sg.student_id = ce.student_id
                    WHERE ce.class_id = feed_items.target_id AND sg.user_id = auth.uid()
                )
            ))
            -- Student items visible to guardians
            OR (target_type = 'student' AND is_guardian_of(target_id))
            -- Admins and teachers see all
            OR get_user_role() IN ('admin', 'teacher')
        )
    );

-- Teachers and admins can create feed items
CREATE POLICY "Staff can create feed items"
    ON feed_items FOR INSERT
    WITH CHECK (
        school_id = get_user_school_id()
        AND get_user_role() IN ('admin', 'teacher')
    );

-- FEED RECIPIENTS
CREATE POLICY "View own feed receipts"
    ON feed_item_recipients FOR SELECT
    USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "System can insert receipts"
    ON feed_item_recipients FOR INSERT
    WITH CHECK (school_id = get_user_school_id());

CREATE POLICY "Users can update own receipts"
    ON feed_item_recipients FOR UPDATE
    USING (user_id = auth.uid());

-- CONVERSATIONS: View if participant
CREATE POLICY "View conversations as participant"
    ON conversations FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND (
            is_admin()
            OR EXISTS (
                SELECT 1 FROM conversation_participants
                WHERE conversation_id = conversations.id AND user_id = auth.uid()
            )
        )
    );

CREATE POLICY "Staff can create conversations"
    ON conversations FOR INSERT
    WITH CHECK (
        school_id = get_user_school_id()
        AND get_user_role() IN ('admin', 'teacher')
    );

-- PARTICIPANTS
CREATE POLICY "View participants"
    ON conversation_participants FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND (
            user_id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM conversation_participants cp
                WHERE cp.conversation_id = conversation_participants.conversation_id
                AND cp.user_id = auth.uid()
            )
        )
    );

-- MESSAGES: View if in conversation
CREATE POLICY "View messages as participant"
    ON messages FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND EXISTS (
            SELECT 1 FROM conversation_participants
            WHERE conversation_id = messages.conversation_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Participants can send messages"
    ON messages FOR INSERT
    WITH CHECK (
        school_id = get_user_school_id()
        AND sender_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM conversation_participants
            WHERE conversation_id = messages.conversation_id AND user_id = auth.uid()
        )
    );

-- MESSAGE READS
CREATE POLICY "View own read receipts"
    ON message_reads FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can mark as read"
    ON message_reads FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- ACTION RESPONSES
CREATE POLICY "View action responses"
    ON message_action_responses FOR SELECT
    USING (
        school_id = get_user_school_id()
        AND (user_id = auth.uid() OR is_admin())
    );

CREATE POLICY "Users can respond to actions"
    ON message_action_responses FOR INSERT
    WITH CHECK (
        school_id = get_user_school_id()
        AND user_id = auth.uid()
    );
