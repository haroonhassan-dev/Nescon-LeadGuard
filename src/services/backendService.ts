import { apiFetch } from './apiClient';
import { WorkspaceMembership, BackendLead, BackendTeamMember, BackendAuditEvent } from '../types';

export interface LoginResponseData {
  token: string;
  expiresAt: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    isActive: boolean;
  };
  memberships: WorkspaceMembership[];
}

export interface SignupResponseData {
  token: string;
  expiresAt: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    isActive: boolean;
  };
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
  memberships: WorkspaceMembership[];
}

export interface DashboardSummaryData {
  scope: 'company' | 'personal';
  generatedAt: string;
  dayStartsAt: string;
  figures: {
    newLeadsToday: number;
    openLeads: number;
    awaitingAcknowledgement: number;
    averageFirstResponseSeconds: number | null;
    firstResponseSampleSize: number;
    recoveryQueue: number | null;
    escalationsLast24h: number;
    availability: Record<string, number> | null;
  };
  notYetAvailable: string[];
  drillDown: {
    newLeadsToday: string;
    awaitingAcknowledgement: string;
    recoveryQueue: string;
  };
}

export const backendService = {
  // Auth Endpoints
  async login(email: string, password: string): Promise<LoginResponseData> {
    return apiFetch<LoginResponseData>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  async signup(payload: {
    workspaceName: string;
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }): Promise<SignupResponseData> {
    return apiFetch<SignupResponseData>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getMe(): Promise<{ user: LoginResponseData['user']; memberships: WorkspaceMembership[] }> {
    return apiFetch<{ user: LoginResponseData['user']; memberships: WorkspaceMembership[] }>('/auth/me');
  },

  async logout(): Promise<{ loggedOut: boolean }> {
    return apiFetch<{ loggedOut: boolean }>('/auth/logout', {
      method: 'POST',
    });
  },

  // Dashboard Endpoints
  async getDashboardSummary(): Promise<DashboardSummaryData> {
    return apiFetch<DashboardSummaryData>('/dashboard/summary');
  },

  // Leads Endpoints
  async getLeads(params?: {
    status?: string;
    source?: string;
    search?: string;
    ownerId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: BackendLead[]; pagination: unknown; serverTime: string }> {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.source) q.set('source', params.source);
    if (params?.search) q.set('search', params.search);
    if (params?.ownerId) q.set('ownerId', params.ownerId);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));

    const queryStr = q.toString() ? `?${q.toString()}` : '';
    return apiFetch<{ items: BackendLead[]; pagination: unknown; serverTime: string }>(`/leads${queryStr}`);
  },

  async createLead(payload: {
    contactName: string;
    contactEmail?: string;
    contactPhone?: string;
    message?: string;
    title?: string;
  }): Promise<BackendLead> {
    return apiFetch<BackendLead>('/leads', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getLeadById(id: string): Promise<BackendLead & { activities: unknown[]; assignments: unknown[]; serverTime: string }> {
    return apiFetch<BackendLead & { activities: unknown[]; assignments: unknown[]; serverTime: string }>(`/leads/${id}`);
  },

  async acknowledgeLead(id: string): Promise<BackendLead> {
    return apiFetch<BackendLead>(`/leads/${id}/acknowledge`, {
      method: 'POST',
    });
  },

  async claimLead(id: string): Promise<BackendLead> {
    return apiFetch<BackendLead>(`/leads/${id}/claim`, {
      method: 'POST',
    });
  },

  async reassignLead(id: string, userId: string, reason: string): Promise<BackendLead> {
    return apiFetch<BackendLead>(`/leads/${id}/reassign`, {
      method: 'POST',
      body: JSON.stringify({ userId, reason }),
    });
  },

  async closeLead(id: string, outcome: string): Promise<BackendLead> {
    return apiFetch<BackendLead>(`/leads/${id}/close`, {
      method: 'POST',
      body: JSON.stringify({ outcome }),
    });
  },

  async getRecoveryQueue(params?: { page?: number; limit?: number }): Promise<{
    items: Array<BackendLead & { reasons: string[] }>;
    pagination: unknown;
  }> {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    const queryStr = q.toString() ? `?${q.toString()}` : '';
    return apiFetch<{ items: Array<BackendLead & { reasons: string[] }>; pagination: unknown }>(
      `/leads/recovery-queue${queryStr}`
    );
  },

  async getLeadSettings(): Promise<unknown> {
    return apiFetch<unknown>('/leads/settings');
  },

  async updateLeadSettings(settings: unknown): Promise<unknown> {
    return apiFetch<unknown>('/leads/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  },

  // Team & Availability Endpoints
  async getTeam(): Promise<{ items: BackendTeamMember[] }> {
    return apiFetch<{ items: BackendTeamMember[] }>('/team');
  },

  async updateAvailability(userId: string, availability: 'AVAILABLE' | 'BUSY' | 'ON_LEAVE' | 'OFFLINE'): Promise<unknown> {
    return apiFetch<unknown>(`/team/${userId}/availability`, {
      method: 'PATCH',
      body: JSON.stringify({ availability }),
    });
  },

  async updateMember(
    userId: string,
    payload: {
      baseLevel?: 'ADMIN' | 'USER';
      roleId?: string;
      status?: 'ACTIVE' | 'SUSPENDED';
      autoAssignEnabled?: boolean;
      maxOpenLeads?: number | null;
    }
  ): Promise<unknown> {
    return apiFetch<unknown>(`/team/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async inviteMember(payload: {
    email: string;
    baseLevel: 'ADMIN' | 'USER';
    roleId: string;
  }): Promise<{
    id: string;
    email: string;
    baseLevel: string;
    role: { id: string; name: string };
    inviteUrl: string;
  }> {
    return apiFetch<{
      id: string;
      email: string;
      baseLevel: string;
      role: { id: string; name: string };
      inviteUrl: string;
    }>('/team/invitations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Permissions Endpoints
  async getPermissions(): Promise<{
    catalog: string[];
    roles: Array<{
      id: string;
      name: string;
      description?: string;
      permissions: string[];
      isSystem: boolean;
      memberCount: number;
    }>;
  }> {
    return apiFetch<{
      catalog: string[];
      roles: Array<{
        id: string;
        name: string;
        description?: string;
        permissions: string[];
        isSystem: boolean;
        memberCount: number;
      }>;
    }>('/permissions');
  },

  // Audit Endpoints
  async getAuditEvents(params?: {
    action?: string;
    actorId?: string;
    entityType?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: BackendAuditEvent[]; pagination: unknown; availableActions: string[] }> {
    const q = new URLSearchParams();
    if (params?.action) q.set('action', params.action);
    if (params?.actorId) q.set('actorId', params.actorId);
    if (params?.entityType) q.set('entityType', params.entityType);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));

    const queryStr = q.toString() ? `?${q.toString()}` : '';
    return apiFetch<{ items: BackendAuditEvent[]; pagination: unknown; availableActions: string[] }>(
      `/audit${queryStr}`
    );
  },
};
