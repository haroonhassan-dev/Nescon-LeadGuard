/**
 * Escalation Domain Contract
 * Reliable, idempotent escalation engine for unacknowledged or SLA-breached leads.
 * Survives server restarts using persistent scheduled checkpoints.
 */

export type EscalationActionType =
  | 'NOTIFY_CURRENT_OWNER'
  | 'NOTIFY_MANAGER'
  | 'REASSIGN_ROUND_ROBIN'
  | 'BROADCAST_TELEGRAM'
  | 'DISPATCH_SMS'
  | 'MARK_CRITICAL';

export type EscalationStatus = 'SCHEDULED' | 'TRIGGERED' | 'ACKNOWLEDGED' | 'CANCELLED' | 'FAILED';

export interface EscalationRule {
  level: number;
  timeoutMinutes: number; // Duration after previous level or assignment
  actions: Array<{
    type: EscalationActionType;
    targetRole?: string;
    targetUserId?: string;
    templateId?: string;
    notificationChannels: Array<'IN_APP' | 'SMS' | 'TELEGRAM' | 'EMAIL'>;
  }>;
}

export interface EscalationPolicy {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  isDefault: boolean;
  rules: EscalationRule[];
  createdAt: string;
  updatedAt: string;
}

export interface EscalationEvent {
  id: string;
  workspaceId: string;
  leadId: string;
  policyId: string;
  level: number;
  status: EscalationStatus;
  
  /**
   * CRITICAL FOR IDEMPOTENT PROCESSING:
   * Unique deterministic key: `${leadId}-${policyId}-level-${level}-${scheduledTriggerTime}`
   * Ensures that replay after a node restart will not double-dispatch notifications or reassignments.
   */
  idempotencyKey: string;
  
  scheduledTriggerAt: string; // ISO-8601
  executedAt?: string; // ISO-8601
  cancelledAt?: string; // ISO-8601
  cancellationReason?: string;
  
  executionResult?: {
    actionsExecuted: EscalationActionType[];
    previousOwnerId?: string;
    newOwnerId?: string;
    deliveredChannels: string[];
    error?: string;
  };
  
  createdAt: string;
  updatedAt: string;
}

export interface CreateEscalationPolicyDTO {
  workspaceId: string;
  name: string;
  description?: string;
  isDefault?: boolean;
  rules: EscalationRule[];
}
