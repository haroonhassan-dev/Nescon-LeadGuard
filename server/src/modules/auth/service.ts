import { Prisma } from '@prisma/client';
import { Tx } from '../../lib/prisma';
import { randomToken, sha256 } from '../../lib/crypto';
import { SYSTEM_ROLES } from '../../lib/permissions';
import { recordAudit } from '../../lib/audit';
import { DEFAULT_ESCALATION_LEVELS } from '../leads/settings';
import { ensureDefaultPipeline } from '../crm/service';

export const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS) || 72;
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${base || 'workspace'}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}

/** Creates a session and returns the plaintext token (shown once, never stored). */
export async function createSession(tx: Tx, userId: string, meta: { ip?: string; userAgent?: string }) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000);
  await tx.session.create({
    data: { userId, tokenHash: sha256(token), expiresAt, ipAddress: meta.ip, userAgent: meta.userAgent?.slice(0, 300) },
  });
  return { token, expiresAt };
}

/**
 * Creates a workspace with its system roles and default assignment settings, and makes
 * `ownerUserId` its Owner (F1.1). Used by signup and the demo seed.
 */
export async function bootstrapWorkspace(tx: Tx, input: { name: string; ownerUserId: string; ownerName: string }) {
  const workspace = await tx.workspace.create({
    data: { name: input.name, slug: slugify(input.name), publicFormKey: randomToken(18) },
  });

  const roles: Record<string, string> = {};
  for (const role of SYSTEM_ROLES) {
    const created = await tx.role.create({
      data: {
        workspaceId: workspace.id,
        name: role.name,
        description: role.description,
        permissions: role.permissions,
        isSystem: true,
      },
    });
    roles[role.name] = created.id;
  }

  const membership = await tx.membership.create({
    data: { workspaceId: workspace.id, userId: input.ownerUserId, baseLevel: 'OWNER', roleId: null },
  });

  await tx.assignmentSettings.create({
    data: {
      workspaceId: workspace.id,
      escalationLevels: DEFAULT_ESCALATION_LEVELS as unknown as Prisma.InputJsonValue,
    },
  });

  await ensureDefaultPipeline(tx, workspace.id);

  await recordAudit(tx, {
    workspaceId: workspace.id,
    actor: { type: 'USER', id: input.ownerUserId, name: input.ownerName },
    action: 'WORKSPACE_CREATED',
    entityType: 'Workspace',
    entityId: workspace.id,
    after: { name: workspace.name, slug: workspace.slug, owner: input.ownerUserId },
  });

  return { workspace, membership, roles };
}

export function publicUser(user: { id: string; email: string; firstName: string; lastName: string; phone: string | null }) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`.trim(),
    phone: user.phone,
  };
}
