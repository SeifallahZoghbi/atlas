-- =====================================================
-- PAYMENTS & FORMS MODULE
-- Handles school payments, digital forms, RSVPs, and signatures
-- =====================================================

-- Payment Categories (lunch, trip, supplies, tuition, etc.)
CREATE TABLE payment_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '💳',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payment Items (individual payable items)
CREATE TABLE payment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  category_id UUID REFERENCES payment_categories(id),
  title TEXT NOT NULL,
  description TEXT,
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  -- Targeting
  target_type TEXT NOT NULL CHECK (target_type IN ('school', 'grade', 'class', 'student')),
  target_id UUID, -- NULL for school-wide
  -- Scheduling
  due_date DATE,
  allow_partial_payment BOOLEAN DEFAULT false,
  min_payment_amount DECIMAL(10, 2),
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'closed', 'cancelled')),
  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payment Recipients (which students owe what)
CREATE TABLE payment_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_item_id UUID NOT NULL REFERENCES payment_items(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  amount_due DECIMAL(10, 2) NOT NULL,
  amount_paid DECIMAL(10, 2) DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'waived', 'refunded')),
  waived_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(payment_item_id, student_id)
);

-- Payment Transactions (actual payments made)
CREATE TABLE payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES payment_recipients(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  -- Payment details
  payment_method TEXT NOT NULL CHECK (payment_method IN ('card', 'bank', 'cash', 'check', 'other')),
  payment_provider TEXT, -- 'stripe', 'manual', etc.
  provider_transaction_id TEXT,
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded')),
  failure_reason TEXT,
  -- Metadata
  paid_by UUID REFERENCES users(id),
  receipt_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Forms (permission slips, surveys, consent forms, etc.)
CREATE TABLE forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  form_type TEXT NOT NULL CHECK (form_type IN ('permission', 'consent', 'survey', 'registration', 'medical', 'other')),
  -- Form content (JSON schema for form fields)
  fields JSONB NOT NULL DEFAULT '[]',
  -- Targeting
  target_type TEXT NOT NULL CHECK (target_type IN ('school', 'grade', 'class', 'student')),
  target_id UUID,
  -- Settings
  requires_signature BOOLEAN DEFAULT true,
  requires_all_guardians BOOLEAN DEFAULT false,
  allow_decline BOOLEAN DEFAULT true,
  -- Scheduling
  due_date DATE,
  reminder_days INTEGER[], -- Days before due date to send reminders
  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed', 'cancelled')),
  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Form Recipients (which students/parents need to complete the form)
CREATE TABLE form_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'viewed', 'completed', 'declined', 'expired')),
  viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(form_id, student_id)
);

-- Form Responses (completed form submissions)
CREATE TABLE form_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES form_recipients(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  -- Response data
  responses JSONB NOT NULL DEFAULT '{}',
  decision TEXT CHECK (decision IN ('approved', 'declined', 'partial')),
  decline_reason TEXT,
  -- Signature
  signature_data TEXT, -- Base64 encoded signature image
  signature_name TEXT, -- Typed name for signature
  signed_by UUID REFERENCES users(id),
  signed_at TIMESTAMPTZ,
  -- Metadata
  ip_address TEXT,
  user_agent TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Events with RSVP (field trips, meetings, events)
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('field_trip', 'meeting', 'performance', 'sports', 'fundraiser', 'other')),
  -- Location & Time
  location TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  -- RSVP Settings
  requires_rsvp BOOLEAN DEFAULT true,
  rsvp_deadline TIMESTAMPTZ,
  max_attendees INTEGER,
  allow_guests BOOLEAN DEFAULT false,
  max_guests_per_family INTEGER DEFAULT 2,
  -- Cost (if any)
  cost_per_student DECIMAL(10, 2) DEFAULT 0,
  cost_per_guest DECIMAL(10, 2) DEFAULT 0,
  payment_item_id UUID REFERENCES payment_items(id),
  -- Requirements
  permission_form_id UUID REFERENCES forms(id),
  -- Targeting
  target_type TEXT NOT NULL CHECK (target_type IN ('school', 'grade', 'class', 'student')),
  target_id UUID,
  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Event RSVPs
CREATE TABLE event_rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  responded_by UUID NOT NULL REFERENCES users(id),
  -- Response
  response TEXT NOT NULL CHECK (response IN ('yes', 'no', 'maybe')),
  num_guests INTEGER DEFAULT 0,
  guest_names TEXT[],
  notes TEXT,
  -- Status
  payment_status TEXT DEFAULT 'not_required' CHECK (payment_status IN ('not_required', 'pending', 'paid')),
  permission_status TEXT DEFAULT 'not_required' CHECK (permission_status IN ('not_required', 'pending', 'signed')),
  -- Metadata
  responded_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, student_id)
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX idx_payment_items_school ON payment_items(school_id);
CREATE INDEX idx_payment_items_status ON payment_items(status);
CREATE INDEX idx_payment_items_due_date ON payment_items(due_date);
CREATE INDEX idx_payment_recipients_student ON payment_recipients(student_id);
CREATE INDEX idx_payment_recipients_status ON payment_recipients(status);
CREATE INDEX idx_payment_transactions_recipient ON payment_transactions(recipient_id);
CREATE INDEX idx_payment_transactions_status ON payment_transactions(status);

CREATE INDEX idx_forms_school ON forms(school_id);
CREATE INDEX idx_forms_status ON forms(status);
CREATE INDEX idx_forms_due_date ON forms(due_date);
CREATE INDEX idx_form_recipients_student ON form_recipients(student_id);
CREATE INDEX idx_form_recipients_status ON form_recipients(status);
CREATE INDEX idx_form_responses_form ON form_responses(form_id);

CREATE INDEX idx_events_school ON events(school_id);
CREATE INDEX idx_events_start_time ON events(start_time);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_event_rsvps_event ON event_rsvps(event_id);
CREATE INDEX idx_event_rsvps_student ON event_rsvps(student_id);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE payment_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_rsvps ENABLE ROW LEVEL SECURITY;

-- Payment Categories: Admin/teachers can manage, all can view
CREATE POLICY payment_categories_view ON payment_categories
  FOR SELECT USING (school_id = get_user_school_id());

CREATE POLICY payment_categories_manage ON payment_categories
  FOR ALL USING (
    school_id = get_user_school_id() AND
    get_user_role() IN ('admin', 'teacher')
  );

-- Payment Items: Admin can manage, parents can view their students' items
CREATE POLICY payment_items_admin ON payment_items
  FOR ALL USING (
    school_id = get_user_school_id() AND
    get_user_role() IN ('admin', 'teacher')
  );

CREATE POLICY payment_items_parent_view ON payment_items
  FOR SELECT USING (
    school_id = get_user_school_id() AND
    status = 'active'
  );

-- Payment Recipients: Parents see their own students
CREATE POLICY payment_recipients_admin ON payment_recipients
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM payment_items pi
      WHERE pi.id = payment_item_id
      AND pi.school_id = get_user_school_id()
      AND get_user_role() IN ('admin', 'teacher')
    )
  );

CREATE POLICY payment_recipients_parent ON payment_recipients
  FOR SELECT USING (
    student_id IN (
      SELECT student_id FROM student_guardians WHERE user_id = auth.uid()
    )
  );

-- Payment Transactions: Parents can create and view their own
CREATE POLICY payment_transactions_admin ON payment_transactions
  FOR ALL USING (
    school_id = get_user_school_id() AND
    get_user_role() IN ('admin', 'teacher')
  );

CREATE POLICY payment_transactions_parent ON payment_transactions
  FOR SELECT USING (
    paid_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM payment_recipients pr
      JOIN student_guardians sg ON sg.student_id = pr.student_id
      WHERE pr.id = recipient_id AND sg.user_id = auth.uid()
    )
  );

CREATE POLICY payment_transactions_parent_insert ON payment_transactions
  FOR INSERT WITH CHECK (
    paid_by = auth.uid()
  );

-- Forms: Admin can manage, parents can view assigned forms
CREATE POLICY forms_admin ON forms
  FOR ALL USING (
    school_id = get_user_school_id() AND
    get_user_role() IN ('admin', 'teacher')
  );

CREATE POLICY forms_parent_view ON forms
  FOR SELECT USING (
    school_id = get_user_school_id() AND
    status = 'active'
  );

-- Form Recipients: Parents see their students' forms
CREATE POLICY form_recipients_admin ON form_recipients
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM forms f
      WHERE f.id = form_id
      AND f.school_id = get_user_school_id()
      AND get_user_role() IN ('admin', 'teacher')
    )
  );

CREATE POLICY form_recipients_parent ON form_recipients
  FOR SELECT USING (
    student_id IN (
      SELECT student_id FROM student_guardians WHERE user_id = auth.uid()
    )
  );

CREATE POLICY form_recipients_parent_update ON form_recipients
  FOR UPDATE USING (
    student_id IN (
      SELECT student_id FROM student_guardians WHERE user_id = auth.uid()
    )
  );

-- Form Responses: Parents can submit and view their own
CREATE POLICY form_responses_admin ON form_responses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM forms f
      WHERE f.id = form_id
      AND f.school_id = get_user_school_id()
      AND get_user_role() IN ('admin', 'teacher')
    )
  );

CREATE POLICY form_responses_parent ON form_responses
  FOR SELECT USING (
    signed_by = auth.uid() OR
    student_id IN (
      SELECT student_id FROM student_guardians WHERE user_id = auth.uid()
    )
  );

CREATE POLICY form_responses_parent_insert ON form_responses
  FOR INSERT WITH CHECK (
    signed_by = auth.uid() AND
    student_id IN (
      SELECT student_id FROM student_guardians WHERE user_id = auth.uid()
    )
  );

-- Events: Admin can manage, all can view published
CREATE POLICY events_admin ON events
  FOR ALL USING (
    school_id = get_user_school_id() AND
    get_user_role() IN ('admin', 'teacher')
  );

CREATE POLICY events_view ON events
  FOR SELECT USING (
    school_id = get_user_school_id() AND
    status = 'published'
  );

-- Event RSVPs: Parents can manage their own
CREATE POLICY event_rsvps_admin ON event_rsvps
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_id
      AND e.school_id = get_user_school_id()
      AND get_user_role() IN ('admin', 'teacher')
    )
  );

CREATE POLICY event_rsvps_parent ON event_rsvps
  FOR ALL USING (
    responded_by = auth.uid() OR
    student_id IN (
      SELECT student_id FROM student_guardians WHERE user_id = auth.uid()
    )
  );

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

-- Update payment recipient status based on amount paid
CREATE OR REPLACE FUNCTION update_payment_recipient_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' THEN
    -- Update the recipient's amount paid
    UPDATE payment_recipients
    SET
      amount_paid = amount_paid + NEW.amount,
      status = CASE
        WHEN amount_paid + NEW.amount >= amount_due THEN 'paid'
        WHEN amount_paid + NEW.amount > 0 THEN 'partial'
        ELSE status
      END,
      updated_at = NOW()
    WHERE id = NEW.recipient_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_payment_completed
  AFTER INSERT OR UPDATE ON payment_transactions
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION update_payment_recipient_status();

-- Create feed item for new payment due
CREATE OR REPLACE FUNCTION create_payment_feed_item()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO feed_items (
    school_id,
    type,
    title,
    body,
    priority,
    target_type,
    target_id,
    author_id,
    metadata
  )
  SELECT
    NEW.school_id,
    'payment',
    NEW.title,
    COALESCE(NEW.description, 'New payment request'),
    'normal',
    NEW.target_type,
    NEW.target_id,
    NEW.created_by,
    jsonb_build_object(
      'payment_item_id', NEW.id,
      'amount', NEW.amount,
      'due_date', NEW.due_date
    )
  WHERE NEW.status = 'active';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_payment_item_created
  AFTER INSERT ON payment_items
  FOR EACH ROW
  EXECUTE FUNCTION create_payment_feed_item();

-- Create feed item for new form
CREATE OR REPLACE FUNCTION create_form_feed_item()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO feed_items (
    school_id,
    type,
    title,
    body,
    priority,
    target_type,
    target_id,
    author_id,
    metadata
  )
  SELECT
    NEW.school_id,
    'form',
    NEW.title,
    COALESCE(NEW.description, 'Please complete this form'),
    CASE
      WHEN NEW.form_type = 'permission' THEN 'high'
      WHEN NEW.form_type = 'medical' THEN 'high'
      ELSE 'normal'
    END,
    NEW.target_type,
    NEW.target_id,
    NEW.created_by,
    jsonb_build_object(
      'form_id', NEW.id,
      'form_type', NEW.form_type,
      'requires_signature', NEW.requires_signature,
      'due_date', NEW.due_date
    )
  WHERE NEW.status = 'active';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_form_created
  AFTER INSERT OR UPDATE ON forms
  FOR EACH ROW
  WHEN (NEW.status = 'active')
  EXECUTE FUNCTION create_form_feed_item();

-- Create feed item for new event
CREATE OR REPLACE FUNCTION create_event_feed_item()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO feed_items (
    school_id,
    type,
    title,
    body,
    priority,
    target_type,
    target_id,
    author_id,
    metadata
  )
  SELECT
    NEW.school_id,
    'event',
    NEW.title,
    COALESCE(NEW.description, 'New event'),
    CASE
      WHEN NEW.event_type = 'field_trip' THEN 'high'
      ELSE 'normal'
    END,
    NEW.target_type,
    NEW.target_id,
    NEW.created_by,
    jsonb_build_object(
      'event_id', NEW.id,
      'event_type', NEW.event_type,
      'start_time', NEW.start_time,
      'location', NEW.location,
      'requires_rsvp', NEW.requires_rsvp,
      'cost_per_student', NEW.cost_per_student
    )
  WHERE NEW.status = 'published';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_event_published
  AFTER INSERT OR UPDATE ON events
  FOR EACH ROW
  WHEN (NEW.status = 'published')
  EXECUTE FUNCTION create_event_feed_item();

-- Update form recipient status when form is viewed
CREATE OR REPLACE FUNCTION mark_form_viewed()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.viewed_at IS NULL AND NEW.viewed_at IS NOT NULL THEN
    NEW.status = 'viewed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_form_viewed
  BEFORE UPDATE ON form_recipients
  FOR EACH ROW
  EXECUTE FUNCTION mark_form_viewed();
