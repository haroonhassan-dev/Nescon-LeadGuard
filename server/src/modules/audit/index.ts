import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ok, parse, paginate, paginationSchema } from '../../lib/http';
import { requirePermission } from '../../middleware/authMiddleware';
import { ScopedRequest } from '../../middleware/workspaceContext';

/**
 * Audit history (F4). Read-only by design: there is no update or delete route, and the
 * database trigger installed by the migration rejects UPDATE/DELETE on audit_events (F4.3).
 */
export const auditRouter = Router();

const querySchema = paginationSchema.extend({
  action: z.string().trim().max(60).optional(),
  actorId: z.string().uuid().optional(),
  entityType: z.string().trim().max(60).optional(),
  entityId: z.string().trim().max(60).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

auditRouter.get(
  '/',
  requirePermission('audit:read'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const q = parse(querySchema, req.query);
    const where: Prisma.AuditEventWhereInput = {
      workspaceId: req.ctx.workspaceId,
      ...(q.action ? { action: q.action } : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.from || q.to ? { createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
    };
    const [total, items, actions] = await Promise.all([
      prisma.auditEvent.count({ where }),
      prisma.auditEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
      prisma.auditEvent.findMany({
        where: { workspaceId: req.ctx.workspaceId },
        select: { action: true },
        distinct: ['action'],
      }),
    ]);
    ok(req, res, {
      items,
      pagination: paginate(q.page, q.limit, total),
      availableActions: actions.map((a) => a.action).sort(),
    });
  })
);
