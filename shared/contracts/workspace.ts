/**
 * Workspace Domain Contract
 * Multi-tenant root entity. Every business entity in Nescon-LeadGuard must be scoped to a Workspace.
 */

export interface BusinessHours {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday, 6 = Saturday
  openTime: string; // HH:mm format e.g. "09:00"
  closeTime: string; // HH:mm format e.g. "17:00"
  isOpen: boolean;
}

export interface WorkspaceSettings {
  defaultTimezone: string;
  defaultCurrency: string;
  businessHours: BusinessHours[];
  defaultAcknowledgementTimeoutMinutes: number; // e.g. 15 minutes
  maxEscalationLevels: number; // e.g. 3
  autoAssignmentEnabled: boolean;
  webhookRetryLimit: number;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  logoUrl?: string;
  settings: WorkspaceSettings;
  isActive: boolean;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

export interface CreateWorkspaceDTO {
  name: string;
  slug: string;
  domain?: string;
  settings?: Partial<WorkspaceSettings>;
}

export interface UpdateWorkspaceDTO {
  name?: string;
  logoUrl?: string;
  settings?: Partial<WorkspaceSettings>;
  isActive?: boolean;
}
