export type NavigationTab = 'dashboard' | 'leads' | 'crm' | 'integrations' | 'team';

export type BaseRoleLevel = 'OWNER' | 'ADMIN' | 'USER';

export interface WorkspaceMembership {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug?: string;
  baseLevel: BaseRoleLevel;
  role: { id: string; name: string } | null;
  availability?: 'AVAILABLE' | 'BUSY' | 'ON_LEAVE' | 'OFFLINE';
  permissions: string[];
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  baseLevel: BaseRoleLevel;
  roleName: string;
  permissions: string[];
}

export interface BackendLead {
  id: string;
  workspaceId: string;
  title: string;
  contactName: string;
  contactEmail?: string;
  contactPhone?: string;
  status: 'UNASSIGNED' | 'ASSIGNED' | 'ACKNOWLEDGED' | 'CLOSED';
  source: 'WEB_FORM' | 'WHATSAPP' | 'SMS' | 'MANUAL';
  currentOwnerId?: string;
  currentOwner?: { id: string; firstName: string; lastName: string } | null;
  assignedAt?: string;
  acknowledgementDeadline?: string;
  acknowledgedAt?: string;
  closedAt?: string;
  closeOutcome?: string;
  createdAt: string;
  updatedAt: string;
  reasons?: string[];
}

export interface BackendTeamMember {
  userId: string;
  name: string;
  email?: string;
  baseLevel: BaseRoleLevel;
  role: { id: string; name: string } | null;
  status: 'ACTIVE' | 'SUSPENDED';
  availability: 'AVAILABLE' | 'BUSY' | 'ON_LEAVE' | 'OFFLINE';
  availabilityChangedAt: string;
  autoAssignEnabled: boolean;
  openLeads: number;
  maxOpenLeads: number;
  telegramConfigured: boolean;
}

export interface BackendAuditEvent {
  id: string;
  workspaceId: string;
  actorId?: string;
  actorType: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string;
  createdAt: string;
}

export interface CustomFieldDefinition {
  id: string;
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'dropdown' | 'checkbox';
  options?: string[]; // for dropdown
  requiredForStageId?: string; // Stage-specific validation requirement
  workspaceId: string;
}

export interface LeadFilterState {
  search: string;
  source: string;
  priority: string;
  status: string;
  ownerId: string;
  onlyOverdue: boolean;
  onlyEscalated: boolean;
}

export interface WidgetPreferences {
  showKpis: boolean;
  showPipelineChart: boolean;
  showEscalations: boolean;
  showAvailability: boolean;
  showAppointments: boolean;
  showRecentLeads: boolean;
}
