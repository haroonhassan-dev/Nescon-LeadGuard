/**
 * Audit Event Domain Contract
 * Immutable audit trail capturing every state change, lead transition, and security action.
 */

export type ActorType = 'USER' | 'SYSTEM' | 'INTEGRATION_WEBHOOK' | 'ESCALATION_ENGINE';

export type AuditAction =
  | 'WORKSPACE_UPDATED'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'ROLE_UPDATED'
  | 'LEAD_CREATED'
  | 'LEAD_CLAIMED'
  | 'LEAD_REASSIGNED'
  | 'LEAD_ACKNOWLEDGED'
  | 'LEAD_ESCALATED'
  | 'LEAD_STATUS_CHANGED'
  | 'OPPORTUNITY_STAGE_CHANGED'
  | 'PAYMENT_PROCESSED'
  | 'PAYMENT_REFUNDED'
  | 'MESSAGE_SENT'
  | 'MESSAGE_RECEIVED'
  | 'APPOINTMENT_SCHEDULED'
  | 'INTEGRATION_CONNECTED';

export interface AuditActor {
  id: string; // User ID, Integration Name, or 'system'
  type: ActorType;
  name?: string;
  email?: string;
}

export interface AuditEvent {
  id: string;
  workspaceId: string;
  actor: AuditActor;
  action: AuditAction;
  entityType: string; // 'Lead', 'Opportunity', 'Payment', etc.
  entityId: string;
  
  // Delta records for audit review
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  diff?: Record<string, { from: unknown; to: unknown }>;
  
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
    source?: string;
  };
  
  timestamp: string; // ISO-8601
}

export interface QueryAuditEventsDTO {
  workspaceId: string;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  action?: AuditAction;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}
