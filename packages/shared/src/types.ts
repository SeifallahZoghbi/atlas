// User roles in the system
export type UserRole = 'parent' | 'teacher' | 'admin' | 'driver';

// Feed item types
export type FeedItemType =
  | 'announcement'
  | 'homework'
  | 'attendance'
  | 'pickup'
  | 'bus'
  | 'payment'
  | 'form'
  | 'emergency';

// Feed targeting
export type FeedTargetType = 'school' | 'grade' | 'class' | 'student';
export type FeedPriority = 'low' | 'normal' | 'high' | 'urgent';

// Conversation types
export type ConversationType = 'direct' | 'class_group' | 'grade_group' | 'broadcast';
export type ParticipantRole = 'member' | 'admin';
export type MessageType = 'text' | 'action' | 'system';
export type ActionType = 'sign' | 'pay' | 'rsvp' | 'acknowledge';

// Base entity with multi-tenant school_id
export interface BaseEntity {
  id: string;
  school_id: string;
  created_at: string;
  updated_at: string;
}

// Core entities
export interface School {
  id: string;
  name: string;
  slug: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface User extends Omit<BaseEntity, 'updated_at'> {
  email: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  phone?: string;
  avatar_url?: string;
  updated_at: string;
}

export interface Student extends BaseEntity {
  first_name: string;
  last_name: string;
  grade: string;
  class_id?: string;
  date_of_birth?: string;
  student_number?: string;
  avatar_url?: string;
}

export interface Class extends BaseEntity {
  name: string;
  grade: string;
  teacher_id?: string;
}

export interface StudentGuardian {
  id: string;
  school_id: string;
  student_id: string;
  user_id: string;
  relationship: string;
  is_primary: boolean;
  can_pickup: boolean;
  emergency_contact: boolean;
  created_at: string;
}

export interface ClassEnrollment {
  id: string;
  school_id: string;
  class_id: string;
  student_id: string;
  enrolled_at: string;
}

// Feed entities
export interface FeedItem {
  id: string;
  school_id: string;
  type: FeedItemType;
  title: string;
  body?: string;
  metadata: Record<string, unknown>;
  priority: FeedPriority;
  target_type: FeedTargetType;
  target_id?: string;
  target_grade?: string;
  author_id?: string;
  created_at: string;
  updated_at: string;
  expires_at?: string;
  action_required: boolean;
  action_deadline?: string;
  // Joined
  author?: User;
}

export interface FeedItemRecipient {
  id: string;
  school_id: string;
  feed_item_id: string;
  user_id: string;
  read_at?: string;
  acknowledged_at?: string;
  action_completed_at?: string;
}

// Messaging entities
export interface Conversation {
  id: string;
  school_id: string;
  type: ConversationType;
  name?: string;
  class_id?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  last_message_at?: string;
  // Virtual
  last_message?: Message;
  unread_count?: number;
}

export interface ConversationParticipant {
  id: string;
  school_id: string;
  conversation_id: string;
  user_id: string;
  role: ParticipantRole;
  muted: boolean;
  joined_at: string;
  last_read_at?: string;
}

export interface Message {
  id: string;
  school_id: string;
  conversation_id: string;
  sender_id?: string;
  content: string;
  metadata: Record<string, unknown>;
  message_type: MessageType;
  action_type?: ActionType;
  created_at: string;
  edited_at?: string;
  deleted_at?: string;
  // Joined
  sender?: User;
}

export interface MessageRead {
  id: string;
  message_id: string;
  user_id: string;
  read_at: string;
}

export interface MessageActionResponse {
  id: string;
  school_id: string;
  message_id: string;
  user_id: string;
  response: Record<string, unknown>;
  responded_at: string;
}
