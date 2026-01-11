// Types for the School Super App

export type UserRole = 'parent' | 'teacher' | 'admin' | 'driver';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
export type DismissalMode = 'parent_pickup' | 'bus' | 'walker' | 'after_school' | 'carpool' | 'other';
export type DismissalStatus = 'pending' | 'called' | 'picked_up' | 'no_show' | 'cancelled';
export type PickupRequestStatus = 'pending' | 'approved' | 'rejected' | 'completed';

export interface User {
  id: string;
  school_id: string;
  email: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  phone?: string;
  avatar_url?: string;
}

export interface Student {
  id: string;
  school_id: string;
  first_name: string;
  last_name: string;
  grade: string;
  class_id?: string;
  avatar_url?: string;
}

export interface Class {
  id: string;
  school_id: string;
  name: string;
  grade: string;
  teacher_id?: string;
}

export interface FeedItem {
  id: string;
  school_id: string;
  type: 'announcement' | 'homework' | 'attendance' | 'pickup' | 'bus' | 'payment' | 'form' | 'emergency';
  title: string;
  body?: string;
  metadata: Record<string, unknown>;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  target_type: 'school' | 'grade' | 'class' | 'student';
  target_id?: string;
  author_id?: string;
  created_at: string;
  expires_at?: string;
  action_required: boolean;
  author?: User;
}

export interface Conversation {
  id: string;
  school_id: string;
  type: 'direct' | 'class_group' | 'grade_group' | 'broadcast';
  name?: string;
  class_id?: string;
  created_at: string;
  last_message_at?: string;
  last_message?: Message;
  unread_count?: number;
}

export interface Message {
  id: string;
  school_id: string;
  conversation_id: string;
  sender_id?: string;
  content: string;
  metadata: Record<string, unknown>;
  message_type: 'text' | 'action' | 'system';
  action_type?: 'sign' | 'pay' | 'rsvp' | 'acknowledge';
  created_at: string;
  sender?: User;
}

export interface AttendanceRecord {
  id: string;
  school_id: string;
  student_id: string;
  class_id: string;
  date: string;
  status: AttendanceStatus;
  check_in_time?: string;
  notes?: string;
  reason?: string;
  recorded_by?: string;
  parent_notified: boolean;
  created_at: string;
  student?: Student;
}

export interface AttendanceSession {
  id: string;
  school_id: string;
  class_id: string;
  date: string;
  started_at: string;
  completed_at?: string;
  total_students: number;
  present_count: number;
  absent_count: number;
  late_count: number;
}

export interface ClassWithStudents extends Class {
  students: Student[];
  attendance?: AttendanceRecord[];
}

// Student Logistics Types
export interface AuthorizedPickup {
  id: string;
  school_id: string;
  student_id: string;
  name: string;
  relationship: string;
  phone: string;
  email?: string;
  photo_url?: string;
  id_number?: string;
  is_primary: boolean;
  is_emergency_contact: boolean;
  notes?: string;
  verified: boolean;
  active: boolean;
}

export interface DismissalSettings {
  id: string;
  school_id: string;
  student_id: string;
  default_mode: DismissalMode;
  bus_route_id?: string;
  carpool_group?: string;
  after_school_program?: string;
  notes?: string;
}

export interface DismissalRecord {
  id: string;
  school_id: string;
  student_id: string;
  date: string;
  mode: DismissalMode;
  status: DismissalStatus;
  pickup_person_id?: string;
  pickup_person_name?: string;
  pickup_vehicle_info?: string;
  expected_time?: string;
  called_at?: string;
  picked_up_at?: string;
  notes?: string;
  is_schedule_change: boolean;
  student?: Student;
  pickup_person?: AuthorizedPickup;
}

export interface PickupRequest {
  id: string;
  school_id: string;
  student_id: string;
  requested_by: string;
  date: string;
  request_type: 'early_pickup' | 'different_person' | 'mode_change';
  new_mode?: DismissalMode;
  pickup_person_id?: string;
  new_pickup_person_name?: string;
  new_pickup_person_phone?: string;
  pickup_time?: string;
  reason?: string;
  status: PickupRequestStatus;
  reviewed_by?: string;
  reviewed_at?: string;
  rejection_reason?: string;
  student?: Student;
}

// Payments & Forms Types
export type PaymentStatus = 'pending' | 'partial' | 'paid' | 'waived' | 'refunded';
export type TransactionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
export type PaymentMethod = 'card' | 'bank' | 'cash' | 'check' | 'other';
export type FormType = 'permission' | 'consent' | 'survey' | 'registration' | 'medical' | 'other';
export type FormStatus = 'pending' | 'viewed' | 'completed' | 'declined' | 'expired';
export type EventType = 'field_trip' | 'meeting' | 'performance' | 'sports' | 'fundraiser' | 'other';
export type RsvpResponse = 'yes' | 'no' | 'maybe';

export interface PaymentCategory {
  id: string;
  school_id: string;
  name: string;
  description?: string;
  icon: string;
  active: boolean;
}

export interface PaymentItem {
  id: string;
  school_id: string;
  category_id?: string;
  title: string;
  description?: string;
  amount: number;
  currency: string;
  target_type: 'school' | 'grade' | 'class' | 'student';
  target_id?: string;
  due_date?: string;
  allow_partial_payment: boolean;
  min_payment_amount?: number;
  status: 'draft' | 'active' | 'closed' | 'cancelled';
  created_by?: string;
  created_at: string;
  category?: PaymentCategory;
}

export interface PaymentRecipient {
  id: string;
  payment_item_id: string;
  student_id: string;
  amount_due: number;
  amount_paid: number;
  status: PaymentStatus;
  waived_reason?: string;
  payment_item?: PaymentItem;
  student?: Student;
}

export interface PaymentTransaction {
  id: string;
  school_id: string;
  recipient_id: string;
  amount: number;
  currency: string;
  payment_method: PaymentMethod;
  payment_provider?: string;
  provider_transaction_id?: string;
  status: TransactionStatus;
  failure_reason?: string;
  paid_by?: string;
  receipt_url?: string;
  notes?: string;
  created_at: string;
  completed_at?: string;
}

export interface FormField {
  id: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'date' | 'signature';
  label: string;
  required: boolean;
  options?: string[];
  placeholder?: string;
}

export interface Form {
  id: string;
  school_id: string;
  title: string;
  description?: string;
  form_type: FormType;
  fields: FormField[];
  target_type: 'school' | 'grade' | 'class' | 'student';
  target_id?: string;
  requires_signature: boolean;
  requires_all_guardians: boolean;
  allow_decline: boolean;
  due_date?: string;
  reminder_days?: number[];
  status: 'draft' | 'active' | 'closed' | 'cancelled';
  created_by?: string;
  created_at: string;
}

export interface FormRecipient {
  id: string;
  form_id: string;
  student_id: string;
  status: FormStatus;
  viewed_at?: string;
  created_at: string;
  form?: Form;
  student?: Student;
}

export interface FormResponse {
  id: string;
  form_id: string;
  recipient_id: string;
  student_id: string;
  responses: Record<string, unknown>;
  decision?: 'approved' | 'declined' | 'partial';
  decline_reason?: string;
  signature_data?: string;
  signature_name?: string;
  signed_by?: string;
  signed_at?: string;
  submitted_at: string;
}

export interface Event {
  id: string;
  school_id: string;
  title: string;
  description?: string;
  event_type: EventType;
  location?: string;
  start_time: string;
  end_time?: string;
  requires_rsvp: boolean;
  rsvp_deadline?: string;
  max_attendees?: number;
  allow_guests: boolean;
  max_guests_per_family: number;
  cost_per_student: number;
  cost_per_guest: number;
  payment_item_id?: string;
  permission_form_id?: string;
  target_type: 'school' | 'grade' | 'class' | 'student';
  target_id?: string;
  status: 'draft' | 'published' | 'cancelled' | 'completed';
  created_by?: string;
  created_at: string;
  payment_item?: PaymentItem;
  permission_form?: Form;
}

export interface EventRsvp {
  id: string;
  event_id: string;
  student_id: string;
  responded_by: string;
  response: RsvpResponse;
  num_guests: number;
  guest_names?: string[];
  notes?: string;
  payment_status: 'not_required' | 'pending' | 'paid';
  permission_status: 'not_required' | 'pending' | 'signed';
  responded_at: string;
  event?: Event;
  student?: Student;
}

// Bus Tracking Types
export type BusStatus = 'active' | 'maintenance' | 'retired';
export type RouteType = 'morning' | 'afternoon' | 'both' | 'field_trip' | 'activity';
export type TripStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertType = 'delay' | 'breakdown' | 'accident' | 'route_change' | 'weather' | 'emergency' | 'student_incident' | 'other';

export interface Bus {
  id: string;
  school_id: string;
  bus_number: string;
  license_plate?: string;
  capacity: number;
  make?: string;
  model?: string;
  year?: number;
  color?: string;
  has_wheelchair_lift: boolean;
  has_ac: boolean;
  has_gps: boolean;
  status: BusStatus;
  notes?: string;
}

export interface BusRoute {
  id: string;
  school_id: string;
  route_number: string;
  name: string;
  description?: string;
  route_type: RouteType;
  bus_id?: string;
  driver_id?: string;
  estimated_duration_minutes?: number;
  start_time?: string;
  status: 'active' | 'inactive' | 'suspended';
  bus?: Bus;
  driver?: User;
  stops?: BusStop[];
}

export interface BusStop {
  id: string;
  school_id: string;
  route_id: string;
  stop_number: number;
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  scheduled_time?: string;
  estimated_wait_minutes: number;
  stop_type: 'regular' | 'school' | 'transfer';
  active: boolean;
  notes?: string;
}

export interface StudentBusAssignment {
  id: string;
  school_id: string;
  student_id: string;
  morning_route_id?: string;
  morning_stop_id?: string;
  afternoon_route_id?: string;
  afternoon_stop_id?: string;
  needs_wheelchair_lift: boolean;
  guardian_phone?: string;
  notes?: string;
  active: boolean;
  morning_route?: BusRoute;
  morning_stop?: BusStop;
  afternoon_route?: BusRoute;
  afternoon_stop?: BusStop;
  student?: Student;
}

export interface BusTrip {
  id: string;
  school_id: string;
  route_id: string;
  bus_id: string;
  driver_id: string;
  trip_date: string;
  trip_type: 'morning' | 'afternoon' | 'field_trip' | 'activity';
  status: TripStatus;
  scheduled_start?: string;
  actual_start?: string;
  actual_end?: string;
  current_latitude?: number;
  current_longitude?: number;
  current_speed?: number;
  current_heading?: number;
  last_location_update?: string;
  current_stop_index: number;
  students_on_board: number;
  notes?: string;
  route?: BusRoute;
  bus?: Bus;
  driver?: User;
}

export interface BusLocationHistory {
  id: string;
  trip_id: string;
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
  accuracy?: number;
  recorded_at: string;
}

export interface BusStopEvent {
  id: string;
  trip_id: string;
  stop_id: string;
  event_type: 'arrived' | 'departed' | 'skipped';
  scheduled_time?: string;
  actual_time: string;
  students_boarded: number;
  students_exited: number;
  notes?: string;
  stop?: BusStop;
}

export interface StudentBusScan {
  id: string;
  trip_id: string;
  student_id: string;
  stop_id?: string;
  scan_type: 'board' | 'exit';
  scanned_at: string;
  parent_notified: boolean;
  student?: Student;
}

export interface BusAlert {
  id: string;
  school_id: string;
  trip_id?: string;
  route_id?: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  title: string;
  message?: string;
  resolved: boolean;
  resolved_at?: string;
  resolved_by?: string;
  resolution_notes?: string;
  created_by?: string;
  created_at: string;
}
