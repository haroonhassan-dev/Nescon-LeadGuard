/**
 * Typed calls for the backend features the original screens did not cover yet:
 * CRM customization, Stripe, Google Calendar, Telegram, WhatsApp (Vonage), roles and settings.
 * Shapes mirror the server responses in server/src/modules and server/src/integrations.
 */
import { apiFetch } from './apiClient';

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });
const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && q.set(k, String(v)));
  const s = q.toString();
  return s ? `?${s}` : '';
};

// ---------------- Types ----------------
export type FieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'DROPDOWN' | 'CHECKBOX';

export interface ApiStage {
  id: string;
  pipelineId: string;
  name: string;
  position: number;
  isWonStage: boolean;
  isLostStage: boolean;
  requiredFieldIds: string[];
}
export interface ApiField {
  id: string;
  entity: 'OPPORTUNITY' | 'CONTACT';
  pipelineId: string | null;
  key: string;
  label: string;
  type: FieldType;
  options: string[];
  position: number;
}
export interface ApiPipeline {
  id: string;
  name: string;
  isDefault: boolean;
  stages: ApiStage[];
  customFields: ApiField[];
  _count?: { opportunities: number };
}
export type FieldValues = Record<string, string | number | boolean | null>;
export interface ApiOpportunity {
  id: string;
  title: string;
  value: number | null;
  valueMasked: boolean;
  currency: string;
  pipelineId: string;
  stageId: string;
  stage?: { id: string; name: string; isWonStage: boolean; isLostStage: boolean };
  contactId: string | null;
  contact: { id: string; name: string; email: string | null; phone: string | null } | null;
  leadId: string | null;
  tags: string[];
  customValues: FieldValues;
  assignedUser: { id: string; name: string } | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface ApiPayment {
  id: string;
  status: string;
  amount: number | null;
  refundedAmount: number | null;
  currency: string;
  opportunity?: { id: string; title: string } | null;
  contact?: { id: string; name: string } | null;
  requestedBy?: { id: string; name: string } | null;
  providerReference: string;
  stripePaymentIntentId?: string | null;
  checkoutUrl: string | null;
  failureReason: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
}
export interface ApiOpportunityDetail extends ApiOpportunity {
  fields: ApiField[];
  stages: Array<{ id: string; name: string; position: number; isWonStage: boolean; isLostStage: boolean; requiredFields: string[] }>;
  payments: ApiPayment[];
  history: Array<{ action: string; actor: string; at: string; before: unknown; after: unknown }>;
}
export interface ApiContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  optedOut: boolean;
  tags: string[];
  customValues: FieldValues;
  companyId: string | null;
  company?: { id: string; name: string } | null;
  version: number;
  createdAt: string;
}
export interface ApiCompany {
  id: string;
  name: string;
  domain: string | null;
  phone: string | null;
  _count?: { contacts: number; opportunities: number };
}
export interface Filters {
  pipelineId?: string;
  stageId?: string;
  assignedUserId?: string;
  tag?: string;
  createdFrom?: string;
  createdTo?: string;
  minValue?: number;
  maxValue?: number;
  fields?: Array<{ key: string; op: 'eq' | 'contains' | 'gte' | 'lte'; value: string | number | boolean }>;
}
export interface ApiSavedList {
  id: string;
  name: string;
  filters: Filters;
  shared: boolean;
  ownerId: string;
  count: number | null;
}
export interface Paged<T> {
  items: T[];
  pagination: { page: number; limit: number; totalItems: number; totalPages: number };
}
export interface DashboardSummary {
  scope: 'company' | 'personal';
  generatedAt: string;
  figures: {
    newLeadsToday: number;
    openLeads: number;
    awaitingAcknowledgement: number;
    averageFirstResponseSeconds: number | null;
    firstResponseSampleSize: number;
    recoveryQueue: number | null;
    escalationsLast24h: number;
    availability: Record<string, number> | null;
    paymentsReceivedThisMonth: Array<{ currency: string; collectedCents: number; payments: number }> | null;
    openPipelineValueByStage: Array<{ stageId: string; stage: string; currency: string; total: number; opportunities: number }> | null;
  };
  upcomingAppointmentsNext7Days: number;
}
export interface ApiAppointment {
  id: string;
  title: string;
  status: string;
  startTime: string;
  endTime: string;
  timezone: string;
  localStart: string;
  assignedUserId: string;
  leadId: string | null;
  contactId: string | null;
  googleCalendarEventId: string | null;
}
export interface CalendarStatus {
  me: { status: 'CONNECTED' | 'ERROR' | 'NOT_CONNECTED'; email: string | null; lastWorkedAt: string | null; problem: string | null };
  team?: Array<{ userId: string; name: string; status: string; email: string | null; problem: string | null }>;
  limits: string[];
}
export interface ProviderStatus {
  provider: string;
  status: 'connected' | 'error' | 'not_connected';
  lastWorkedAt: string | null;
  recentErrors: Array<{ at: string; type: string; result: string; detail: string | null }>;
  limits: string[];
  whatsappNumber?: string | null;
  configuredOnServer?: boolean;
}
export interface Conversation {
  contactId: string;
  name: string;
  phone: string | null;
  optedOut: boolean;
  lastMessage: { body: string; direction: string; status: string; at: string } | null;
  leadId: string | null;
  assignedEmployee: { id: string; name: string } | null;
}
export interface ConversationDetail {
  contact: { id: string; name: string; phone: string | null; optedOut: boolean };
  leadId: string | null;
  assignedEmployee: { id: string; name: string } | null;
  canSend: boolean;
  cannotSendReason: string | null;
  messages: Array<{ id: string; direction: 'INBOUND' | 'OUTBOUND'; body: string; status: string; error: string | null; canRetry: boolean; at: string }>;
}
export interface ApiRole {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
  isSystem: boolean;
  memberCount: number;
}
export interface EscalationLevel {
  target: 'NEXT_ELIGIBLE' | 'BACKUP' | 'MANAGER';
  timeoutSeconds: number;
}
export interface AssignmentSettings {
  ackTimeoutSeconds: number;
  maxOpenLeadsPerUser: number;
  escalationLevels: EscalationLevel[];
  backupUserId: string | null;
  managerUserId: string | null;
  idleThresholdSeconds: number;
  recoveryEscalationThreshold: number;
  acknowledgedLeadPolicy: 'KEEP_WITH_OWNER' | 'REASSIGN';
  acknowledgedLeadPolicyDescription: string;
  version: number;
}
export interface Alert {
  id: string;
  leadId: string | null;
  recipientUserId: string;
  status: 'PENDING' | 'SENT' | 'FAILED' | 'NO_CHANNEL';
  attempts: number;
  lastError: string | null;
  channel: string | null;
  createdAt: string;
  sentAt: string | null;
}

// ---------------- Calls ----------------
export const liveApi = {
  dashboard: () => apiFetch<DashboardSummary>('/dashboard/summary'),

  // CRM
  pipelines: () => apiFetch<{ items: ApiPipeline[] }>('/crm/pipelines'),
  createPipeline: (name: string, stages: string[]) => apiFetch<ApiPipeline>('/crm/pipelines', json('POST', { name, stages })),
  renamePipeline: (id: string, name: string) => apiFetch('/crm/pipelines/' + id, json('PATCH', { name })),
  addStage: (pipelineId: string, name: string) => apiFetch<ApiStage>(`/crm/pipelines/${pipelineId}/stages`, json('POST', { name })),
  updateStage: (id: string, body: { name?: string; requiredFieldIds?: string[] }) => apiFetch<ApiStage>('/crm/stages/' + id, json('PATCH', body)),
  reorderStages: (pipelineId: string, stageIds: string[]) => apiFetch<ApiPipeline>(`/crm/pipelines/${pipelineId}/stage-order`, json('PUT', { stageIds })),
  deleteStage: (id: string, moveToStageId?: string) => apiFetch<{ deleted: boolean; movedOpportunities: number }>(`/crm/stages/${id}${qs({ moveToStageId })}`, json('DELETE')),
  createField: (body: { entity: 'OPPORTUNITY' | 'CONTACT'; pipelineId?: string; label: string; type: FieldType; options?: string[] }) =>
    apiFetch<ApiField>('/crm/fields', json('POST', body)),
  fields: (entity?: 'OPPORTUNITY' | 'CONTACT', pipelineId?: string) => apiFetch<{ items: ApiField[] }>(`/crm/fields${qs({ entity, pipelineId })}`),
  archiveField: (id: string) => apiFetch('/crm/fields/' + id, json('DELETE')),
  opportunities: (params: Record<string, string | number | undefined> = {}) =>
    apiFetch<Paged<ApiOpportunity>>(`/crm/opportunities${qs({ limit: 100, ...params })}`),
  opportunity: (id: string) => apiFetch<ApiOpportunityDetail>('/crm/opportunities/' + id),
  createOpportunity: (body: { title: string; value: number; currency?: string; pipelineId?: string; stageId?: string; contactId?: string; tags?: string[]; customValues?: FieldValues }) =>
    apiFetch<ApiOpportunity>('/crm/opportunities', json('POST', body)),
  updateOpportunity: (id: string, body: { title?: string; value?: number; stageId?: string; tags?: string[]; customValues?: FieldValues; version: number }) =>
    apiFetch<ApiOpportunity>('/crm/opportunities/' + id, json('PATCH', body)),
  contacts: (search?: string) => apiFetch<Paged<ApiContact>>(`/crm/contacts${qs({ limit: 100, search })}`),
  contact: (id: string) => apiFetch<{
    contact: ApiContact & { company: ApiCompany | null };
    assignedEmployee: { id: string; name: string } | null;
    leads: Array<{ id: string; title: string; status: string; source: string; owner: string | null; createdAt: string }>;
    opportunities: ApiOpportunity[];
    messages: Array<{ id: string; direction: string; body: string; status: string; at: string }>;
    payments: Array<{ id: string; status: string; amount: number | null; currency: string; providerReference: string; paidAt: string | null }>;
    appointments: Array<{ id: string; title: string; status: string; startTime: string; timezone: string }>;
    activity: Array<{ id: string; kind: string; body: string | null; createdAt: string }>;
  }>('/crm/contacts/' + id),
  createContact: (body: { firstName: string; lastName?: string; email?: string; phone?: string; companyId?: string }) => apiFetch<ApiContact>('/crm/contacts', json('POST', body)),
  companies: () => apiFetch<{ items: ApiCompany[] }>('/crm/companies'),
  createCompany: (body: { name: string; domain?: string; phone?: string }) => apiFetch<ApiCompany>('/crm/companies', json('POST', body)),
  lists: () => apiFetch<{ items: ApiSavedList[] }>('/crm/lists'),
  createList: (name: string, filters: Filters, shared = false) => apiFetch<ApiSavedList>('/crm/lists', json('POST', { name, filters, shared })),
  listItems: (id: string) => apiFetch<{ list: { id: string; name: string; filters: Filters }; items: ApiOpportunity[] }>(`/crm/lists/${id}/items?limit=100`),
  deleteList: (id: string) => apiFetch('/crm/lists/' + id, json('DELETE')),

  // Stripe
  stripeStatus: () => apiFetch<ProviderStatus>('/integrations/stripe/status'),
  payments: () => apiFetch<Paged<ApiPayment>>('/integrations/stripe/payments?limit=100'),
  requestPayment: (opportunityId: string, amount: number, currency?: string) =>
    apiFetch<{ paymentId: string; checkoutUrl: string; expiresAt: string; testModeHint: string }>('/integrations/stripe/payment-requests', json('POST', { opportunityId, amount, currency })),

  // Google Calendar
  calendarStatus: () => apiFetch<CalendarStatus>('/integrations/google-calendar/status'),
  calendarConnectUrl: () => apiFetch<{ url: string }>('/integrations/google-calendar/connect'),
  calendarDisconnect: () => apiFetch('/integrations/google-calendar/connection', json('DELETE')),
  appointments: (params: Record<string, string | boolean | undefined> = {}) => apiFetch<{ items: ApiAppointment[] }>(`/integrations/google-calendar/appointments${qs(params)}`),
  busy: (from: string, to: string, userId?: string) => apiFetch<{ busy: Array<{ start: string; end: string }> }>(`/integrations/google-calendar/busy${qs({ from, to, userId })}`),
  bookAppointment: (body: { userId?: string; leadId?: string; contactId?: string; title: string; startTime: string; endTime: string; timezone: string; allowOverlap?: boolean }) =>
    apiFetch<ApiAppointment & { googleLink: string }>('/integrations/google-calendar/appointments', json('POST', body)),
  rescheduleAppointment: (id: string, startTime: string, endTime: string, timezone?: string) =>
    apiFetch<ApiAppointment>('/integrations/google-calendar/appointments/' + id, json('PATCH', { startTime, endTime, timezone })),
  cancelAppointment: (id: string) => apiFetch<ApiAppointment>('/integrations/google-calendar/appointments/' + id, json('DELETE')),

  // Telegram
  telegramLink: () => apiFetch<{ linked: boolean; chatName: string | null }>('/integrations/telegram/link', json('POST')),
  telegramTest: () => apiFetch<{ sent: boolean }>('/integrations/telegram/test', json('POST')),
  alerts: () => apiFetch<Paged<Alert>>('/leads/alerts?limit=50'),

  // WhatsApp (Vonage)
  whatsappStatus: () => apiFetch<ProviderStatus>('/integrations/vonage/status'),
  whatsappConnect: () => apiFetch<{ connected: boolean; whatsappNumber: string }>('/integrations/vonage/connect', json('POST')),
  conversations: () => apiFetch<{ items: Conversation[] }>('/integrations/vonage/conversations'),
  conversation: (contactId: string) => apiFetch<ConversationDetail>('/integrations/vonage/conversations/' + contactId),
  sendWhatsApp: (contactId: string, text: string) =>
    apiFetch<{ id: string; status: string; error: string | null; canRetry: boolean }>(`/integrations/vonage/conversations/${contactId}/messages`, json('POST', { text })),
  retryWhatsApp: (messageId: string) => apiFetch<{ id: string; status: string; error: string | null }>(`/integrations/vonage/messages/${messageId}/retry`, json('POST')),
  setOptOut: (contactId: string, optedOut: boolean) => apiFetch(`/integrations/vonage/contacts/${contactId}/opt-out`, json('POST', { optedOut })),

  audit: (params: Record<string, string | number | undefined>) =>
    apiFetch<Paged<{ id: string; actorType: string; actorId: string | null; actorName: string | null; action: string; entityType: string; entityId: string; previousState: unknown; newState: unknown; createdAt: string }> & { availableActions: string[] }>(`/audit${qs(params)}`),
  invite: (email: string, baseLevel: 'ADMIN' | 'USER', roleId: string) =>
    apiFetch<{ id: string; email: string; inviteUrl: string; expiresAt: string }>('/team/invitations', json('POST', { email, baseLevel, roleId })),
  updateMember: (userId: string, body: { baseLevel?: 'ADMIN' | 'USER'; roleId?: string; status?: 'ACTIVE' | 'SUSPENDED'; autoAssignEnabled?: boolean; maxOpenLeads?: number | null }) =>
    apiFetch('/team/' + userId, json('PATCH', body)),
  setAvailability: (userId: string, availability: 'AVAILABLE' | 'BUSY' | 'ON_LEAVE' | 'OFFLINE') =>
    apiFetch<{ availability: string; reassigned: number; policyDescription: string }>(`/team/${userId}/availability`, json('PATCH', { availability })),

  // Roles, team, settings
  permissions: () => apiFetch<{ catalog: string[]; roles: ApiRole[] }>('/permissions'),
  createRole: (name: string, permissions: string[], description?: string) => apiFetch<ApiRole>('/permissions/roles', json('POST', { name, permissions, description })),
  updateRole: (id: string, body: { name?: string; permissions?: string[] }) => apiFetch<ApiRole>('/permissions/roles/' + id, json('PATCH', body)),
  deleteRole: (id: string) => apiFetch('/permissions/roles/' + id, json('DELETE')),
  settings: () => apiFetch<AssignmentSettings>('/leads/settings'),
  updateSettings: (body: Partial<Omit<AssignmentSettings, 'acknowledgedLeadPolicyDescription'>> & { version: number }) =>
    apiFetch<AssignmentSettings>('/leads/settings', json('PUT', body)),
  recoveryQueue: () => apiFetch<Paged<{ id: string; title: string; contactName: string; owner: { id: string; name: string } | null; status: string; reasons: string[]; escalationCount: number }>>('/leads/recovery-queue?limit=100'),
};
