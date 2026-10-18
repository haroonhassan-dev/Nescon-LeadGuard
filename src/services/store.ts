import { Workspace } from '@shared/workspace';
import { User } from '@shared/user';
import { Role } from '@shared/roles';
import { EmployeeAvailability } from '@shared/availability';
import { Contact } from '@shared/contact';
import { Company } from '@shared/company';
import { Pipeline } from '@shared/pipeline';
import { Opportunity } from '@shared/opportunity';
import { Lead } from '@shared/lead';
import { Payment } from '@shared/payment';
import { Message } from '@shared/message';
import { Appointment } from '@shared/appointment';
import { AuditEvent, AuditAction } from '@shared/audit';
import { CustomFieldDefinition, BackendLead, BackendTeamMember } from '../types';

// v2: no mock seed. Everything shown comes from the backend after login.
const STORAGE_KEY = 'nescon_leadguard_app_state_v2';

const PLACEHOLDER_WORKSPACE: Workspace = {
  id: 'pending',
  name: 'Workspace',
  slug: 'pending',
  settings: {
    defaultTimezone: 'UTC',
    defaultCurrency: 'USD',
    defaultAcknowledgementTimeoutMinutes: 1,
    maxEscalationLevels: 3,
    autoAssignmentEnabled: true,
    webhookRetryLimit: 3,
    businessHours: [],
  },
  isActive: true,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

interface AppState {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  roles: Role[];
  users: User[];
  availabilities: EmployeeAvailability[];
  companies: Company[];
  contacts: Contact[];
  pipelines: Pipeline[];
  customFields: CustomFieldDefinition[];
  opportunities: Opportunity[];
  leads: Lead[];
  payments: Payment[];
  messages: Message[];
  appointments: Appointment[];
  auditEvents: AuditEvent[];
}

function loadInitialState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Failed to parse state from localStorage, initializing fresh seed:', err);
  }

  return {
    workspaces: [PLACEHOLDER_WORKSPACE],
    activeWorkspaceId: PLACEHOLDER_WORKSPACE.id,
    roles: [],
    users: [],
    availabilities: [],
    companies: [],
    contacts: [],
    pipelines: [],
    customFields: [],
    opportunities: [],
    leads: [],
    payments: [],
    messages: [],
    appointments: [],
    auditEvents: [],
  };
}

class AppStore {
  private state: AppState = loadInitialState();
  private listeners: Set<() => void> = new Set();

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('Could not persist state to localStorage', e);
    }
    this.notify();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  public resetToDefault(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.state = loadInitialState();
    this.notify();
  }

  // Workspaces
  public getWorkspaces(): Workspace[] {
    return this.state.workspaces;
  }

  public getActiveWorkspace(): Workspace {
    const ws = this.state.workspaces.find((w) => w.id === this.state.activeWorkspaceId);
    return ws || this.state.workspaces[0];
  }

  /** Called after login: the active workspace is the one the server says the user belongs to. */
  public setWorkspaceFromMembership(m: { workspaceId: string; workspaceName: string; workspaceSlug?: string }): void {
    const ws: Workspace = { ...PLACEHOLDER_WORKSPACE, id: m.workspaceId, name: m.workspaceName, slug: m.workspaceSlug || m.workspaceId };
    this.state.workspaces = [ws];
    this.state.activeWorkspaceId = ws.id;
    this.save();
  }

  public clearAll(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.state = loadInitialState();
    this.notify();
  }

  public setActiveWorkspaceId(id: string): void {
    this.state.activeWorkspaceId = id;
    this.save();
  }

  public createWorkspace(name: string, slug: string, defaultTimeout = 15): Workspace {
    const newWs: Workspace = {
      id: `ws_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name,
      slug,
      settings: {
        defaultTimezone: 'America/New_York',
        defaultCurrency: 'USD',
        defaultAcknowledgementTimeoutMinutes: defaultTimeout,
        maxEscalationLevels: 3,
        autoAssignmentEnabled: true,
        webhookRetryLimit: 5,
        businessHours: [],
      },
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.state.workspaces.push(newWs);
    this.state.activeWorkspaceId = newWs.id;
    this.save();
    return newWs;
  }

  // Leads
  public getLeads(): Lead[] {
    return this.state.leads.filter((l) => l.workspaceId === this.state.activeWorkspaceId);
  }

  public getLeadById(id: string): Lead | undefined {
    return this.state.leads.find((l) => l.id === id);
  }

  public createLead(payload: Partial<Lead>, actor: { id: string; name: string }): Lead {
    const activeWs = this.getActiveWorkspace();
    const timeoutMinutes = activeWs.settings.defaultAcknowledgementTimeoutMinutes || 15;
    const now = new Date();

    // Auto assignment check: if auto assignment is enabled, assign to first available agent
    let assignedOwnerId: string | undefined = payload.currentOwnerId;
    if (!assignedOwnerId && activeWs.settings.autoAssignmentEnabled) {
      const candidate = this.state.availabilities.find(
        (a) => a.workspaceId === activeWs.id && a.isEligibleForAutoAssignment && a.status === 'AVAILABLE' && a.currentActiveLeadCount < a.maxConcurrentActiveLeads
      );
      if (candidate) {
        assignedOwnerId = candidate.userId;
        candidate.currentActiveLeadCount += 1;
        candidate.lastAssignedAt = now.toISOString();
      }
    }

    const newLead: Lead = {
      id: `lead_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      workspaceId: activeWs.id,
      title: payload.title || 'Untitled Lead',
      contactName: payload.contactName || 'Anonymous',
      contactEmail: payload.contactEmail || 'lead@example.com',
      contactPhone: payload.contactPhone,
      companyName: payload.companyName,
      source: payload.source || 'WEBSITE_FORM',
      priority: payload.priority || 'MEDIUM',
      status: assignedOwnerId ? 'ASSIGNED' : 'UNASSIGNED',
      currentOwnerId: assignedOwnerId,
      assignedAt: assignedOwnerId ? now.toISOString() : undefined,
      acknowledgementDeadline: assignedOwnerId
        ? new Date(now.getTime() + timeoutMinutes * 60 * 1000).toISOString()
        : undefined,
      escalationLevel: 0,
      score: payload.score || 70,
      estimatedValue: payload.estimatedValue || 10000,
      currency: payload.currency || 'USD',
      notes: payload.notes || '',
      tags: payload.tags || ['NEW'],
      customFields: payload.customFields || {},
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    this.state.leads.unshift(newLead);
    this.recordAudit(actor, 'LEAD_CREATED', 'Lead', newLead.id, undefined, newLead);
    this.save();
    return newLead;
  }

  public claimLead(leadId: string, actor: { id: string; name: string }): { success: boolean; error?: string } {
    const lead = this.state.leads.find((l) => l.id === leadId);
    if (!lead) return { success: false, error: 'Lead not found' };

    // Single-Owner Invariant
    if (lead.currentOwnerId && lead.currentOwnerId !== actor.id) {
      const owner = this.state.users.find((u) => u.id === lead.currentOwnerId);
      return {
        success: false,
        error: `Single-owner conflict: Lead was already claimed by ${owner?.firstName || 'another agent'}.`,
      };
    }

    const oldState = { ...lead };
    const now = new Date();
    const activeWs = this.getActiveWorkspace();
    const timeoutMinutes = activeWs.settings.defaultAcknowledgementTimeoutMinutes || 15;

    lead.currentOwnerId = actor.id;
    lead.status = 'ASSIGNED';
    lead.assignedAt = now.toISOString();
    lead.acknowledgementDeadline = new Date(now.getTime() + timeoutMinutes * 60 * 1000).toISOString();
    lead.updatedAt = now.toISOString();

    // Update availability active lead count
    const avail = this.state.availabilities.find((a) => a.userId === actor.id);
    if (avail) {
      avail.currentActiveLeadCount += 1;
      avail.lastAssignedAt = now.toISOString();
    }

    this.recordAudit(actor, 'LEAD_CLAIMED', 'Lead', lead.id, oldState, lead);
    this.save();
    return { success: true };
  }

  public acknowledgeLead(leadId: string, actor: { id: string; name: string }): { success: boolean; error?: string } {
    const lead = this.state.leads.find((l) => l.id === leadId);
    if (!lead) return { success: false, error: 'Lead not found' };

    const oldState = { ...lead };
    lead.acknowledgedAt = new Date().toISOString();
    lead.status = 'ACKNOWLEDGED';
    lead.updatedAt = new Date().toISOString();

    this.recordAudit(actor, 'LEAD_ACKNOWLEDGED', 'Lead', lead.id, oldState, lead);
    this.save();
    return { success: true };
  }

  public reassignLead(leadId: string, newOwnerId: string, reason: string, actor: { id: string; name: string }): { success: boolean; error?: string } {
    const lead = this.state.leads.find((l) => l.id === leadId);
    if (!lead) return { success: false, error: 'Lead not found' };

    const oldOwnerId = lead.currentOwnerId;
    const oldState = { ...lead };
    const now = new Date();
    const activeWs = this.getActiveWorkspace();
    const timeoutMinutes = activeWs.settings.defaultAcknowledgementTimeoutMinutes || 15;

    lead.currentOwnerId = newOwnerId;
    lead.status = 'ASSIGNED';
    lead.assignedAt = now.toISOString();
    lead.acknowledgementDeadline = new Date(now.getTime() + timeoutMinutes * 60 * 1000).toISOString();
    lead.acknowledgedAt = undefined;
    lead.updatedAt = now.toISOString();
    lead.notes = `${lead.notes || ''}\n[${now.toLocaleTimeString()}] Reassigned to new owner by ${actor.name}. Reason: ${reason}`;

    // Adjust active lead counts
    if (oldOwnerId) {
      const oldAvail = this.state.availabilities.find((a) => a.userId === oldOwnerId);
      if (oldAvail && oldAvail.currentActiveLeadCount > 0) {
        oldAvail.currentActiveLeadCount -= 1;
      }
    }
    const newAvail = this.state.availabilities.find((a) => a.userId === newOwnerId);
    if (newAvail) {
      newAvail.currentActiveLeadCount += 1;
      newAvail.lastAssignedAt = now.toISOString();
    }

    this.recordAudit(actor, 'LEAD_REASSIGNED', 'Lead', lead.id, oldState, lead);
    this.save();
    return { success: true };
  }

  public triggerEscalation(leadId: string, reason = 'SLA timeout breached'): void {
    const lead = this.state.leads.find((l) => l.id === leadId);
    if (!lead) return;

    const oldState = { ...lead };
    lead.status = 'ESCALATED';
    lead.escalationLevel = (lead.escalationLevel || 0) + 1;
    lead.lastEscalatedAt = new Date().toISOString();
    lead.notes = `${lead.notes || ''}\n[ESCALATION ENGINE] Lead escalated to Level ${lead.escalationLevel}. Reason: ${reason}`;
    lead.updatedAt = new Date().toISOString();

    this.recordAudit(
      { id: 'escalation_cron_worker', name: 'SLA Escalation Engine' },
      'LEAD_ESCALATED',
      'Lead',
      lead.id,
      oldState,
      lead
    );
    this.save();
  }

  // Users & Availabilities
  public getUsers(): User[] {
    return this.state.users.filter((u) => u.workspaceId === this.state.activeWorkspaceId);
  }

  public getAvailabilities(): EmployeeAvailability[] {
    return this.state.availabilities.filter((a) => a.workspaceId === this.state.activeWorkspaceId);
  }

  public updateAvailability(userId: string, status: EmployeeAvailability['status'], isEligible: boolean): void {
    const avail = this.state.availabilities.find((a) => a.userId === userId);
    if (avail) {
      avail.status = status;
      avail.isEligibleForAutoAssignment = isEligible;
      avail.updatedAt = new Date().toISOString();
      this.save();
    }
  }

  // CRM Contacts & Companies
  public getContacts(): Contact[] {
    return this.state.contacts.filter((c) => c.workspaceId === this.state.activeWorkspaceId);
  }

  public createContact(contact: Partial<Contact>, actor: { id: string; name: string }): Contact {
    const newContact: Contact = {
      id: `cont_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      workspaceId: this.state.activeWorkspaceId,
      companyId: contact.companyId,
      firstName: contact.firstName || 'New',
      lastName: contact.lastName || 'Contact',
      email: contact.email || 'contact@example.com',
      phone: contact.phone,
      title: contact.title,
      preferredChannel: contact.preferredChannel || 'SMS',
      tags: contact.tags || [],
      notes: contact.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.state.contacts.unshift(newContact);
    this.recordAudit(actor, 'CONTACT_CREATED' as AuditAction, 'Contact', newContact.id, undefined, newContact);
    this.save();
    return newContact;
  }

  public getCompanies(): Company[] {
    return this.state.companies.filter((c) => c.workspaceId === this.state.activeWorkspaceId);
  }

  public createCompany(company: Partial<Company>, actor: { id: string; name: string }): Company {
    const newComp: Company = {
      id: `comp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      workspaceId: this.state.activeWorkspaceId,
      name: company.name || 'New Company',
      domain: company.domain,
      industry: company.industry,
      size: company.size || '11-50',
      phone: company.phone,
      website: company.website,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.state.companies.unshift(newComp);
    this.recordAudit(actor, 'COMPANY_CREATED' as AuditAction, 'Company', newComp.id, undefined, newComp);
    this.save();
    return newComp;
  }

  // Pipelines & Opportunities
  public getPipelines(): Pipeline[] {
    return this.state.pipelines.filter((p) => p.workspaceId === this.state.activeWorkspaceId);
  }

  public getOpportunities(): Opportunity[] {
    return this.state.opportunities.filter((o) => o.workspaceId === this.state.activeWorkspaceId);
  }

  public moveOpportunityStage(opportunityId: string, newStageId: string, actor: { id: string; name: string }): { success: boolean; error?: string } {
    const opp = this.state.opportunities.find((o) => o.id === opportunityId);
    if (!opp) return { success: false, error: 'Opportunity not found' };

    // Stage-specific required fields validation
    const requiredField = this.state.customFields.find((f) => f.requiredForStageId === newStageId);
    if (requiredField) {
      // Check if custom field exists on linked lead or opportunity notes
      if (!opp.notes?.includes(requiredField.label) && !opp.expectedCloseDate) {
        return {
          success: false,
          error: `Stage Progression Blocked: Stage requires '${requiredField.label}' to be specified prior to advancement.`,
        };
      }
    }

    const oldState = { ...opp };
    opp.stageId = newStageId;
    opp.updatedAt = new Date().toISOString();

    // Check if stage is won or lost
    const pipeline = this.state.pipelines.find((p) => p.id === opp.pipelineId);
    const stage = pipeline?.stages.find((s) => s.id === newStageId);
    if (stage?.isWonStage) {
      opp.status = 'WON';
      opp.actualCloseDate = new Date().toISOString();
    } else if (stage?.isLostStage) {
      opp.status = 'LOST';
      opp.actualCloseDate = new Date().toISOString();
    } else {
      opp.status = 'OPEN';
    }

    this.recordAudit(actor, 'OPPORTUNITY_STAGE_CHANGED', 'Opportunity', opp.id, oldState, opp);
    this.save();
    return { success: true };
  }

  // Custom Fields
  public getCustomFields(): CustomFieldDefinition[] {
    return this.state.customFields.filter((cf) => cf.workspaceId === this.state.activeWorkspaceId);
  }

  public createCustomField(field: Omit<CustomFieldDefinition, 'id' | 'workspaceId'>): CustomFieldDefinition {
    const newField: CustomFieldDefinition = {
      ...field,
      id: `cf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      workspaceId: this.state.activeWorkspaceId,
    };
    this.state.customFields.push(newField);
    this.save();
    return newField;
  }

  // Integrations: Payments (Stripe Test Mode)
  public getPayments(): Payment[] {
    return this.state.payments.filter((p) => p.workspaceId === this.state.activeWorkspaceId);
  }

  public createStripeTestPayment(amountDollars: number, customerEmail: string, description: string, actor: { id: string; name: string }): Payment {
    const newPayment: Payment = {
      id: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      workspaceId: this.state.activeWorkspaceId,
      amount: Math.round(amountDollars * 100),
      currency: 'usd',
      status: 'SUCCEEDED',
      stripePaymentIntentId: `pi_test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      stripeMode: 'test',
      receiptEmail: customerEmail,
      description,
      refundedAmount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.state.payments.unshift(newPayment);
    this.recordAudit(actor, 'PAYMENT_PROCESSED', 'Payment', newPayment.id, undefined, newPayment);
    this.save();
    return newPayment;
  }

  // Integrations: Messaging
  public getMessages(leadId?: string): Message[] {
    const all = this.state.messages.filter((m) => m.workspaceId === this.state.activeWorkspaceId);
    if (leadId) return all.filter((m) => m.leadId === leadId);
    return all;
  }

  public sendMessage(payload: { leadId?: string; contactId?: string; channel: Message['channel']; recipient: string; body: string }, actor: { id: string; name: string }): Message {
    const now = new Date();
    const newMsg: Message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      workspaceId: this.state.activeWorkspaceId,
      leadId: payload.leadId,
      contactId: payload.contactId,
      channel: payload.channel,
      direction: 'OUTBOUND',
      sender: payload.channel === 'TWILIO_SMS' ? '+15550001122' : '@NesconLeadGuardBot',
      recipient: payload.recipient,
      body: payload.body,
      status: 'DELIVERED',
      externalMessageId: `ext_${Date.now()}`,
      sentAt: now.toISOString(),
      deliveredAt: new Date(now.getTime() + 1500).toISOString(),
      createdAt: now.toISOString(),
    };
    this.state.messages.push(newMsg);
    this.recordAudit(actor, 'MESSAGE_SENT', 'Message', newMsg.id, undefined, newMsg);
    this.save();
    return newMsg;
  }

  // Integrations: Appointments
  public getAppointments(): Appointment[] {
    return this.state.appointments.filter((a) => a.workspaceId === this.state.activeWorkspaceId);
  }

  public createAppointment(apt: Partial<Appointment>, actor: { id: string; name: string }): Appointment {
    const now = new Date();
    const newApt: Appointment = {
      id: `apt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      workspaceId: this.state.activeWorkspaceId,
      leadId: apt.leadId,
      contactId: apt.contactId,
      assignedUserId: apt.assignedUserId || actor.id,
      title: apt.title || 'Consultation Meeting',
      description: apt.description,
      startTime: apt.startTime || new Date(now.getTime() + 24 * 3600 * 1000).toISOString(),
      endTime: apt.endTime || new Date(now.getTime() + 25 * 3600 * 1000).toISOString(),
      timezone: 'America/New_York',
      location: apt.location || 'Client Facility',
      meetingLink: apt.meetingLink,
      status: 'CONFIRMED',
      googleCalendarEventId: `gcal_${Date.now()}`,
      googleCalendarSyncStatus: 'SYNCED',
      lastSyncedAt: now.toISOString(),
      notes: apt.notes,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    this.state.appointments.unshift(newApt);
    this.recordAudit(actor, 'APPOINTMENT_SCHEDULED', 'Appointment', newApt.id, undefined, newApt);
    this.save();
    return newApt;
  }

  // Audit Events
  public getAuditEvents(): AuditEvent[] {
    return this.state.auditEvents.filter((a) => a.workspaceId === this.state.activeWorkspaceId);
  }

  private recordAudit(
    actor: { id: string; name: string },
    action: AuditAction,
    entityType: string,
    entityId: string,
    previousState?: unknown,
    newState?: unknown
  ): void {
    const event: AuditEvent = {
      id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      workspaceId: this.state.activeWorkspaceId,
      actor: {
        id: actor.id,
        name: actor.name,
        type: actor.id.includes('cron') || actor.id.includes('system') ? 'SYSTEM' : 'USER',
      },
      action,
      entityType,
      entityId,
      previousState: previousState as Record<string, unknown>,
      newState: newState as Record<string, unknown>,
      timestamp: new Date().toISOString(),
    };
    this.state.auditEvents.unshift(event);
  }

  public mergeBackendLeads(backendLeads: BackendLead[]): void {
    const activeWsId = this.state.activeWorkspaceId;
    const mappedLeads: Lead[] = (backendLeads || []).map((bl) => {
      const escalations = bl.escalationCount ?? 0;
      // Display status: an assigned lead that has escalated is shown as ESCALATED.
      const status = bl.status === 'ASSIGNED' && escalations > 0 ? 'ESCALATED' : bl.status;
      return {
        id: bl.id,
        workspaceId: activeWsId,
        title: bl.title || 'Untitled Lead',
        contactName: bl.contactName || 'Anonymous',
        contactEmail: bl.contactEmail || '',
        contactPhone: bl.contactPhone ?? undefined,
        source: bl.source as unknown as Lead['source'],
        // The backend has no priority field; urgency is derived from escalations.
        priority: escalations >= 2 ? 'CRITICAL' : escalations === 1 ? 'HIGH' : 'MEDIUM',
        status: status as Lead['status'],
        currentOwnerId: bl.currentOwnerId || bl.owner?.id || undefined,
        assignedAt: bl.lastAssignedAt || undefined,
        acknowledgementDeadline: bl.ackDeadline || undefined,
        acknowledgedAt: bl.acknowledgedAt || undefined,
        escalationLevel: bl.escalationLevel ?? 0,
        contactId: bl.contactId || undefined,
        notes: bl.message || '',
        tags: escalations ? [`Escalated ${escalations}x`] : [],
        createdAt: bl.createdAt,
        updatedAt: bl.updatedAt,
      };
    });
    this.state.leads = mappedLeads;
    this.save();
  }

  public mergeBackendTeam(backendMembers: BackendTeamMember[]): void {
    if (!backendMembers) return;
    const activeWsId = this.state.activeWorkspaceId;
    const mappedUsers: User[] = backendMembers.map((bm) => ({
      id: bm.userId,
      workspaceId: activeWsId,
      email: bm.email || '',
      firstName: bm.name.split(' ')[0] || bm.name,
      lastName: bm.name.split(' ').slice(1).join(' ') || '',
      status: bm.status,
      roleId: bm.role?.id || `role_${bm.baseLevel.toLowerCase()}`,
      role: {
        id: bm.role?.id || `role_${bm.baseLevel.toLowerCase()}`,
        workspaceId: activeWsId,
        name: bm.role?.name || bm.baseLevel,
        type: bm.baseLevel === 'OWNER' ? 'OWNER' : bm.baseLevel === 'ADMIN' ? 'ADMIN' : 'AGENT',
        description: bm.role?.name || bm.baseLevel,
        permissions: [],
        isSystemRole: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    const mappedAvailabilities: EmployeeAvailability[] = backendMembers.map((bm) => ({
      id: `avail_${bm.userId}`,
      workspaceId: activeWsId,
      userId: bm.userId,
      // ON_LEAVE is shown with the shared contract's AWAY value (labelled "ON LEAVE" in the UI).
      status: bm.availability === 'ON_LEAVE' ? 'AWAY' : bm.availability,
      statusReason: bm.telegramConfigured ? 'Telegram alerts linked' : 'Telegram not linked',
      isEligibleForAutoAssignment: bm.autoAssignEnabled,
      maxConcurrentActiveLeads: bm.maxOpenLeads || 10,
      currentActiveLeadCount: bm.openLeads || 0,
      shifts: [],
      updatedAt: bm.availabilityChangedAt || new Date().toISOString(),
    }));

    this.state.users = mappedUsers;
    this.state.availabilities = mappedAvailabilities;
    this.save();
  }
}

export const appStore = new AppStore();
