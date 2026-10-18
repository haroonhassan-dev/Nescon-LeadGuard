/**
 * Lead service: the stable entry points other modules (and the Integrations Developer) call.
 *
 *   ingestLead()        create a lead from any intake source and assign it (F3.1)
 *   recordLeadAction()  log a note / message / call / appointment; by the owner it counts as
 *                       acknowledgement (glossary: "Acknowledged")
 */
import { Lead, LeadSource, Prisma } from '@prisma/client';
import { prisma, Tx, isUniqueViolation } from '../../lib/prisma';
import { AuditActor, recordAudit } from '../../lib/audit';
import { AppError } from '../../middleware/errorHandler';
import { Effects, LeadConflictError, assignUnowned, lockWorkspace, runLeadTx, transferOwnership, findDesignated } from './engine';
import { getSettings } from './settings';

export interface IngestLeadInput {
  workspaceId: string;
  source: LeadSource;
  contactName: string;
  contactEmail?: string | null;
  contactPhone?: string | null; // E.164 preferred
  message?: string | null;
  title?: string;
  /** Provider id (e.g. Twilio MessageSid). The same key never creates a second lead (I1.8). */
  intakeKey?: string | null;
  actor: AuditActor;
}

async function matchOrCreateContact(tx: Tx, input: IngestLeadInput) {
  const or: Prisma.ContactWhereInput[] = [];
  if (input.contactPhone) or.push({ phone: input.contactPhone });
  if (input.contactEmail) or.push({ email: input.contactEmail.toLowerCase() });
  if (or.length > 0) {
    const existing = await tx.contact.findFirst({ where: { workspaceId: input.workspaceId, OR: or } });
    if (existing) return existing;
  }
  const [firstName, ...rest] = input.contactName.trim().split(/\s+/);
  return tx.contact.create({
    data: {
      workspaceId: input.workspaceId,
      firstName: firstName || input.contactName,
      lastName: rest.join(' '),
      email: input.contactEmail?.toLowerCase() ?? null,
      phone: input.contactPhone ?? null,
    },
  });
}

export async function ingestLead(input: IngestLeadInput): Promise<{ lead: Lead; duplicate: boolean }> {
  if (input.intakeKey) {
    const existing = await prisma.lead.findUnique({
      where: { workspaceId_intakeKey: { workspaceId: input.workspaceId, intakeKey: input.intakeKey } },
    });
    if (existing) return { lead: existing, duplicate: true };
  }

  try {
    const lead = await runLeadTx(async (tx, effects) => {
      const contact = await matchOrCreateContact(tx, input);
      const created = await tx.lead.create({
        data: {
          workspaceId: input.workspaceId,
          title: input.title?.trim() || `New ${input.source.replace('_', ' ').toLowerCase()} lead from ${input.contactName}`,
          contactName: input.contactName,
          contactEmail: input.contactEmail?.toLowerCase() ?? null,
          contactPhone: input.contactPhone ?? null,
          message: input.message ?? null,
          source: input.source,
          contactId: contact.id,
          createdById: input.actor.type === 'USER' ? input.actor.id ?? null : null,
          intakeKey: input.intakeKey ?? null,
        },
      });
      await tx.leadActivity.create({
        data: {
          workspaceId: input.workspaceId,
          leadId: created.id,
          actorType: input.actor.type,
          actorId: input.actor.id ?? null,
          kind: 'CREATED',
          body: `Lead captured from ${input.source}`,
          data: { source: input.source },
        },
      });
      await recordAudit(tx, {
        workspaceId: input.workspaceId,
        actor: input.actor,
        action: 'LEAD_CREATED',
        entityType: 'Lead',
        entityId: created.id,
        after: { title: created.title, source: created.source, contactId: contact.id },
      });
      effects.push({ type: 'lead.created', workspaceId: input.workspaceId, leadId: created.id });

      await lockWorkspace(tx, input.workspaceId);
      const settings = await getSettings(tx, input.workspaceId);
      return assignUnowned(tx, created, settings, { type: 'SYSTEM', id: null, name: 'assignment engine' }, effects);
    });
    return { lead, duplicate: false };
  } catch (err) {
    // Two deliveries of the same webhook raced: the loser returns the winner's lead.
    if ((err instanceof LeadConflictError || isUniqueViolation(err)) && input.intakeKey) {
      const existing = await prisma.lead.findUnique({
        where: { workspaceId_intakeKey: { workspaceId: input.workspaceId, intakeKey: input.intakeKey } },
      });
      if (existing) return { lead: existing, duplicate: true };
    }
    throw err;
  }
}

/** Marks the current assignment acknowledged. Caller must hold the lead in this transaction. */
async function acknowledgeInTx(tx: Tx, lead: Lead, actor: AuditActor, via: string, effects: Effects): Promise<Lead> {
  const now = new Date();
  const updated = await tx.lead.updateMany({
    where: { id: lead.id, version: lead.version, status: 'ASSIGNED', currentOwnerId: lead.currentOwnerId },
    data: {
      status: 'ACKNOWLEDGED',
      acknowledgedAt: now,
      firstAcknowledgedAt: lead.firstAcknowledgedAt ?? now,
      ackDeadline: null,
      escalationExhausted: false,
      lastActivityAt: now,
      version: { increment: 1 },
    },
  });
  if (updated.count === 0) throw new LeadConflictError();

  await tx.leadAssignment.updateMany({
    where: { leadId: lead.id, seq: lead.assignmentSeq, acknowledgedAt: null },
    data: { acknowledgedAt: now },
  });
  await tx.leadActivity.create({
    data: {
      workspaceId: lead.workspaceId,
      leadId: lead.id,
      actorType: actor.type,
      actorId: actor.id ?? null,
      kind: 'ACKNOWLEDGED',
      body: via === 'BUTTON' ? 'Acknowledged' : `Acknowledged by recorded action (${via.toLowerCase()})`,
    },
  });
  await recordAudit(tx, {
    workspaceId: lead.workspaceId,
    actor,
    action: 'LEAD_ACKNOWLEDGED',
    entityType: 'Lead',
    entityId: lead.id,
    before: { status: lead.status, ackDeadline: lead.ackDeadline?.toISOString() ?? null },
    after: { status: 'ACKNOWLEDGED', acknowledgedAt: now.toISOString(), via },
  });
  effects.push({ type: 'lead.acknowledged', workspaceId: lead.workspaceId, leadId: lead.id, userId: lead.currentOwnerId });
  return tx.lead.findUniqueOrThrow({ where: { id: lead.id } });
}

async function loadLead(tx: Tx, workspaceId: string, leadId: string): Promise<Lead> {
  // Row lock: serializes with the escalation worker for this lead.
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM leads WHERE id = ${leadId} AND "workspaceId" = ${workspaceId} FOR UPDATE`;
  if (rows.length === 0) throw new AppError('Lead not found', 404, 'NOT_FOUND');
  return tx.lead.findUniqueOrThrow({ where: { id: leadId } });
}

/** POST /leads/:id/acknowledge. Only the current owner acknowledges. Idempotent. */
export async function acknowledgeLead(workspaceId: string, leadId: string, actor: AuditActor & { id: string }) {
  return runLeadTx(async (tx, effects) => {
    const lead = await loadLead(tx, workspaceId, leadId);
    if (lead.currentOwnerId !== actor.id) {
      throw new AppError('Only the current owner can acknowledge this lead', 403, 'NOT_LEAD_OWNER');
    }
    if (lead.status === 'ACKNOWLEDGED') return lead;
    if (lead.status !== 'ASSIGNED') throw new AppError(`Lead is ${lead.status.toLowerCase()}`, 409, 'LEAD_STATE_CHANGED');
    return acknowledgeInTx(tx, lead, actor, 'BUTTON', effects);
  });
}

export interface LeadActionInput {
  workspaceId: string;
  leadId: string;
  actor: AuditActor;
  kind: 'NOTE' | 'MESSAGE' | 'CALL' | 'STAGE_CHANGE' | 'APPOINTMENT';
  body?: string;
  data?: Prisma.InputJsonValue;
}

/**
 * Records an action on a lead. When the current owner performs it while the lead is waiting
 * for acknowledgement, it acknowledges the lead and stops the escalation timer.
 */
export async function recordLeadAction(input: LeadActionInput): Promise<Lead> {
  return runLeadTx(async (tx, effects) => {
    let lead = await loadLead(tx, input.workspaceId, input.leadId);
    await tx.leadActivity.create({
      data: {
        workspaceId: input.workspaceId,
        leadId: lead.id,
        actorType: input.actor.type,
        actorId: input.actor.id ?? null,
        kind: input.kind,
        body: input.body,
        data: input.data,
      },
    });
    await tx.lead.update({ where: { id: lead.id }, data: { lastActivityAt: new Date() } });
    lead = await tx.lead.findUniqueOrThrow({ where: { id: lead.id } });
    effects.push({ type: 'lead.activity', workspaceId: input.workspaceId, leadId: lead.id, userId: input.actor.id ?? null });

    if (lead.status === 'ASSIGNED' && input.actor.type === 'USER' && input.actor.id === lead.currentOwnerId) {
      lead = await acknowledgeInTx(tx, lead, input.actor, input.kind, effects);
    }
    return lead;
  });
}

/** POST /leads/:id/claim. An unassigned lead is taken by an Available employee and starts acknowledged. */
export async function claimLead(workspaceId: string, leadId: string, actor: AuditActor & { id: string }) {
  return runLeadTx(async (tx, effects) => {
    await lockWorkspace(tx, workspaceId);
    const lead = await loadLead(tx, workspaceId, leadId);
    if (lead.status !== 'UNASSIGNED') {
      throw new AppError('The lead already has an owner', 409, 'LEAD_ALREADY_CLAIMED', [
        { field: 'leadId', message: `Owned by user ${lead.currentOwnerId ?? 'unknown'}`, code: 'CONCURRENT_CLAIM_CONFLICT' },
      ]);
    }
    const member = await tx.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId: actor.id } } });
    if (member?.availability !== 'AVAILABLE') {
      throw new AppError('Set your status to Available before claiming leads', 409, 'NOT_AVAILABLE');
    }
    const settings = await getSettings(tx, workspaceId);
    return transferOwnership(tx, lead, {
      toUserId: actor.id,
      kind: 'CLAIM',
      level: 0,
      reason: 'Claimed',
      endReason: 'REASSIGNED',
      actor,
      settings,
      effects,
      acknowledged: true,
    });
  });
}

/** POST /leads/:id/reassign. Manual reassignment; counted separately from escalations. */
export async function reassignLead(workspaceId: string, leadId: string, toUserId: string, reason: string, actor: AuditActor) {
  return runLeadTx(async (tx, effects) => {
    await lockWorkspace(tx, workspaceId);
    const lead = await loadLead(tx, workspaceId, leadId);
    if (lead.status === 'CLOSED') throw new AppError('Closed leads cannot be reassigned', 409, 'LEAD_STATE_CHANGED');
    if (lead.currentOwnerId === toUserId) throw new AppError('The lead already belongs to this employee', 409, 'NO_CHANGE');
    // Not On leave / Offline / suspended: F3.3 "employees who are not Available never receive leads"
    // is relaxed to allow Busy for an explicit manager decision.
    if (!(await findDesignated(tx, workspaceId, toUserId))) {
      throw new AppError('That employee is not active or is On leave / Offline', 409, 'ASSIGNEE_UNAVAILABLE');
    }
    const settings = await getSettings(tx, workspaceId);
    return transferOwnership(tx, lead, {
      toUserId,
      kind: 'MANUAL',
      level: 0,
      reason: `Reassigned manually: ${reason}`,
      endReason: 'REASSIGNED',
      actor,
      settings,
      effects,
    });
  });
}

/** POST /leads/:id/close. Frees the owner's capacity. */
export async function closeLead(workspaceId: string, leadId: string, outcome: string, actor: AuditActor) {
  return runLeadTx(async (tx, effects) => {
    const lead = await loadLead(tx, workspaceId, leadId);
    if (lead.status === 'CLOSED') return lead;
    const now = new Date();
    const updated = await tx.lead.updateMany({
      where: { id: lead.id, version: lead.version },
      data: { status: 'CLOSED', closedAt: now, ackDeadline: null, lastActivityAt: now, version: { increment: 1 } },
    });
    if (updated.count === 0) throw new LeadConflictError();
    await tx.leadAssignment.updateMany({
      where: { leadId: lead.id, seq: lead.assignmentSeq, endedAt: null },
      data: { endedAt: now, endReason: 'CLOSED' },
    });
    await tx.leadActivity.create({
      data: { workspaceId, leadId, actorType: actor.type, actorId: actor.id ?? null, kind: 'CLOSED', body: outcome },
    });
    await recordAudit(tx, {
      workspaceId,
      actor,
      action: 'LEAD_CLOSED',
      entityType: 'Lead',
      entityId: leadId,
      before: { status: lead.status },
      after: { status: 'CLOSED', outcome },
    });
    effects.push({ type: 'lead.activity', workspaceId, leadId, userId: lead.currentOwnerId });
    return tx.lead.findUniqueOrThrow({ where: { id: leadId } });
  });
}

/** API shape for a lead, including the live countdown (F3.4). */
export function presentLead(lead: Lead & { currentOwner?: { id: string; firstName: string; lastName: string } | null }) {
  const now = Date.now();
  return {
    id: lead.id,
    title: lead.title,
    contactName: lead.contactName,
    contactEmail: lead.contactEmail,
    contactPhone: lead.contactPhone,
    message: lead.message,
    source: lead.source,
    status: lead.status,
    contactId: lead.contactId,
    owner: lead.currentOwner
      ? { id: lead.currentOwner.id, name: `${lead.currentOwner.firstName} ${lead.currentOwner.lastName}`.trim() }
      : null,
    currentOwnerId: lead.currentOwnerId,
    escalationLevel: lead.escalationLevel,
    escalationCount: lead.escalationCount,
    manualReassignCount: lead.manualReassignCount,
    escalationExhausted: lead.escalationExhausted,
    firstAssignedAt: lead.firstAssignedAt?.toISOString() ?? null,
    lastAssignedAt: lead.lastAssignedAt?.toISOString() ?? null,
    ackDeadline: lead.ackDeadline?.toISOString() ?? null,
    remainingSeconds: lead.ackDeadline ? Math.max(0, Math.round((lead.ackDeadline.getTime() - now) / 1000)) : null,
    acknowledgedAt: lead.acknowledgedAt?.toISOString() ?? null,
    firstAcknowledgedAt: lead.firstAcknowledgedAt?.toISOString() ?? null,
    lastActivityAt: lead.lastActivityAt.toISOString(),
    closedAt: lead.closedAt?.toISOString() ?? null,
    version: lead.version,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  };
}
