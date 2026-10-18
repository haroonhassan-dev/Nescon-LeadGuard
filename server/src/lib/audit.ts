import { Prisma } from '@prisma/client';
import { Tx } from './prisma';

export interface AuditActor {
  type: 'USER' | 'SYSTEM' | 'INTEGRATION';
  id?: string | null;
  name?: string | null;
}

export const SYSTEM_ACTOR: AuditActor = { type: 'SYSTEM', id: null, name: 'system' };

export interface AuditEntry {
  workspaceId: string;
  actor: AuditActor;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string;
  requestId?: string;
}

const toJson = (value: unknown) =>
  value === undefined || value === null ? Prisma.JsonNull : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);

/**
 * Appends one audit row. Call it inside the same transaction as the change it records,
 * so a change can never be committed without its history. Rows are append-only:
 * the migration installs a trigger that rejects UPDATE and DELETE on audit_events.
 */
export async function recordAudit(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx.auditEvent.create({
    data: {
      workspaceId: entry.workspaceId,
      actorType: entry.actor.type,
      actorId: entry.actor.id ?? null,
      actorName: entry.actor.name ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      previousState: toJson(entry.before),
      newState: toJson(entry.after),
      ipAddress: entry.ipAddress,
      requestId: entry.requestId,
    },
  });
}
