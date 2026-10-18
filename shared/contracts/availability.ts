/**
 * Employee Availability Domain Contract
 * Powers intelligent lead routing and assignment based on shifts and live availability.
 */

export type AvailabilityStatus = 'AVAILABLE' | 'BUSY' | 'AWAY' | 'OFFLINE';

export interface ShiftSchedule {
  id: string;
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  timezone: string;
  isActive: boolean;
}

export interface EmployeeAvailability {
  id: string;
  workspaceId: string;
  userId: string;
  status: AvailabilityStatus;
  statusReason?: string;
  isEligibleForAutoAssignment: boolean;
  maxConcurrentActiveLeads: number;
  currentActiveLeadCount: number;
  lastAssignedAt?: string;
  shifts: ShiftSchedule[];
  updatedAt: string;
}

export interface UpdateAvailabilityDTO {
  status?: AvailabilityStatus;
  statusReason?: string;
  isEligibleForAutoAssignment?: boolean;
  maxConcurrentActiveLeads?: number;
}
