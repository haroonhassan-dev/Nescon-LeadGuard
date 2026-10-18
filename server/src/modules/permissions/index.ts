import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ok, parse, clientIp } from '../../lib/http';
import { recordAudit } from '../../lib/audit';
import { PERMISSIONS, isPermission } from '../../lib/permissions';
import { AppError } from '../../middleware/errorHandler';
import { requirePermission } from '../../middleware/authMiddleware';
import { ScopedRequest } from '../../middleware/workspaceContext';

/**
 * Configurable permissions (F1.3). Roles are permission sets; "Manager" is a role, not a level.
 * The Owner holds every permission implicitly, so no role edit can lock the Owner out.
 */
export const permissionsRouter = Router();

const actorOf = (req: ScopedRequest) => ({ type: 'USER' as const, id: req.auth.userId, name: req.auth.name });

const permissionList = z
  .array(z.string())
  .max(PERMISSIONS.length)
  .refine((list) => list.every(isPermission), { message: 'Unknown permission key' })
  .transform((list) => [...new Set(list)]);

permissionsRouter.get(
  '/',
  requirePermission('role:manage'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const roles = await prisma.role.findMany({
      where: { workspaceId: req.ctx.workspaceId },
      include: { _count: { select: { memberships: true } } },
      orderBy: { createdAt: 'asc' },
    });
    ok(req, res, {
      catalog: PERMISSIONS,
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        permissions: r.permissions,
        isSystem: r.isSystem,
        memberCount: r._count.memberships,
      })),
    });
  })
);

const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(50),
  description: z.string().trim().max(200).optional(),
  permissions: permissionList,
});

permissionsRouter.post(
  '/roles',
  requirePermission('role:manage'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const input = parse(createRoleSchema, req.body);
    const role = await prisma.$transaction(async (tx) => {
      const created = await tx.role.create({ data: { ...input, workspaceId: req.ctx.workspaceId } });
      await recordAudit(tx, {
        workspaceId: req.ctx.workspaceId,
        actor: actorOf(req),
        action: 'ROLE_CREATED',
        entityType: 'Role',
        entityId: created.id,
        after: { name: created.name, permissions: created.permissions },
        ipAddress: clientIp(req),
        requestId: req.id,
      });
      return created;
    });
    ok(req, res, role, 201);
  })
);

const updateRoleSchema = z.object({
  name: z.string().trim().min(2).max(50).optional(),
  description: z.string().trim().max(200).optional(),
  permissions: permissionList.optional(),
});

permissionsRouter.patch(
  '/roles/:id',
  requirePermission('role:manage'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const input = parse(updateRoleSchema, req.body);
    const workspaceId = req.ctx.workspaceId;
    const role = await prisma.role.findFirst({ where: { id: req.params.id, workspaceId } });
    if (!role) throw new AppError('Role not found', 404, 'NOT_FOUND');
    // Prevents self-escalation: a non-Owner cannot widen the role they hold themselves.
    if (req.ctx.baseLevel !== 'OWNER' && req.ctx.roleId === role.id) {
      throw new AppError('You cannot edit the role you hold', 403, 'FORBIDDEN_INSUFFICIENT_PERMISSIONS');
    }
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.role.update({ where: { id: role.id }, data: input });
      await recordAudit(tx, {
        workspaceId,
        actor: actorOf(req),
        action: 'ROLE_UPDATED',
        entityType: 'Role',
        entityId: role.id,
        before: { name: role.name, permissions: role.permissions },
        after: { name: result.name, permissions: result.permissions },
        ipAddress: clientIp(req),
        requestId: req.id,
      });
      return result;
    });
    ok(req, res, updated);
  })
);

permissionsRouter.delete(
  '/roles/:id',
  requirePermission('role:manage'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const workspaceId = req.ctx.workspaceId;
    const role = await prisma.role.findFirst({
      where: { id: req.params.id, workspaceId },
      include: { _count: { select: { memberships: true } } },
    });
    if (!role) throw new AppError('Role not found', 404, 'NOT_FOUND');
    if (role._count.memberships > 0) {
      throw new AppError('Move the members of this role to another role before deleting it', 409, 'ROLE_IN_USE');
    }
    await prisma.$transaction(async (tx) => {
      await tx.role.delete({ where: { id: role.id } });
      await recordAudit(tx, {
        workspaceId,
        actor: actorOf(req),
        action: 'ROLE_DELETED',
        entityType: 'Role',
        entityId: role.id,
        before: { name: role.name, permissions: role.permissions },
        ipAddress: clientIp(req),
        requestId: req.id,
      });
    });
    ok(req, res, { deleted: true });
  })
);
