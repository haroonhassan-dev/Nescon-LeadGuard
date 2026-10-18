import { z } from 'zod';
import { Tx } from '../../lib/prisma';

export type EscalationTarget = 'NEXT_ELIGIBLE' | 'BACKUP' | 'MANAGER';

export interface EscalationLevel {
  target: EscalationTarget;
  timeoutSeconds: number;
}

/** Default chain (F3.5): next eligible employee → designated backup → manager. */
export const DEFAULT_ESCALATION_LEVELS: EscalationLevel[] = [
  { target: 'NEXT_ELIGIBLE', timeoutSeconds: 60 },
  { target: 'BACKUP', timeoutSeconds: 60 },
  { target: 'MANAGER', timeoutSeconds: 120 },
];

export const ACKNOWLEDGED_LEAD_POLICIES = {
  KEEP_WITH_OWNER:
    'Leads you already acknowledged stay with you while you are On leave or Offline. Only unacknowledged leads are reassigned.',
  REASSIGN:
    'All your open leads, acknowledged or not, are reassigned to an available colleague when you go On leave or Offline.',
} as const;

export type AcknowledgedLeadPolicy = keyof typeof ACKNOWLEDGED_LEAD_POLICIES;

export const escalationLevelSchema = z.object({
  target: z.enum(['NEXT_ELIGIBLE', 'BACKUP', 'MANAGER']),
  timeoutSeconds: z.number().int().min(5).max(7 * 24 * 3600),
});

export const updateSettingsSchema = z.object({
  ackTimeoutSeconds: z.number().int().min(5).max(7 * 24 * 3600).optional(),
  maxOpenLeadsPerUser: z.number().int().min(1).max(1000).optional(),
  escalationLevels: z.array(escalationLevelSchema).min(1).max(10).optional(),
  backupUserId: z.string().uuid().nullable().optional(),
  managerUserId: z.string().uuid().nullable().optional(),
  idleThresholdSeconds: z.number().int().min(10).max(30 * 24 * 3600).optional(),
  recoveryEscalationThreshold: z.number().int().min(1).max(20).optional(),
  acknowledgedLeadPolicy: z.enum(['KEEP_WITH_OWNER', 'REASSIGN']).optional(),
  version: z.number().int().min(0),
});

export interface ResolvedSettings {
  workspaceId: string;
  ackTimeoutSeconds: number;
  maxOpenLeadsPerUser: number;
  escalationLevels: EscalationLevel[];
  backupUserId: string | null;
  managerUserId: string | null;
  idleThresholdSeconds: number;
  recoveryEscalationThreshold: number;
  acknowledgedLeadPolicy: AcknowledgedLeadPolicy;
  version: number;
}

function parseLevels(raw: unknown): EscalationLevel[] {
  const parsed = z.array(escalationLevelSchema).safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_ESCALATION_LEVELS;
}

export async function getSettings(tx: Tx, workspaceId: string): Promise<ResolvedSettings> {
  const row = await tx.assignmentSettings.findUnique({ where: { workspaceId } });
  if (!row) {
    return {
      workspaceId,
      ackTimeoutSeconds: 60,
      maxOpenLeadsPerUser: 10,
      escalationLevels: DEFAULT_ESCALATION_LEVELS,
      backupUserId: null,
      managerUserId: null,
      idleThresholdSeconds: 900,
      recoveryEscalationThreshold: 2,
      acknowledgedLeadPolicy: 'KEEP_WITH_OWNER',
      version: 0,
    };
  }
  return {
    workspaceId,
    ackTimeoutSeconds: row.ackTimeoutSeconds,
    maxOpenLeadsPerUser: row.maxOpenLeadsPerUser,
    escalationLevels: parseLevels(row.escalationLevels),
    backupUserId: row.backupUserId,
    managerUserId: row.managerUserId,
    idleThresholdSeconds: row.idleThresholdSeconds,
    recoveryEscalationThreshold: row.recoveryEscalationThreshold,
    acknowledgedLeadPolicy: row.acknowledgedLeadPolicy === 'REASSIGN' ? 'REASSIGN' : 'KEEP_WITH_OWNER',
    version: row.version,
  };
}

/** Time allowed at a given escalation level. Level 0 is the first assignment. */
export function timeoutForLevel(settings: ResolvedSettings, level: number): number {
  if (level <= 0) return settings.ackTimeoutSeconds;
  return settings.escalationLevels[level - 1]?.timeoutSeconds ?? settings.ackTimeoutSeconds;
}
