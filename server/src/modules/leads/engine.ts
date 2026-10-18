/**
 * Lead assignment engine: the rules that guarantee one accountable owner per lead.
 *
 * Safety model (Q5, F3.8):
 *  - Every ownership change runs in a DB transaction that first takes a per-workspace
 *    advisory lock, so two assignment decisions in one workspace never interleave
 *    (no double-booking past a capacity limit, no two owners).
 *  - Each change inserts LeadAssignment(seq = previous + 1). UNIQUE(leadId, seq) means two
 *    workers acting on the same assignment cannot both succeed: one gets a conflict and rolls back.
 *  - The lead row is updated with `WHERE version = <read version>`; a stale writer changes 0 rows
 *    and rolls back.
 *  - Deadlines live in the database, so a restart loses nothing: the worker finds overdue leads again.
 */
import { AssignmentKind, Lead, Prisma } from '@prisma/client';
import { prisma, Tx, isUniqueViolation } from '../../lib/prisma';
import { AuditActor, recordAudit } from '../../lib/audit';
import { RealtimeEvent, publishAll } from '../../lib/events';
import { AppError } from '../../middleware/errorHandler';
import { ResolvedSettings, getSettings, timeoutForLevel } from './settings';

export type Effects = Array<Omit<RealtimeEvent, 'at'>>;

export const OPEN_STATUSES = ['ASSIGNED', 'ACKNOWLEDGED'] as const;

export class LeadConflictError extends AppError {
  constructor(message = 'The lead changed while this action was running. Refresh and try again.') {
    super(message, 409, 'LEAD_STATE_CHANGED');
  }
}

/**
 * Runs `fn` in a transaction with timeouts sized for a remote database, then publishes
 * real-time events only after the commit succeeded.
 */
export async function runLeadTx<T>(fn: (tx: Tx, effects: Effects) => Promise<T>): Promise<T> {
  const effects: Effects = [];
  try {
    const result = await prisma.$transaction((tx) => fn(tx, effects), { maxWait: 10_000, timeout: 30_000 });
    publishAll(effects);
    return result;
  } catch (err) {
    if (isUniqueViolation(err)) throw new LeadConflictError();
    throw err;
  }
}

/** Serializes assignment decisions within one workspace for the rest of the transaction. */
export async function lockWorkspace(tx: Tx, workspaceId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${workspaceId}))`;
}

async function openLeadCounts(tx: Tx, workspaceId: string, userIds: string[]): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const rows = await tx.lead.groupBy({
    by: ['currentOwnerId'],
    where: { workspaceId, currentOwnerId: { in: userIds }, status: { in: [...OPEN_STATUSES] } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.currentOwnerId as string, r._count._all]));
}

/**
 * Round-robin (F3.3): among ACTIVE members who are Available, opted in to auto-assignment and
 * below their open-lead limit, pick the one who received a lead least recently.
 */
export async function findRoundRobinCandidate(
  tx: Tx,
  settings: ResolvedSettings,
  excludeUserIds: string[] = []
): Promise<string | null> {
  const candidates = await tx.membership.findMany({
    where: {
      workspaceId: settings.workspaceId,
      status: 'ACTIVE',
      availability: 'AVAILABLE',
      autoAssignEnabled: true,
      userId: { notIn: excludeUserIds },
    },
    orderBy: [{ lastAssignedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
    select: { userId: true, maxOpenLeads: true },
  });
  const counts = await openLeadCounts(tx, settings.workspaceId, candidates.map((c) => c.userId));
  const chosen = candidates.find(
    (c) => (counts.get(c.userId) ?? 0) < (c.maxOpenLeads ?? settings.maxOpenLeadsPerUser)
  );
  return chosen?.userId ?? null;
}

/**
 * Designated backup / manager. They are the safety net, so the capacity limit does not apply,
 * but someone On leave or Offline is never given a lead.
 */
export async function findDesignated(tx: Tx, workspaceId: string, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const member = await tx.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { status: true, availability: true },
  });
  if (!member || member.status !== 'ACTIVE') return null;
  return member.availability === 'AVAILABLE' || member.availability === 'BUSY' ? userId : null;
}

async function userName(tx: Tx, userId: string | null): Promise<string> {
  if (!userId) return 'nobody';
  const user = await tx.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
  return user ? `${user.firstName} ${user.lastName}`.trim() : 'unknown user';
}

const AUDIT_ACTION: Record<AssignmentKind, string> = {
  INITIAL: 'LEAD_ASSIGNED',
  RECOVERY: 'LEAD_ASSIGNED',
  ESCALATION: 'LEAD_ESCALATED',
  MANUAL: 'LEAD_REASSIGNED',
  OWNER_UNAVAILABLE: 'LEAD_REASSIGNED',
  CLAIM: 'LEAD_CLAIMED',
};

const ACTIVITY_KIND: Record<AssignmentKind, string> = {
  INITIAL: 'ASSIGNED',
  RECOVERY: 'ASSIGNED',
  ESCALATION: 'ESCALATED',
  MANUAL: 'REASSIGNED',
  OWNER_UNAVAILABLE: 'REASSIGNED',
  CLAIM: 'ASSIGNED',
};

interface TransferOptions {
  toUserId: string | null;
  kind: AssignmentKind;
  level: number;
  reason: string;
  /** Why the previous assignment ended. */
  endReason: string;
  actor: AuditActor;
  settings: ResolvedSettings;
  effects: Effects;
  /** CLAIM: the claimer is acting on it now, so it starts acknowledged. */
  acknowledged?: boolean;
}

/**
 * The single place where ownership changes. Ends the previous assignment, writes the new
 * one, updates the lead conditionally, and records activity, audit and (for escalations)
 * the outbound alert, all in the caller's transaction.
 */
export async function transferOwnership(tx: Tx, lead: Lead, opts: TransferOptions): Promise<Lead> {
  const now = new Date();
  const seq = lead.assignmentSeq + 1;
  const deadline =
    opts.toUserId && !opts.acknowledged ? new Date(now.getTime() + timeoutForLevel(opts.settings, opts.level) * 1000) : null;

  if (lead.assignmentSeq > 0) {
    await tx.leadAssignment.updateMany({
      where: { leadId: lead.id, seq: lead.assignmentSeq, endedAt: null },
      data: { endedAt: now, endReason: opts.endReason },
    });
  }

  // Unique (leadId, seq): a concurrent transfer of the same assignment fails here.
  await tx.leadAssignment.create({
    data: {
      workspaceId: lead.workspaceId,
      leadId: lead.id,
      seq,
      userId: opts.toUserId,
      kind: opts.kind,
      level: opts.level,
      reason: opts.reason,
      assignedAt: now,
      deadline,
      acknowledgedAt: opts.acknowledged ? now : null,
    },
  });

  const data: Prisma.LeadUncheckedUpdateManyInput = {
    currentOwnerId: opts.toUserId,
    assignmentSeq: seq,
    escalationLevel: opts.level,
    ackDeadline: deadline,
    acknowledgedAt: opts.acknowledged ? now : null,
    lastActivityAt: now,
    version: { increment: 1 },
  };
  if (opts.toUserId) {
    data.status = opts.acknowledged ? 'ACKNOWLEDGED' : 'ASSIGNED';
    data.lastAssignedAt = now;
    if (!lead.firstAssignedAt) data.firstAssignedAt = now;
    if (opts.acknowledged && !lead.firstAcknowledgedAt) data.firstAcknowledgedAt = now;
    if (opts.kind !== 'ESCALATION') data.escalationExhausted = false;
  } else {
    data.status = 'UNASSIGNED';
  }
  if (opts.kind === 'ESCALATION') data.escalationCount = { increment: 1 };
  if (opts.kind === 'MANUAL') data.manualReassignCount = { increment: 1 };

  const updated = await tx.lead.updateMany({ where: { id: lead.id, version: lead.version }, data });
  if (updated.count === 0) throw new LeadConflictError();

  if (opts.toUserId) {
    await tx.membership.updateMany({
      where: { workspaceId: lead.workspaceId, userId: opts.toUserId },
      data: { lastAssignedAt: now },
    });
  }

  const [fromName, toName] = await Promise.all([userName(tx, lead.currentOwnerId), userName(tx, opts.toUserId)]);
  const activityKind = opts.toUserId ? ACTIVITY_KIND[opts.kind] : 'UNASSIGNED';
  await tx.leadActivity.create({
    data: {
      workspaceId: lead.workspaceId,
      leadId: lead.id,
      actorType: opts.actor.type,
      actorId: opts.actor.id ?? null,
      kind: activityKind,
      body: opts.toUserId ? `${opts.reason} → ${toName}` : opts.reason,
      data: { from: lead.currentOwnerId, to: opts.toUserId, level: opts.level, seq, deadline: deadline?.toISOString() ?? null },
    },
  });

  await recordAudit(tx, {
    workspaceId: lead.workspaceId,
    actor: opts.actor,
    action: opts.toUserId ? AUDIT_ACTION[opts.kind] : 'LEAD_UNASSIGNED',
    entityType: 'Lead',
    entityId: lead.id,
    before: { ownerId: lead.currentOwnerId, ownerName: fromName, status: lead.status, level: lead.escalationLevel },
    after: {
      ownerId: opts.toUserId,
      ownerName: opts.toUserId ? toName : null,
      status: data.status,
      level: opts.level,
      reason: opts.reason,
      deadline: deadline?.toISOString() ?? null,
    },
  });

  if (opts.kind === 'ESCALATION' && opts.toUserId) {
    // Outbox row: committed with the escalation, delivered by the worker afterwards (F3.9).
    await tx.notification.create({
      data: {
        workspaceId: lead.workspaceId,
        leadId: lead.id,
        recipientUserId: opts.toUserId,
        kind: 'ESCALATION',
        dedupeKey: `escalation:${lead.id}:${seq}`,
        payload: { leadTitle: lead.title, source: lead.source, reason: opts.reason, previousOwner: fromName },
      },
    });
  }

  opts.effects.push({
    type: opts.toUserId ? (opts.kind === 'ESCALATION' ? 'lead.escalated' : 'lead.assigned') : 'lead.unassigned',
    workspaceId: lead.workspaceId,
    leadId: lead.id,
    userId: opts.toUserId,
    previousUserId: lead.currentOwnerId,
  });

  return tx.lead.findUniqueOrThrow({ where: { id: lead.id } });
}

/** First (or recovery) assignment for a lead with no owner. Leaves it unassigned if nobody is eligible. */
export async function assignUnowned(
  tx: Tx,
  lead: Lead,
  settings: ResolvedSettings,
  actor: AuditActor,
  effects: Effects
): Promise<Lead> {
  const candidate = await findRoundRobinCandidate(tx, settings);
  if (!candidate) return lead;
  const recovery = lead.assignmentSeq > 0;
  return transferOwnership(tx, lead, {
    toUserId: candidate,
    kind: recovery ? 'RECOVERY' : 'INITIAL',
    level: 0,
    reason: recovery ? 'Assigned from the recovery queue (round-robin)' : 'Assigned by round-robin',
    endReason: 'REASSIGNED',
    actor,
    settings,
    effects,
  });
}

/**
 * Called when the acknowledgement window expired (F3.5). Walks the configured chain from the
 * next level, skipping steps with nobody eligible. If the chain is used up, the current owner
 * keeps the lead (it must always have an accountable person) and it is flagged for recovery.
 */
export async function escalateExpired(
  tx: Tx,
  lead: Lead,
  settings: ResolvedSettings,
  actor: AuditActor,
  effects: Effects
): Promise<Lead> {
  const previousTimeout = timeoutForLevel(settings, lead.escalationLevel);
  const ownerName = await userName(tx, lead.currentOwnerId);

  const timedOut = await tx.leadAssignment.findMany({
    where: { leadId: lead.id, endReason: 'ACK_TIMEOUT', userId: { not: null } },
    select: { userId: true },
  });
  const exclude = [...new Set([lead.currentOwnerId, ...timedOut.map((a) => a.userId)].filter(Boolean) as string[])];

  for (let level = lead.escalationLevel + 1; level <= settings.escalationLevels.length; level++) {
    const step = settings.escalationLevels[level - 1];
    const target =
      step.target === 'NEXT_ELIGIBLE'
        ? await findRoundRobinCandidate(tx, settings, exclude)
        : await findDesignated(tx, lead.workspaceId, step.target === 'BACKUP' ? settings.backupUserId : settings.managerUserId);
    if (!target || target === lead.currentOwnerId) continue;

    return transferOwnership(tx, lead, {
      toUserId: target,
      kind: 'ESCALATION',
      level,
      reason: `Not acknowledged by ${ownerName} within ${previousTimeout}s (escalation level ${level}: ${step.target})`,
      endReason: 'ACK_TIMEOUT',
      actor,
      settings,
      effects,
    });
  }

  // Chain exhausted: keep the owner, stop the timer, surface it in the recovery queue.
  const updated = await tx.lead.updateMany({
    where: { id: lead.id, version: lead.version },
    data: { escalationExhausted: true, ackDeadline: null, version: { increment: 1 } },
  });
  if (updated.count === 0) throw new LeadConflictError();
  await tx.leadActivity.create({
    data: {
      workspaceId: lead.workspaceId,
      leadId: lead.id,
      actorType: actor.type,
      actorId: actor.id ?? null,
      kind: 'ESCALATION_EXHAUSTED',
      body: `Not acknowledged by ${ownerName}, and no one further in the escalation chain is eligible. Lead stays with ${ownerName} and is in the recovery queue.`,
    },
  });
  await recordAudit(tx, {
    workspaceId: lead.workspaceId,
    actor,
    action: 'LEAD_ESCALATION_EXHAUSTED',
    entityType: 'Lead',
    entityId: lead.id,
    before: { ownerId: lead.currentOwnerId, level: lead.escalationLevel },
    after: { ownerId: lead.currentOwnerId, escalationExhausted: true },
  });
  effects.push({ type: 'lead.escalated', workspaceId: lead.workspaceId, leadId: lead.id, userId: lead.currentOwnerId });
  return tx.lead.findUniqueOrThrow({ where: { id: lead.id } });
}

/**
 * F3.6: an employee went On leave / Offline (or was suspended). Unacknowledged leads are
 * reassigned immediately; acknowledged ones follow the workspace policy.
 */
export async function reassignFromUnavailable(
  tx: Tx,
  workspaceId: string,
  userId: string,
  actor: AuditActor,
  effects: Effects
): Promise<number> {
  await lockWorkspace(tx, workspaceId);
  const settings = await getSettings(tx, workspaceId);
  const statuses = settings.acknowledgedLeadPolicy === 'REASSIGN' ? [...OPEN_STATUSES] : ['ASSIGNED' as const];
  const leads = await tx.lead.findMany({
    where: { workspaceId, currentOwnerId: userId, status: { in: statuses } },
    orderBy: { createdAt: 'asc' },
  });
  const ownerName = await userName(tx, userId);

  for (const lead of leads) {
    const target =
      (await findRoundRobinCandidate(tx, settings, [userId])) ??
      (await findDesignated(tx, workspaceId, settings.backupUserId === userId ? null : settings.backupUserId)) ??
      (await findDesignated(tx, workspaceId, settings.managerUserId === userId ? null : settings.managerUserId));
    await transferOwnership(tx, lead, {
      toUserId: target,
      kind: 'OWNER_UNAVAILABLE',
      level: 0,
      reason: target
        ? `${ownerName} became unavailable`
        : `${ownerName} became unavailable and no one else is available; lead is waiting in the recovery queue`,
      endReason: 'OWNER_UNAVAILABLE',
      actor,
      settings,
      effects,
    });
  }
  return leads.length;
}
