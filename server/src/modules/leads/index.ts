import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ok, parse, paginate, paginationSchema, clientIp } from '../../lib/http';
import { recordAudit } from '../../lib/audit';
import { AppError } from '../../middleware/errorHandler';
import { requirePermission, hasPermission } from '../../middleware/authMiddleware';
import { ScopedRequest } from '../../middleware/workspaceContext';
import {
  ingestLead,
  acknowledgeLead,
  recordLeadAction,
  claimLead,
  reassignLead,
  closeLead,
  presentLead,
} from './service';
import { getSettings, updateSettingsSchema, ACKNOWLEDGED_LEAD_POLICIES } from './settings';
import { buildRecoveryWhere, recoveryReasons } from './recovery';

export const leadsRouter = Router();

const ownerSelect = { select: { id: true, firstName: true, lastName: true } } as const;

const actorOf = (req: ScopedRequest) => ({ type: 'USER' as const, id: req.auth.userId, name: req.auth.name });

/** Users without lead:read_all only ever see leads they currently own. */
function visibilityFilter(req: ScopedRequest): Prisma.LeadWhereInput {
  return hasPermission(req, 'lead:read_all') ? {} : { currentOwnerId: req.auth.userId };
}

async function findVisibleLead(req: ScopedRequest, id: string) {
  const lead = await prisma.lead.findFirst({
    where: { id, workspaceId: req.ctx.workspaceId, ...visibilityFilter(req) },
    include: { currentOwner: ownerSelect },
  });
  // 404 rather than 403, so guessed ids reveal nothing (F1.6).
  if (!lead) throw new AppError('Lead not found', 404, 'NOT_FOUND');
  return lead;
}

// ----------------------------------------------------
// Assignment settings (F3.3, F3.4, F3.5, F3.6). Any member may read the policy; changing it needs assignment:manage.
// ----------------------------------------------------
leadsRouter.get(
  '/settings',
  asyncHandler<ScopedRequest>(async (req, res) => {
    const settings = await getSettings(prisma, req.ctx.workspaceId);
    ok(req, res, {
      ...settings,
      acknowledgedLeadPolicyDescription: ACKNOWLEDGED_LEAD_POLICIES[settings.acknowledgedLeadPolicy],
    });
  })
);

leadsRouter.put(
  '/settings',
  requirePermission('assignment:manage'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const input = parse(updateSettingsSchema, req.body);
    const workspaceId = req.ctx.workspaceId;

    for (const userId of [input.backupUserId, input.managerUserId]) {
      if (!userId) continue;
      const member = await prisma.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
      if (!member || member.status !== 'ACTIVE') {
        throw new AppError('Backup and manager must be active members of this workspace', 400, 'VALIDATION_FAILED');
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const before = await getSettings(tx, workspaceId);
      const { version, ...changes } = input;
      const result = await tx.assignmentSettings.updateMany({
        where: { workspaceId, version },
        data: {
          ...changes,
          escalationLevels: changes.escalationLevels as unknown as Prisma.InputJsonValue | undefined,
          version: { increment: 1 },
        },
      });
      if (result.count === 0) {
        throw new AppError('Settings were changed by someone else. Reload and try again.', 409, 'VERSION_CONFLICT');
      }
      const after = await getSettings(tx, workspaceId);
      await recordAudit(tx, {
        workspaceId,
        actor: actorOf(req),
        action: 'ASSIGNMENT_SETTINGS_UPDATED',
        entityType: 'AssignmentSettings',
        entityId: workspaceId,
        before,
        after,
        ipAddress: clientIp(req),
        requestId: req.id,
      });
      return after;
    });
    ok(req, res, updated);
  })
);

// ----------------------------------------------------
// Recovery queue (F3.7)
// ----------------------------------------------------
leadsRouter.get(
  '/recovery-queue',
  requirePermission('lead:read_all'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const { page, limit } = parse(paginationSchema, req.query);
    const settings = await getSettings(prisma, req.ctx.workspaceId);
    const now = new Date();
    const where = buildRecoveryWhere(req.ctx.workspaceId, settings, now);
    const [total, leads] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        include: { currentOwner: ownerSelect },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    ok(req, res, {
      items: leads.map((lead) => ({ ...presentLead(lead), reasons: recoveryReasons(lead, settings, now) })),
      pagination: paginate(page, limit, total),
    });
  })
);

// ----------------------------------------------------
// Escalation alert delivery log (I4.4): visible to Admins / integration managers
// ----------------------------------------------------
leadsRouter.get(
  '/alerts',
  requirePermission('integration:manage'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const { page, limit } = parse(paginationSchema, req.query);
    const status = parse(z.enum(['PENDING', 'SENT', 'FAILED', 'NO_CHANNEL']).optional(), req.query.status);
    const where: Prisma.NotificationWhereInput = { workspaceId: req.ctx.workspaceId, ...(status ? { status } : {}) };
    const [total, items] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    ]);
    ok(req, res, { items, pagination: paginate(page, limit, total) });
  })
);

// ----------------------------------------------------
// List / create
// ----------------------------------------------------
const listSchema = paginationSchema.extend({
  status: z.enum(['UNASSIGNED', 'ASSIGNED', 'ACKNOWLEDGED', 'CLOSED']).optional(),
  source: z.enum(['WEB_FORM', 'WHATSAPP', 'SMS', 'MANUAL']).optional(),
  ownerId: z.string().uuid().optional(),
  search: z.string().trim().max(100).optional(),
  createdFrom: z.coerce.date().optional(),
});

leadsRouter.get(
  '/',
  requirePermission('lead:read'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const q = parse(listSchema, req.query);
    const where: Prisma.LeadWhereInput = {
      workspaceId: req.ctx.workspaceId,
      ...visibilityFilter(req),
      ...(q.status ? { status: q.status } : {}),
      ...(q.source ? { source: q.source } : {}),
      ...(q.createdFrom ? { createdAt: { gte: q.createdFrom } } : {}),
      ...(q.ownerId && hasPermission(req, 'lead:read_all') ? { currentOwnerId: q.ownerId } : {}),
      ...(q.search
        ? {
            OR: [
              { title: { contains: q.search, mode: 'insensitive' } },
              { contactName: { contains: q.search, mode: 'insensitive' } },
              { contactEmail: { contains: q.search, mode: 'insensitive' } },
              { contactPhone: { contains: q.search } },
            ],
          }
        : {}),
    };
    const [total, leads] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        include: { currentOwner: ownerSelect },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
    ]);
    ok(req, res, {
      items: leads.map(presentLead),
      pagination: paginate(q.page, q.limit, total),
      serverTime: new Date().toISOString(),
    });
  })
);

const createSchema = z
  .object({
    contactName: z.string().trim().min(1).max(120),
    contactEmail: z.string().trim().toLowerCase().email().max(254).optional(),
    contactPhone: z.string().trim().regex(/^\+?[0-9 ()-]{6,20}$/, 'Phone number looks invalid').optional(),
    message: z.string().trim().max(2000).optional(),
    title: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.contactEmail || v.contactPhone, { message: 'Email or phone is required', path: ['contactEmail'] });

/** Manual entry (F3.1). */
leadsRouter.post(
  '/',
  requirePermission('lead:create'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const input = parse(createSchema, req.body);
    const { lead } = await ingestLead({ ...input, workspaceId: req.ctx.workspaceId, source: 'MANUAL', actor: actorOf(req) });
    const full = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, include: { currentOwner: ownerSelect } });
    ok(req, res, presentLead(full), 201);
  })
);

// ----------------------------------------------------
// Single lead + actions
// ----------------------------------------------------
leadsRouter.get(
  '/:id',
  requirePermission('lead:read'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const lead = await findVisibleLead(req, req.params.id);
    const [activities, assignments] = await Promise.all([
      prisma.leadActivity.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: 'asc' } }),
      prisma.leadAssignment.findMany({
        where: { leadId: lead.id },
        orderBy: { seq: 'asc' },
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      }),
    ]);
    ok(req, res, { ...presentLead(lead), activities, assignments, serverTime: new Date().toISOString() });
  })
);

leadsRouter.post(
  '/:id/acknowledge',
  requirePermission('lead:read'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    await findVisibleLead(req, req.params.id);
    const lead = await acknowledgeLead(req.ctx.workspaceId, req.params.id, actorOf(req));
    ok(req, res, presentLead(lead));
  })
);

const noteSchema = z.object({
  kind: z.enum(['NOTE', 'CALL']).default('NOTE'),
  body: z.string().trim().min(1).max(5000),
});

/** Adding a note or call log is a recorded action: for the owner it also acknowledges the lead. */
leadsRouter.post(
  '/:id/activities',
  requirePermission('lead:update'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const input = parse(noteSchema, req.body);
    await findVisibleLead(req, req.params.id);
    const lead = await recordLeadAction({
      workspaceId: req.ctx.workspaceId,
      leadId: req.params.id,
      actor: actorOf(req),
      kind: input.kind,
      body: input.body,
    });
    ok(req, res, presentLead(lead), 201);
  })
);

leadsRouter.post(
  '/:id/claim',
  requirePermission('lead:claim'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    // Claimable leads are unowned, so lead:read_all is not required to see them here.
    const lead = await claimLead(req.ctx.workspaceId, req.params.id, actorOf(req));
    ok(req, res, presentLead(lead));
  })
);

const reassignSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().min(3).max(300),
});

leadsRouter.post(
  '/:id/reassign',
  requirePermission('lead:reassign', 'lead:read_all'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const input = parse(reassignSchema, req.body);
    const lead = await reassignLead(req.ctx.workspaceId, req.params.id, input.userId, input.reason, actorOf(req));
    ok(req, res, presentLead(lead));
  })
);

const closeSchema = z.object({ outcome: z.string().trim().min(2).max(300) });

leadsRouter.post(
  '/:id/close',
  requirePermission('lead:update'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const input = parse(closeSchema, req.body);
    await findVisibleLead(req, req.params.id);
    const lead = await closeLead(req.ctx.workspaceId, req.params.id, input.outcome, actorOf(req));
    ok(req, res, presentLead(lead));
  })
);
