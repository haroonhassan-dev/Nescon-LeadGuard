/**
 * Lead Domain Contract
 * Core entity for inbound leads with automated routing, single ownership,
 * strict acknowledgment deadlines, and escalation tracking.
 */

export type LeadSource =
  | 'WEBSITE_FORM'
  | 'INBOUND_CALL'
  | 'TWILIO_SMS'
  | 'TELEGRAM_BOT'
  | 'STRIPE_CHECKOUT'
  | 'MANUAL'
  | 'REFERRAL'
  | 'WEBHOOK';

export type LeadPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type LeadStatus =
  | 'UNASSIGNED'
  | 'ASSIGNED'
  | 'ACKNOWLEDGED'
  | 'IN_PROGRESS'
  | 'ESCALATED'
  | 'CONVERTED'
  | 'LOST';

export interface Lead {
  id: string;
  workspaceId: string;
  title: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  companyName?: string;
  source: LeadSource;
  priority: LeadPriority;
  status: LeadStatus;
  
  /**
   * CRITICAL ARCHITECTURAL INVARIANT:
   * A lead must have at most ONE active current owner.
   * Concurrent reassignment or claim must be enforced with optimistic/pessimistic locking.
   */
  currentOwnerId?: string;
  
  // Assignment & Acknowledgment Deadlines
  assignedAt?: string; // ISO-8601
  acknowledgementDeadline?: string; // ISO-8601
  acknowledgedAt?: string; // ISO-8601
  
  // Escalation Tracker
  escalationLevel: number; // 0 = none, 1 = first escalation, etc.
  lastEscalatedAt?: string; // ISO-8601
  escalationPolicyId?: string;

  // Conversion & CRM Linkage
  contactId?: string;
  companyId?: string;
  opportunityId?: string;

  score?: number; // 0-100 algorithmic score
  estimatedValue?: number;
  currency?: string;
  notes?: string;
  tags: string[];
  customFields?: Record<string, unknown>;

  createdAt: string;
  updatedAt: string;
}

export interface CreateLeadDTO {
  workspaceId: string;
  title: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  companyName?: string;
  source: LeadSource;
  priority?: LeadPriority;
  estimatedValue?: number;
  currency?: string;
  notes?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
}

export interface ClaimLeadDTO {
  userId: string;
  expectedVersion?: number; // For optimistic locking
}

export interface AcknowledgeLeadDTO {
  userId: string;
  notes?: string;
}

export interface ReassignLeadDTO {
  newOwnerId: string;
  reason: string;
  resetAcknowledgmentDeadline?: boolean;
}

export interface EscalateLeadDTO {
  reason: string;
  forcedLevel?: number;
}
