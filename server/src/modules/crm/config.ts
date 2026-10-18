/**
 * CRM configuration without code (F2.2–F2.6): pipelines, stages, custom fields, saved lists.
 * Every configuration change is written to the audit log (F4.1).
 */
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ok, parse, paginate, paginationSchema, clientIp } from '../../lib/http';
import { recordAudit } from '../../lib/audit';
import { AppError } from '../../middleware/errorHandler';
import { requirePermission, hasPermission } from '../../middleware/authMiddleware';
import { ScopedRequest } from '../../middleware/workspaceContext';
import { FIELD_TYPES, toKey, filterSchema, buildOpportunityWhere, Filters } from './fields';
import { presentOpportunity, opportunityInclude } from './service';

export const crmConfigRouter = Router();

const actorOf = (req: ScopedRequest) => ({ type: 'USER' as const, id: req.auth.userId, name: req.auth.name });
const audit = (req: ScopedRequest, action: string, entityType: string, entityId: string, before?: unknown, after?: unknown) =>
  prisma.$transaction((tx) =>
    recordAudit(tx, { workspaceId: req.ctx.workspaceId, actor: actorOf(req), action, entityType, entityId, before, after, ipAddress: clientIp(req), requestId: req.id })
  );

async function findPipeline(req: ScopedRequest, id: string) {
  const p = await prisma.pipeline.findFirst({ where: { id, workspaceId: req.ctx.workspaceId }, include: { stages: { orderBy: { position: 'asc' } } } });
  if (!p) throw new AppError('Pipeline not found', 404, 'NOT_FOUND');
  return p;
}

async function findStage(req: ScopedRequest, id: string) {
  const s = await prisma.pipelineStage.findFirst({ where: { id, workspaceId: req.ctx.workspaceId } });
  if (!s) throw new AppError('Stage not found', 404, 'NOT_FOUND');
  return s;
}

// ----------------------------------------------------
// Pipelines (F2.3, F2.5)
// ----------------------------------------------------
const pipelineSchema = z.object({
  name: z.string().trim().min(2).max(60),
  stages: z.array(z.string().trim().min(1).max(40)).min(1).max(20).default(['New', 'In progress', 'Won', 'Lost']),
});

crmConfigRouter.post(
  '/pipelines',
  requirePermission('pipeline:manage'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const input = parse(pipelineSchema, req.body);
    const ws = req.ctx.workspaceId;
    const pipeline = await prisma.pipeline.create({
      data: {
        workspaceId: ws,
        name: input.name,
        stages: {
          create: input.stages.map((name, position) => ({
            workspaceId: ws,
            name,
            position,
            isWonStage: /^won$/i.test(name),
            isLostStage: /^lost$/i.test(name),
          })),
        },
      },
      include: { stages: { orderBy: { position: 'asc' } } },
    });
    await audit(req, 'PIPELINE_CREATED', 'Pipeline', pipeline.id, undefined, { name: pipeline.name, stages: input.stages });
    ok(req, res, pipeline, 201);
  })
);

crmConfigRouter.patch(
  '/pipelines/:id',
  requirePermission('pipeline:manage'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const { name } = parse(z.object({ name: z.string().trim().min(2).max(60) }), req.body);
    const before = await findPipeline(req, req.params.id);
    const updated = await prisma.pipeline.update({ where: { id: before.id }, data: { name } });
    await audit(req, 'PIPELINE_RENAMED', 'Pipeline', before.id, { name: before.name }, { name });
    ok(req, res, updated);
  })
);

const stageSchema = z.object({
  name: z.string().trim().min(1).max(40),
  isWonStage: z.boolean().default(false),
  isLostStage: z.boolean().default(false),
});

/** Add a stage at the end of the pipeline. */
crmConfigRouter.post(
  '/pipelines/:id/stages',
  requirePermission('pipeline:manage'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const input = parse(stageSchema, req.body);
    const pipeline = await findPipeline(req, req.params.id);
    const stage = await prisma.pipelineStage.create({
      data: { workspaceId: req.ctx.workspaceId, pipelineId: pipeline.id, position: pipeline.stages.length, ...input },
    });
    await audit(req, 'STAGE_CREATED', 'PipelineStage', stage.id, undefined, { pipeline: pipeline.name, name: stage.name });
    ok(req, res, stage, 201);
  })
);

/** Reorder: send every stage id of the pipeline in the new order. */
crmConfigRouter.put(
  '/pipelines/:id/stage-order',
  requirePermission('pipeline:manage'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const { stageIds } = parse(z.object({ stageIds: z.array(z.string().uuid()).min(1) }), req.body);
    const pipeline = await findPipeline(req, req.params.id);
    const current = pipeline.stages.map((s) => s.id);
    if (stageIds.length !== current.length || !stageIds.every((id) => current.includes(id))) {
      throw new AppError('Send every stage of this pipeline exactly once', 400, 'VALIDATION_FAILED');
    }
    await prisma.$transaction(stageIds.map((id, position) => prisma.pipelineStage.update({ where: { id }, data: { position } })));
    await audit(req, 'STAGES_REORDERED', 'Pipeline', pipeline.id,
      { order: pipeline.stages.map((s) => s.name) },
      { order: stageIds.map((id) => pipeline.stages.find((s) => s.id === id)!.name) });
    ok(req, res, await findPipeline(req, pipeline.id));
  })
);

const stageUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    isWonStage: z.boolean().optional(),
    isLostStage: z.boolean().optional(),
    requiredFieldIds: z.array(z.string().uuid()).max(30).optional(), // F2.4
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

/** Rename a stage, or set which fields must be filled before a deal can enter it (F2.4). */
crmConfigRouter.patch(
  '/stages/:id',
  requirePermission('pipeline:manage'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const input = parse(stageUpdateSchema, req.body);
    const before = await findStage(req, req.params.id);
    if (input.requiredFieldIds?.length) {
      const valid = await prisma.customField.count({
        where: { id: { in: input.requiredFieldIds }, workspaceId: req.ctx.workspaceId, pipelineId: before.pipelineId, archivedAt: null },
      });
      if (valid !== new Set(input.requiredFieldIds).size) {
        throw new AppError('Required fields must be active fields of this pipeline', 400, 'VALIDATION_FAILED');
      }
    }
    const updated = await prisma.pipelineStage.update({ where: { id: before.id }, data: input });
    await audit(req, 'STAGE_UPDATED', 'PipelineStage', before.id,
      { name: before.name, requiredFieldIds: before.requiredFieldIds },
      { name: updated.name, requiredFieldIds: updated.requiredFieldIds });
    ok(req, res, updated);
  })
);

/**
 * Delete a stage safely (F2.5). If deals sit in it, `moveToStageId` (same pipeline) is required
 * and they are moved first, so no opportunity is ever left without a stage.
 */
crmConfigRouter.delete(
  '/stages/:id',
  requirePermission('pipeline:manage'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const moveTo = parse(z.object({ moveToStageId: z.string().uuid().optional() }), req.query).moveToStageId;
    const stage = await findStage(req, req.params.id);
    const pipeline = await findPipeline(req, stage.pipelineId);
    if (pipeline.stages.length <= 1) throw new AppError('A pipeline needs at least one stage', 409, 'LAST_STAGE');
    const count = await prisma.opportunity.count({ where: { stageId: stage.id } });
    if (count > 0) {
      if (!moveTo) {
        throw new AppError(`This stage still has ${count} deal(s). Choose a stage to move them to first.`, 409, 'STAGE_NOT_EMPTY',
          [{ field: 'moveToStageId', message: `${count} opportunities must be moved`, code: 'REQUIRED' }]);
      }
      if (moveTo === stage.id || !pipeline.stages.some((s) => s.id === moveTo)) {
        throw new AppError('Move deals to another stage of the same pipeline', 400, 'VALIDATION_FAILED');
      }
    }
    await prisma.$transaction(async (tx) => {
      if (count > 0) await tx.opportunity.updateMany({ where: { stageId: stage.id }, data: { stageId: moveTo!, version: { increment: 1 } } });
      await tx.pipelineStage.delete({ where: { id: stage.id } });
      const rest = pipeline.stages.filter((s) => s.id !== stage.id);
      for (const [position, s] of rest.entries()) await tx.pipelineStage.update({ where: { id: s.id }, data: { position } });
      await recordAudit(tx, {
        workspaceId: req.ctx.workspaceId, actor: actorOf(req), action: 'STAGE_DELETED', entityType: 'PipelineStage', entityId: stage.id,
        before: { name: stage.name, pipeline: pipeline.name, opportunities: count }, after: { movedTo: moveTo ?? null },
      });
    });
    ok(req, res, { deleted: true, movedOpportunities: count });
  })
);

// ----------------------------------------------------
// Custom fields (F2.2, F2.3)
// ----------------------------------------------------
const fieldSchema = z
  .object({
    entity: z.enum(['OPPORTUNITY', 'CONTACT']).default('OPPORTUNITY'),
    pipelineId: z.string().uuid().optional(),
    label: z.string().trim().min(1).max(60),
    type: z.enum(FIELD_TYPES),
    options: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  })
  .refine((v) => v.entity === 'CONTACT' || v.pipelineId, { message: 'Opportunity fields belong to a pipeline', path: ['pipelineId'] })
  .refine((v) => v.type !== 'DROPDOWN' || v.options.length >= 2, { message: 'A dropdown needs at least 2 options', path: ['options'] });

crmConfigRouter.get(
  '/fields',
  requirePermission('opportunity:read'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const q = parse(z.object({ entity: z.enum(['OPPORTUNITY', 'CONTACT']).optional(), pipelineId: z.string().uuid().optional() }), req.query);
    const items = await prisma.customField.findMany({
      where: { workspaceId: req.ctx.workspaceId, archivedAt: null, ...(q.entity ? { entity: q.entity } : {}), ...(q.pipelineId ? { pipelineId: q.pipelineId } : {}) },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    ok(req, res, { items, types: FIELD_TYPES });
  })
);

crmConfigRouter.post(
  '/fields',
  requirePermission('field:manage'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const input = parse(fieldSchema, req.body);
    const ws = req.ctx.workspaceId;
    if (input.pipelineId) await findPipeline(req, input.pipelineId);
    const pipelineId = input.entity === 'CONTACT' ? null : input.pipelineId!;
    const siblings = await prisma.customField.findMany({ where: { workspaceId: ws, entity: input.entity, pipelineId, archivedAt: null } });
    let key = toKey(input.label);
    if (siblings.some((f) => f.key === key)) key = `${key}_${siblings.length + 1}`;
    const field = await prisma.customField.create({
      data: { workspaceId: ws, entity: input.entity, pipelineId, key, label: input.label, type: input.type, options: input.type === 'DROPDOWN' ? input.options : [], position: siblings.length },
    });
    await audit(req, 'FIELD_CREATED', 'CustomField', field.id, undefined, { label: field.label, type: field.type, entity: field.entity, pipelineId });
    ok(req, res, field, 201);
  })
);

crmConfigRouter.patch(
  '/fields/:id',
  requirePermission('field:manage'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const input = parse(
      z.object({ label: z.string().trim().min(1).max(60).optional(), options: z.array(z.string().trim().min(1).max(60)).max(50).optional(), position: z.number().int().min(0).optional() }),
      req.body
    );
    const before = await prisma.customField.findFirst({ where: { id: req.params.id, workspaceId: req.ctx.workspaceId, archivedAt: null } });
    if (!before) throw new AppError('Field not found', 404, 'NOT_FOUND');
    if (input.options && before.type !== 'DROPDOWN') throw new AppError('Only dropdown fields have options', 400, 'VALIDATION_FAILED');
    const updated = await prisma.customField.update({ where: { id: before.id }, data: input });
    await audit(req, 'FIELD_UPDATED', 'CustomField', before.id, { label: before.label, options: before.options }, { label: updated.label, options: updated.options });
    ok(req, res, updated);
  })
);

/** Archive a field: it leaves forms and stage requirements; stored values are kept (Q4). */
crmConfigRouter.delete(
  '/fields/:id',
  requirePermission('field:manage'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const field = await prisma.customField.findFirst({ where: { id: req.params.id, workspaceId: req.ctx.workspaceId, archivedAt: null } });
    if (!field) throw new AppError('Field not found', 404, 'NOT_FOUND');
    await prisma.$transaction(async (tx) => {
      await tx.customField.update({ where: { id: field.id }, data: { archivedAt: new Date() } });
      const stages = await tx.pipelineStage.findMany({ where: { workspaceId: req.ctx.workspaceId, requiredFieldIds: { has: field.id } } });
      for (const s of stages) await tx.pipelineStage.update({ where: { id: s.id }, data: { requiredFieldIds: s.requiredFieldIds.filter((id) => id !== field.id) } });
      await recordAudit(tx, { workspaceId: req.ctx.workspaceId, actor: actorOf(req), action: 'FIELD_ARCHIVED', entityType: 'CustomField', entityId: field.id, before: { label: field.label, type: field.type } });
    });
    ok(req, res, { archived: true });
  })
);

// ----------------------------------------------------
// Saved lists (F2.6)
// ----------------------------------------------------
const listSchema = z.object({
  name: z.string().trim().min(2).max(60),
  filters: filterSchema,
  shared: z.boolean().default(false),
});

const visibleLists = (req: ScopedRequest) => ({
  workspaceId: req.ctx.workspaceId,
  OR: [{ ownerId: req.auth.userId }, { shared: true }],
});

crmConfigRouter.get(
  '/lists',
  requirePermission('opportunity:read'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const lists = await prisma.savedList.findMany({ where: visibleLists(req), orderBy: { createdAt: 'desc' } });
    const canSeeValue = hasPermission(req, 'opportunity:view_value');
    const items = await Promise.all(
      lists.map(async (l) => {
        let count: number | null = null;
        try {
          count = await prisma.opportunity.count({ where: buildOpportunityWhere(req.ctx.workspaceId, l.filters as Filters, canSeeValue) });
        } catch {
          count = null; // e.g. a shared list filtering by value, seen by someone without value permission
        }
        return { ...l, count };
      })
    );
    ok(req, res, { items });
  })
);

crmConfigRouter.post(
  '/lists',
  requirePermission('opportunity:read'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const input = parse(listSchema, req.body);
    buildOpportunityWhere(req.ctx.workspaceId, input.filters, hasPermission(req, 'opportunity:view_value')); // validates permission
    const list = await prisma.savedList.create({
      data: { workspaceId: req.ctx.workspaceId, ownerId: req.auth.userId, name: input.name, filters: input.filters as Prisma.InputJsonValue, shared: input.shared },
    });
    ok(req, res, list, 201);
  })
);

/** GET /lists/:id/items: runs the saved filters NOW, so the list follows the records as they change. */
crmConfigRouter.get(
  '/lists/:id/items',
  requirePermission('opportunity:read'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const { page, limit } = parse(paginationSchema, req.query);
    const list = await prisma.savedList.findFirst({ where: { id: req.params.id, ...visibleLists(req) } });
    if (!list) throw new AppError('List not found', 404, 'NOT_FOUND');
    const canSeeValue = hasPermission(req, 'opportunity:view_value');
    const where = buildOpportunityWhere(req.ctx.workspaceId, list.filters as Filters, canSeeValue);
    const [total, items] = await Promise.all([
      prisma.opportunity.count({ where }),
      prisma.opportunity.findMany({ where, include: opportunityInclude, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    ]);
    ok(req, res, { list: { id: list.id, name: list.name, filters: list.filters }, items: items.map((o) => presentOpportunity(o, canSeeValue)), pagination: paginate(page, limit, total) });
  })
);

crmConfigRouter.delete(
  '/lists/:id',
  requirePermission('opportunity:read'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const list = await prisma.savedList.findFirst({ where: { id: req.params.id, workspaceId: req.ctx.workspaceId, ownerId: req.auth.userId } });
    if (!list) throw new AppError('List not found (only its creator can delete it)', 404, 'NOT_FOUND');
    await prisma.savedList.delete({ where: { id: list.id } });
    ok(req, res, { deleted: true });
  })
);
