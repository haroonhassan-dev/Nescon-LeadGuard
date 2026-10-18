/**
 * Appointment Domain Contract
 * Google Calendar synchronized bookings, consultations, and employee meetings.
 */

export type AppointmentStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'RESCHEDULED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export type CalendarSyncStatus = 'SYNCED' | 'PENDING_SYNC' | 'FAILED' | 'DISCONNECTED';

export interface Appointment {
  id: string;
  workspaceId: string;
  leadId?: string;
  contactId?: string;
  assignedUserId: string; // The service employee assigned
  
  title: string;
  description?: string;
  startTime: string; // ISO-8601
  endTime: string;   // ISO-8601
  timezone: string;
  location?: string;
  meetingLink?: string;
  
  status: AppointmentStatus;
  
  // Google Calendar Integration attributes
  googleCalendarEventId?: string;
  googleCalendarSyncStatus: CalendarSyncStatus;
  lastSyncedAt?: string;
  
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAppointmentDTO {
  workspaceId: string;
  leadId?: string;
  contactId?: string;
  assignedUserId: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  timezone: string;
  location?: string;
  meetingLink?: string;
}

export interface UpdateAppointmentDTO {
  title?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  timezone?: string;
  assignedUserId?: string;
  status?: AppointmentStatus;
  meetingLink?: string;
}
