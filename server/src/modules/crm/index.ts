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
import { activeFields, validateValues, assertStageRequirements, filterSchema, buildOpportunityWhere, Values } from './fields';
import { crmConfigRouter } from './config';

/**
 * CRM (F2): pipelines, contacts, opportunities with custom fields, stage requirements and
 * saved lists. Configuration routes (pipelines, stages, fields, lists) live in ./config.
 */
export const crmRouter = Router();

const actorOf = (req: ScopedRequest) => ({ type: 'USER' as const, id: req.auth.userId, name: req.auth.name });
const tagList = z.array(z.string().trim().min(1).max(50)).max(20);

// ----------------------------------------------------
// Pipelines (read) — create/edit/reorder/delete are in ./config
// ----------------------------------------------------
crmRouter.get(
  '/pipelines',
  requirePermission('opportunity:read'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    await ensureDefaultPipeline(prisma, req.ctx.workspaceId);
    const pipelines = await prisma.pipeline.findMany({
      where: { workspaceId: req.ctx.workspaceId },
      include: {
        stages: { orderBy: { position: 'asc' } },
        customFields: { where: { archivedAt: null }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
        _count: { select: { opportunities: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    ok(req, res, { items: pipelines });
  })
);

crmRouter.use(crmConfigRouter);

// ----------------------------------------------------
// Contacts
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

/**
 * GET /contacts/:id: the complete customer view (F2.1, F2.8): company, opportunities, leads with
 * their assigned employee, conversation, payments, appointments and a time-ordered history.
 */
crmRouter.get(
  '/contacts/:id',
  requirePermission('contact:read'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const ws = req.ctx.workspaceId;
    const contact = await prisma.contact.findFirst({ where: { id: req.params.id, workspaceId: ws }, include: { company: true } });
    if (!contact) throw new AppError('Contact not found', 404, 'NOT_FOUND');
    const readAll = hasPermission(req, 'lead:read_all');
    const leads = await prisma.lead.findMany({
      where: { contactId: contact.id },
      include: { currentOwner: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    if (!readAll && !leads.some((l) => l.currentOwnerId === req.auth.userId) && !hasPermission(req, 'contact:read')) {
      throw new AppError('Contact not found', 404, 'NOT_FOUND');
    }
    const canSeeValue = hasPermission(req, 'opportunity:view_value');
    const [opportunities, messages, payments, appointments, activities, fields] = await Promise.all([
      prisma.opportunity.findMany({ where: { contactId: contact.id }, include: opportunityInclude, orderBy: { createdAt: 'desc' } }),
      hasPermission(req, 'message:read')
        ? prisma.message.findMany({ where: { contactId: contact.id }, orderBy: { createdAt: 'desc' }, take: 50 })
        : Promise.resolve([]),
      hasPermission(req, 'payment:read') ? prisma.payment.findMany({ where: { contactId: contact.id }, orderBy: { createdAt: 'desc' } }) : Promise.resolve([]),
      hasPermission(req, 'appointment:read') ? prisma.appointment.findMany({ where: { contactId: contact.id }, orderBy: { startTime: 'desc' } }) : Promise.resolve([]),
      prisma.leadActivity.findMany({ where: { leadId: { in: leads.map((l) => l.id) } }, orderBy: { createdAt: 'asc' } }),
      activeFields(prisma, ws, 'CONTACT'),
    ]);
    const owner = leads[0]?.currentOwner;
    ok(req, res, {
      contact: { ...contact, fields },
      assignedEmployee: owner ? { id: owner.id, name: `${owner.firstName} ${owner.lastName}`.trim() } : null,
      leads: leads.map((l) => ({ id: l.id, title: l.title, status: l.status, source: l.source, owner: l.currentOwner ? `${l.currentOwner.firstName} ${l.currentOwner.lastName}`.trim() : null, createdAt: l.createdAt })),
      opportunities: opportunities.map((o) => presentOpportunity(o, canSeeValue)),
      messages: messages.reverse().map((m) => ({ id: m.id, direction: m.direction, body: m.body, status: m.status, at: m.createdAt })),
      payments: payments.map((p) => ({ id: p.id, status: p.status, amount: canSeeValue ? p.amount : null, refundedAmount: canSeeValue ? p.refundedAmount : null, currency: p.currency, providerReference: p.providerReference, paidAt: p.paidAt })),
      appointments: appointments.map((a) => ({ id: a.id, title: a.title, status: a.status, startTime: a.startTime, endTime: a.endTime, timezone: a.timezone })),
      activity: activities,
    });
  })
);

const contactUpdate = z
  .object({
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().max(80).optional(),
    email: z.string().trim().toLowerCase().email().nullable().optional(),
    phone: z.string().trim().regex(/^\+?[0-9 ()-]{6,20}$/).nullable().optional(),
    tags: tagList.optional(),
    customValues: z.record(z.unknown()).optional(),
    version: z.number().int().min(0),
  });

crmRouter.patch(
  '/contacts/:id',
  requirePermission('contact:update'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const input = parse(contactUpdate, req.body);
    const ws = req.ctx.workspaceId;
    const before = await prisma.contact.findFirst({ where: { id: req.params.id, workspaceId: ws } });
    if (!before) throw new AppError('Contact not found', 404, 'NOT_FOUND');
    const values = validateValues(await activeFields(prisma, ws, 'CONTACT'), before.customValues, input.customValues);
    const { version, customValues: _ignored, ...rest } = input;
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.contact.updateMany({
        where: { id: before.id, workspaceId: ws, version },
        data: { ...rest, customValues: values as Prisma.InputJsonValue, version: { increment: 1 } },
      });
      if (result.count === 0) throw new AppError('Someone else changed this contact. Reload to see their changes.', 409, 'VERSION_CONFLICT');
      await recordAudit(tx, {
        workspaceId: ws, actor: actorOf(req), action: 'CONTACT_UPDATED', entityType: 'Contact', entityId: before.id,
        before: { firstName: before.firstName, lastName: before.lastName, email: before.email, phone: before.phone, tags: before.tags, customValues: before.customValues },
        after: { ...rest, customValues: values }, ipAddress: clientIp(req), requestId: req.id,
      });
      return tx.contact.findUniqueOrThrow({ where: { id: before.id } });
    });
    ok(req, res, updated);
  })
);

// ----------------------------------------------------
// Opportunities
// ----------------------------------------------------
const listQuery = paginationSchema.extend({
  pipelineId: z.string().uuid().optional(),
  stageId: z.string().uuid().optional(),
  assignedUserId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  tag: z.string().trim().max(50).optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  minValue: z.coerce.number().optional(),
  maxValue: z.coerce.number().optional(),
  /** JSON-encoded custom field conditions: [{"key":"roof_type","op":"eq","value":"Flat"}] */
  fields: z.string().max(2000).optional(),
});

/** GET /opportunities: combinable filters (field, tag, stage, owner, date, value) — F2.6. */
crmRouter.get(
  '/opportunities',
  requirePermission('opportunity:read'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const { page, limit, contactId, leadId, fields, ...rest } = parse(listQuery, req.query);
    let fieldConds: unknown;
    try {
      fieldConds = fields ? JSON.parse(fields) : undefined;
    } catch {
      throw new AppError('fields must be valid JSON', 400, 'VALIDATION_FAILED');
    }
    const filters = parse(filterSchema, { ...rest, ...(fieldConds ? { fields: fieldConds } : {}) });
    const canSeeValue = hasPermission(req, 'opportunity:view_value');
    const where: Prisma.OpportunityWhereInput = {
      AND: [buildOpportunityWhere(req.ctx.workspaceId, filters, canSeeValue), ...(contactId ? [{ contactId }] : []), ...(leadId ? [{ leadId }] : [])],
    };
    const [total, items] = await Promise.all([
      prisma.opportunity.count({ where }),
      prisma.opportunity.findMany({ where, include: opportunityInclude, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    ]);
    ok(req, res, { items: items.map((o) => presentOpportunity(o, canSeeValue)), pagination: paginate(page, limit, total), appliedFilters: filters });
  })
);

const createSchema = z.object({
  title: z.string().trim().min(2).max(200),
  value: z.number().min(0).max(9_999_999_999),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code like USD').default('USD'),
  pipelineId: z.string().uuid().optional(),
  stageId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  assignedUserId: z.string().uuid().optional(),
  tags: tagList.default([]),
  customValues: z.record(z.unknown()).optional(),
});

crmRouter.post(
  '/opportunities',
  requirePermission('opportunity:create'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const input = parse(createSchema, req.body);
    const workspaceId = req.ctx.workspaceId;

    const created = await prisma.$transaction(async (tx) => {
      const pipeline = input.pipelineId
        ? await tx.pipeline.findFirst({ where: { id: input.pipelineId, workspaceId }, include: { stages: { orderBy: { position: 'asc' } } } })
        : await ensureDefaultPipeline(tx, workspaceId);
      if (!pipeline) throw new AppError('Pipeline not found', 400, 'VALIDATION_FAILED');
      const stage = input.stageId ? pipeline.stages.find((s) => s.id === input.stageId) : pipeline.stages[0];
      if (!stage) throw new AppError('Stage not found in this pipeline', 400, 'VALIDATION_FAILED');

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

      const fields = await activeFields(tx, workspaceId, 'OPPORTUNITY', pipeline.id);
      const values = validateValues(fields, {}, input.customValues);
      assertStageRequirements(stage, fields, values);

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
          tags: input.tags,
          customValues: values as Prisma.InputJsonValue,
        },
        include: opportunityInclude,
      });
      await recordAudit(tx, {
        workspaceId,
        actor: actorOf(req),
        action: 'OPPORTUNITY_CREATED',
        entityType: 'Opportunity',
        entityId: opportunity.id,
        after: { title: opportunity.title, value: input.value, currency: input.currency, pipeline: pipeline.name, stage: stage.name, customValues: values },
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
    const [payments, fields, stages, history] = await Promise.all([
      hasPermission(req, 'payment:read')
        ? prisma.payment.findMany({ where: { opportunityId: opportunity.id }, orderBy: { createdAt: 'desc' } })
        : Promise.resolve([]),
      activeFields(prisma, req.ctx.workspaceId, 'OPPORTUNITY', opportunity.pipelineId),
      prisma.pipelineStage.findMany({ where: { pipelineId: opportunity.pipelineId }, orderBy: { position: 'asc' } }),
      prisma.auditEvent.findMany({ where: { workspaceId: req.ctx.workspaceId, entityType: 'Opportunity', entityId: opportunity.id }, orderBy: { createdAt: 'asc' } }),
    ]);
    ok(req, res, {
      ...presentOpportunity(opportunity, canSeeValue),
      // The form: which fields to show, and what each stage requires before a deal can enter it.
      fields,
      stages: stages.map((s) => ({ id: s.id, name: s.name, position: s.position, isWonStage: s.isWonStage, isLostStage: s.isLostStage, requiredFields: fields.filter((f) => s.requiredFieldIds.includes(f.id)).map((f) => f.key) })),
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
      // F2.7: who changed what, and when (values hidden from users without the value permission).
      history: history.map((h) => ({
        action: h.action,
        actor: h.actorName ?? h.actorType,
        at: h.createdAt,
        before: canSeeValue ? h.previousState : null,
        after: canSeeValue ? h.newState : null,
      })),
    });
  })
);

const updateSchema = z
  .object({
    title: z.string().trim().min(2).max(200).optional(),
    value: z.number().min(0).max(9_999_999_999).optional(),
    stageId: z.string().uuid().optional(),
    assignedUserId: z.string().uuid().optional(),
    tags: tagList.optional(),
    customValues: z.record(z.unknown()).optional(),
    version: z.number().int().min(0),
  })
  .refine((v) => Object.keys(v).some((k) => k !== 'version'), { message: 'Nothing to update' });

/**
 * PATCH /opportunities/:id. Version-checked (Q4). Moving into a stage is refused until that
 * stage's required fields are filled (F2.4).
 */
crmRouter.patch(
  '/opportunities/:id',
  requirePermission('opportunity:update'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const input = parse(updateSchema, req.body);
    if (input.value !== undefined && !hasPermission(req, 'opportunity:view_value')) {
      throw new AppError('You cannot change a value you are not allowed to see', 403, 'FORBIDDEN_INSUFFICIENT_PERMISSIONS');
    }
    const ws = req.ctx.workspaceId;
    const before = await findOpportunity(req, req.params.id);
    const targetStage = input.stageId
      ? await prisma.pipelineStage.findFirst({ where: { id: input.stageId, pipelineId: before.pipelineId, workspaceId: ws } })
      : before.stage;
    if (!targetStage) throw new AppError('Stage not found in this pipeline', 400, 'VALIDATION_FAILED');
    if (input.assignedUserId && !(await prisma.membership.findFirst({ where: { workspaceId: ws, userId: input.assignedUserId, status: 'ACTIVE' } }))) {
      throw new AppError('Assigned user is not an active member', 400, 'VALIDATION_FAILED');
    }

    const fields = await activeFields(prisma, ws, 'OPPORTUNITY', before.pipelineId);
    const values: Values = validateValues(fields, before.customValues, input.customValues);
    if (input.stageId && input.stageId !== before.stageId) assertStageRequirements(targetStage, fields, values);

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.opportunity.updateMany({
        where: { id: before.id, workspaceId: ws, version: input.version },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.value !== undefined ? { value: new Prisma.Decimal(input.value) } : {}),
          ...(input.stageId ? { stageId: input.stageId } : {}),
          ...(input.assignedUserId ? { assignedUserId: input.assignedUserId } : {}),
          ...(input.tags ? { tags: input.tags } : {}),
          ...(input.customValues ? { customValues: values as Prisma.InputJsonValue } : {}),
          version: { increment: 1 },
        },
      });
      if (result.count === 0) {
        throw new AppError('Someone else changed this opportunity. Reload to see their changes.', 409, 'VERSION_CONFLICT');
      }
      await recordAudit(tx, {
        workspaceId: ws,
        actor: actorOf(req),
        action: input.stageId && input.stageId !== before.stageId ? 'OPPORTUNITY_STAGE_CHANGED' : 'OPPORTUNITY_UPDATED',
        entityType: 'Opportunity',
        entityId: before.id,
        before: { title: before.title, value: Number(before.value), stage: before.stage?.name, assignedUserId: before.assignedUserId, tags: before.tags, customValues: before.customValues },
        after: {
          title: input.title ?? before.title,
          value: input.value ?? Number(before.value),
          stage: targetStage.name,
          assignedUserId: input.assignedUserId ?? before.assignedUserId,
          tags: input.tags ?? before.tags,
          customValues: values,
        },
        ipAddress: clientIp(req),
        requestId: req.id,
      });
      return tx.opportunity.findUniqueOrThrow({ where: { id: before.id }, include: opportunityInclude });
    });

    // A stage change on a lead's deal is a recorded action on that lead (glossary: Acknowledged).
    if (input.stageId && input.stageId !== before.stageId && before.leadId) {
      await recordLeadAction({
        workspaceId: ws,
        leadId: before.leadId,
        actor: actorOf(req),
        kind: 'STAGE_CHANGE',
        body: `Deal "${updated.title}" moved to ${targetStage.name}`,
      });
    }

    ok(req, res, presentOpportunity(updated, hasPermission(req, 'opportunity:view_value')));
  })
);

crmRouter.all('*', (_req, _res, next) => {
  next(new AppError('CRM endpoint not found', 404, 'NOT_FOUND'));
});
