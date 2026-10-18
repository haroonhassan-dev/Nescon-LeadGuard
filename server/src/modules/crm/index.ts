import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ok, parse, paginate, paginationSchema, clientIp } from '../../lib/http';
import { recordAudit } from '../../lib/audit';
import { AppError } from '../../middleware/errorHandler';
import { requirePermission, hasPermission } from '../../middleware/authMiddleware';
import { ScopedRequest } from '../../middleware/workspaceContext';
import { recordLeadAction } from '../leads/service';
import { ensureDefaultPipeline, presentOpportunity, opportunityInclude } from './service';

/**
 * CRM, basic slice: default pipeline, contacts list, and opportunities (create, list, view,
 * move stage, edit). Custom fields, editable stages and saved lists (F2.2–F2.6) are not built yet.
 */
export const crmRouter = Router();

const actorOf = (req: ScopedRequest) => ({ type: 'USER' as const, id: req.auth.userId, name: req.auth.name });

// ----------------------------------------------------
// Pipelines
// ----------------------------------------------------
crmRouter.get(
  '/pipelines',
  requirePermission('opportunity:read'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    await ensureDefaultPipeline(prisma, req.ctx.workspaceId);
    const pipelines = await prisma.pipeline.findMany({
      where: { workspaceId: req.ctx.workspaceId },
      include: { stages: { orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    ok(req, res, { items: pipelines });
  })
);

// ----------------------------------------------------
// Contacts (read-only list for now; contacts are created by lead intake)
// ----------------------------------------------------
const contactQuery = paginationSchema.extend({ search: z.string().trim().max(100).optional() });

crmRouter.get(
  '/contacts',
  requirePermission('contact:read'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const q = parse(contactQuery, req.query);
    const where: Prisma.ContactWhereInput = {
      workspaceId: req.ctx.workspaceId,
      ...(q.search
        ? {
            OR: [
              { firstName: { contains: q.search, mode: 'insensitive' } },
              { lastName: { contains: q.search, mode: 'insensitive' } },
              { email: { contains: q.search, mode: 'insensitive' } },
              { phone: { contains: q.search } },
            ],
          }
        : {}),
    };
    const [total, items] = await Promise.all([
      prisma.contact.count({ where }),
      prisma.contact.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
    ]);
    ok(req, res, { items, pagination: paginate(q.page, q.limit, total) });
  })
);

// ----------------------------------------------------
// Opportunities
// ----------------------------------------------------
const listQuery = paginationSchema.extend({
  stageId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
});

crmRouter.get(
  '/opportunities',
  requirePermission('opportunity:read'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const q = parse(listQuery, req.query);
    const where: Prisma.OpportunityWhereInput = {
      workspaceId: req.ctx.workspaceId,
      ...(q.stageId ? { stageId: q.stageId } : {}),
      ...(q.contactId ? { contactId: q.contactId } : {}),
      ...(q.leadId ? { leadId: q.leadId } : {}),
    };
    const canSeeValue = hasPermission(req, 'opportunity:view_value');
    const [total, items] = await Promise.all([
      prisma.opportunity.count({ where }),
      prisma.opportunity.findMany({
        where,
        include: opportunityInclude,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
    ]);
    ok(req, res, { items: items.map((o) => presentOpportunity(o, canSeeValue)), pagination: paginate(q.page, q.limit, total) });
  })
);

const createSchema = z
  .object({
    title: z.string().trim().min(2).max(200),
    value: z.number().min(0).max(9_999_999_999),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code like USD').default('USD'),
    stageId: z.string().uuid().optional(),
    contactId: z.string().uuid().optional(),
    leadId: z.string().uuid().optional(),
    assignedUserId: z.string().uuid().optional(),
  });

crmRouter.post(
  '/opportunities',
  requirePermission('opportunity:create'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const input = parse(createSchema, req.body);
    const workspaceId = req.ctx.workspaceId;

    const created = await prisma.$transaction(async (tx) => {
      const pipeline = await ensureDefaultPipeline(tx, workspaceId);
      const stage = input.stageId ? pipeline.stages.find((s) => s.id === input.stageId) : pipeline.stages[0];
      if (!stage) throw new AppError('Stage not found in this workspace', 400, 'VALIDATION_FAILED');

      // Every referenced record must belong to this workspace (no cross-tenant links by guessed id).
      let contactId = input.contactId ?? null;
      if (input.leadId) {
        const lead = await tx.lead.findFirst({ where: { id: input.leadId, workspaceId } });
        if (!lead) throw new AppError('Lead not found', 400, 'VALIDATION_FAILED');
        contactId = contactId ?? lead.contactId;
      }
      if (contactId && !(await tx.contact.findFirst({ where: { id: contactId, workspaceId } }))) {
        throw new AppError('Contact not found', 400, 'VALIDATION_FAILED');
      }
      const assignedUserId = input.assignedUserId ?? req.auth.userId;
      if (!(await tx.membership.findFirst({ where: { workspaceId, userId: assignedUserId, status: 'ACTIVE' } }))) {
        throw new AppError('Assigned user is not an active member', 400, 'VALIDATION_FAILED');
      }

      const opportunity = await tx.opportunity.create({
        data: {
          workspaceId,
          title: input.title,
          value: new Prisma.Decimal(input.value),
          currency: input.currency,
          pipelineId: pipeline.id,
          stageId: stage.id,
          contactId,
          leadId: input.leadId ?? null,
          assignedUserId,
        },
        include: opportunityInclude,
      });
      await recordAudit(tx, {
        workspaceId,
        actor: actorOf(req),
        action: 'OPPORTUNITY_CREATED',
        entityType: 'Opportunity',
        entityId: opportunity.id,
        after: { title: opportunity.title, value: input.value, currency: input.currency, stage: stage.name },
        ipAddress: clientIp(req),
        requestId: req.id,
      });
      return opportunity;
    });

    ok(req, res, presentOpportunity(created, hasPermission(req, 'opportunity:view_value')), 201);
  })
);

async function findOpportunity(req: ScopedRequest, id: string) {
  const opportunity = await prisma.opportunity.findFirst({
    where: { id, workspaceId: req.ctx.workspaceId },
    include: opportunityInclude,
  });
  if (!opportunity) throw new AppError('Opportunity not found', 404, 'NOT_FOUND');
  return opportunity;
}

crmRouter.get(
  '/opportunities/:id',
  requirePermission('opportunity:read'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const opportunity = await findOpportunity(req, req.params.id);
    const canSeeValue = hasPermission(req, 'opportunity:view_value');
    const payments = hasPermission(req, 'payment:read')
      ? await prisma.payment.findMany({ where: { opportunityId: opportunity.id }, orderBy: { createdAt: 'desc' } })
      : [];
    ok(req, res, {
      ...presentOpportunity(opportunity, canSeeValue),
      // Payment amounts reveal the deal size, so they follow the same value permission.
      payments: payments.map((p) => ({
        id: p.id,
        status: p.status,
        amount: canSeeValue ? p.amount : null,
        refundedAmount: canSeeValue ? p.refundedAmount : null,
        currency: p.currency,
        providerReference: p.providerReference,
        checkoutUrl: p.status === 'PENDING' ? p.checkoutUrl : null,
        failureReason: p.failureReason,
        requestedById: p.requestedById,
        paidAt: p.paidAt?.toISOString() ?? null,
        expiresAt: p.expiresAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
      })),
    });
  })
);

const updateSchema = z
  .object({
    title: z.string().trim().min(2).max(200).optional(),
    value: z.number().min(0).max(9_999_999_999).optional(),
    stageId: z.string().uuid().optional(),
    version: z.number().int().min(0),
  })
  .refine((v) => v.title !== undefined || v.value !== undefined || v.stageId !== undefined, {
    message: 'Nothing to update',
  });

/** PATCH /opportunities/:id. Version-checked, so two people editing at once never silently overwrite (Q4). */
crmRouter.patch(
  '/opportunities/:id',
  requirePermission('opportunity:update'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const input = parse(updateSchema, req.body);
    if (input.value !== undefined && !hasPermission(req, 'opportunity:view_value')) {
      throw new AppError('You cannot change a value you are not allowed to see', 403, 'FORBIDDEN_INSUFFICIENT_PERMISSIONS');
    }
    const before = await findOpportunity(req, req.params.id);
    let newStageName: string | undefined;
    if (input.stageId) {
      const stage = await prisma.pipelineStage.findFirst({
        where: { id: input.stageId, pipelineId: before.pipelineId, workspaceId: req.ctx.workspaceId },
      });
      if (!stage) throw new AppError('Stage not found in this pipeline', 400, 'VALIDATION_FAILED');
      newStageName = stage.name;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.opportunity.updateMany({
        where: { id: before.id, workspaceId: req.ctx.workspaceId, version: input.version },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.value !== undefined ? { value: new Prisma.Decimal(input.value) } : {}),
          ...(input.stageId ? { stageId: input.stageId } : {}),
          version: { increment: 1 },
        },
      });
      if (result.count === 0) {
        throw new AppError('Someone else changed this opportunity. Reload to see their changes.', 409, 'VERSION_CONFLICT');
      }
      await recordAudit(tx, {
        workspaceId: req.ctx.workspaceId,
        actor: actorOf(req),
        action: input.stageId && input.stageId !== before.stageId ? 'OPPORTUNITY_STAGE_CHANGED' : 'OPPORTUNITY_UPDATED',
        entityType: 'Opportunity',
        entityId: before.id,
        before: { title: before.title, value: Number(before.value), stage: before.stage?.name },
        after: {
          title: input.title ?? before.title,
          value: input.value ?? Number(before.value),
          stage: newStageName ?? before.stage?.name,
        },
        ipAddress: clientIp(req),
        requestId: req.id,
      });
      return tx.opportunity.findUniqueOrThrow({ where: { id: before.id }, include: opportunityInclude });
    });

    // A stage change on a lead's deal is a recorded action on that lead (glossary: Acknowledged).
    if (input.stageId && input.stageId !== before.stageId && before.leadId) {
      await recordLeadAction({
        workspaceId: req.ctx.workspaceId,
        leadId: before.leadId,
        actor: actorOf(req),
        kind: 'STAGE_CHANGE',
        body: `Deal "${updated.title}" moved to ${newStageName}`,
      });
    }

    ok(req, res, presentOpportunity(updated, hasPermission(req, 'opportunity:view_value')));
  })
);

// Everything else in F2 is not built yet: answer honestly instead of returning fake data.
crmRouter.all('*', (_req, _res, next) => {
  next(new AppError('This CRM endpoint is not implemented yet', 501, 'NOT_IMPLEMENTED'));
});
