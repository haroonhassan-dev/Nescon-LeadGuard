/**
 * Durable escalation worker.
 *
 * There are no per-lead in-memory timers. Every tick asks the database "which deadlines have
 * passed?", so pending escalations survive restarts: on boot the first tick picks up anything
 * that expired while the server was down (Q5). Rows are taken with FOR UPDATE SKIP LOCKED,
 * so several server processes can run the worker without escalating the same lead twice.
 */
import { prisma } from '../../lib/prisma';
import { SYSTEM_ACTOR } from '../../lib/audit';
import { getNotificationSender, PermanentNotificationError, EscalationAlert } from '../../lib/notifications';
import { assignUnowned, escalateExpired, lockWorkspace, runLeadTx, LeadConflictError } from './engine';
import { getSettings } from './settings';

const ENGINE_ACTOR = { ...SYSTEM_ACTOR, name: 'escalation engine' };
const BATCH = 25;

export async function escalateIfDue(leadId: string): Promise<boolean> {
  return runLeadTx(async (tx, effects) => {
    const now = new Date();
    const rows = await tx.$queryRaw<Array<{ id: string; workspaceId: string }>>`
      SELECT id, "workspaceId" FROM leads
      WHERE id = ${leadId} AND status = 'ASSIGNED' AND "escalationExhausted" = false AND "ackDeadline" <= ${now}
      FOR UPDATE SKIP LOCKED`;
    if (rows.length === 0) return false; // acknowledged meanwhile, or another worker has it
    await lockWorkspace(tx, rows[0].workspaceId);
    const lead = await tx.lead.findUniqueOrThrow({ where: { id: leadId } });
    const settings = await getSettings(tx, lead.workspaceId);
    await escalateExpired(tx, lead, settings, ENGINE_ACTOR, effects);
    return true;
  });
}

export async function assignIfUnowned(leadId: string): Promise<boolean> {
  return runLeadTx(async (tx, effects) => {
    const rows = await tx.$queryRaw<Array<{ id: string; workspaceId: string }>>`
      SELECT id, "workspaceId" FROM leads WHERE id = ${leadId} AND status = 'UNASSIGNED' FOR UPDATE SKIP LOCKED`;
    if (rows.length === 0) return false;
    await lockWorkspace(tx, rows[0].workspaceId);
    const lead = await tx.lead.findUniqueOrThrow({ where: { id: leadId } });
    const settings = await getSettings(tx, lead.workspaceId);
    const after = await assignUnowned(tx, lead, settings, ENGINE_ACTOR, effects);
    return after.currentOwnerId !== null;
  });
}

async function processDueEscalations(): Promise<number> {
  const due = await prisma.lead.findMany({
    where: { status: 'ASSIGNED', escalationExhausted: false, ackDeadline: { lte: new Date() } },
    select: { id: true },
    orderBy: { ackDeadline: 'asc' },
    take: BATCH,
  });
  let escalated = 0;
  for (const { id } of due) {
    try {
      if (await escalateIfDue(id)) escalated++;
    } catch (err) {
      if (!(err instanceof LeadConflictError)) console.error(`[worker] escalation failed for lead ${id}`, err);
    }
  }
  return escalated;
}

async function processUnassigned(): Promise<void> {
  // Only worth trying in workspaces where someone is Available right now.
  const workspaces = await prisma.membership.findMany({
    where: { status: 'ACTIVE', availability: 'AVAILABLE', autoAssignEnabled: true },
    select: { workspaceId: true },
    distinct: ['workspaceId'],
  });
  if (workspaces.length === 0) return;
  const waiting = await prisma.lead.findMany({
    where: { status: 'UNASSIGNED', workspaceId: { in: workspaces.map((w) => w.workspaceId) } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: BATCH,
  });
  for (const { id } of waiting) {
    try {
      await assignIfUnowned(id);
    } catch (err) {
      if (!(err instanceof LeadConflictError)) console.error(`[worker] assignment failed for lead ${id}`, err);
    }
  }
}

const APP_BASE_URL = process.env.APP_BASE_URL || process.env.CORS_ORIGIN || 'http://localhost:5173';

/** Delivers outbox alerts with bounded, backed-off retries (I4.4). */
async function processNotifications(): Promise<void> {
  const due = await prisma.notification.findMany({
    where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: 'asc' },
    take: BATCH,
  });
  for (const n of due) {
    // Lease the row so a parallel worker does not send it too.
    const leased = await prisma.notification.updateMany({
      where: { id: n.id, status: 'PENDING', attempts: n.attempts },
      data: { attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + 60_000) },
    });
    if (leased.count === 0) continue;
    const attempt = n.attempts + 1;

    const sender = getNotificationSender();
    if (!sender) {
      await prisma.notification.update({
        where: { id: n.id },
        data: { status: 'NO_CHANNEL', lastError: 'No external notification provider is registered on the server' },
      });
      continue;
    }

    try {
      const [user, membership] = await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: n.recipientUserId } }),
        prisma.membership.findUnique({
          where: { workspaceId_userId: { workspaceId: n.workspaceId, userId: n.recipientUserId } },
        }),
      ]);
      const payload = n.payload as { leadTitle?: string; source?: string; reason?: string };
      const alert: EscalationAlert = {
        notificationId: n.id,
        workspaceId: n.workspaceId,
        leadId: n.leadId ?? '',
        leadTitle: payload.leadTitle ?? 'Lead',
        source: payload.source ?? 'UNKNOWN',
        reason: payload.reason ?? 'Escalated',
        leadUrl: `${APP_BASE_URL.replace(/\/$/, '')}/leads/${n.leadId}`,
        recipient: {
          userId: user.id,
          name: `${user.firstName} ${user.lastName}`.trim(),
          email: user.email,
          telegramChatId: membership?.telegramChatId ?? null,
          notificationEmail: membership?.notificationEmail ?? null,
        },
      };
      const result = await sender(alert);
      await prisma.notification.update({
        where: { id: n.id },
        data: { status: 'SENT', sentAt: new Date(), channel: result.channel, externalId: result.externalId, lastError: null },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const final = err instanceof PermanentNotificationError || attempt >= n.maxAttempts;
      await prisma.notification.update({
        where: { id: n.id },
        data: final
          ? { status: 'FAILED', lastError: message.slice(0, 500) }
          : { lastError: message.slice(0, 500), nextAttemptAt: new Date(Date.now() + 2 ** attempt * 5_000) },
      });
    }
  }
}

let timer: NodeJS.Timeout | null = null;
let running = false;

export async function runWorkerTick(): Promise<void> {
  if (running) return; // never overlap ticks in one process
  running = true;
  try {
    await processDueEscalations();
    await processUnassigned();
    await processNotifications();
  } catch (err) {
    console.error('[worker] tick failed', err);
  } finally {
    running = false;
  }
}

export function startLeadWorker(intervalMs = Number(process.env.WORKER_INTERVAL_MS) || 2000): void {
  if (timer) return;
  console.log(`[worker] escalation worker running every ${intervalMs}ms`);
  void runWorkerTick(); // catch up on anything that expired while the server was down
  timer = setInterval(() => void runWorkerTick(), intervalMs);
}

export function stopLeadWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
