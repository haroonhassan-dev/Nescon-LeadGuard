/**
 * Custom field rules (F2.2–F2.4, F2.6): typed values, required-by-stage checks, and the
 * filter language used by saved lists.
 */
import { CustomField, PipelineStage, Prisma } from '@prisma/client';
import { z } from 'zod';
import { Tx } from '../../lib/prisma';
import { AppError } from '../../middleware/errorHandler';

export const FIELD_TYPES = ['TEXT', 'NUMBER', 'DATE', 'DROPDOWN', 'CHECKBOX'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
export type Values = Record<string, string | number | boolean | null>;

export function toKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'field';
}

/** Active fields for an opportunity in a pipeline, or for contacts. */
export async function activeFields(tx: Tx, workspaceId: string, entity: 'OPPORTUNITY' | 'CONTACT', pipelineId?: string | null) {
  return tx.customField.findMany({
    where: { workspaceId, entity, archivedAt: null, ...(entity === 'OPPORTUNITY' ? { pipelineId: pipelineId ?? undefined } : {}) },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });
}

/** Checks each value against its field type and returns the merged, cleaned values. */
export function validateValues(fields: CustomField[], current: unknown, incoming: Record<string, unknown> | undefined): Values {
  const merged: Values = { ...((current as Values) ?? {}) };
  if (!incoming) return merged;
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const errors: Array<{ field: string; message: string }> = [];

  for (const [key, raw] of Object.entries(incoming)) {
    const field = byKey.get(key);
    if (!field) {
      errors.push({ field: key, message: 'This field does not exist for this pipeline' });
      continue;
    }
    if (raw === null || raw === '') {
      merged[key] = null;
      continue;
    }
    switch (field.type as FieldType) {
      case 'TEXT':
        if (typeof raw !== 'string' || raw.length > 1000) errors.push({ field: key, message: `${field.label}: text up to 1000 characters` });
        else merged[key] = raw.trim();
        break;
      case 'NUMBER': {
        const n = typeof raw === 'number' ? raw : Number(raw);
        if (!Number.isFinite(n)) errors.push({ field: key, message: `${field.label}: must be a number` });
        else merged[key] = n;
        break;
      }
      case 'DATE': {
        const s = String(raw);
        if (!/^\d{4}-\d{2}-\d{2}/.test(s) || Number.isNaN(Date.parse(s))) errors.push({ field: key, message: `${field.label}: use a date like 2026-10-25` });
        else merged[key] = s.slice(0, 10);
        break;
      }
      case 'DROPDOWN':
        if (typeof raw !== 'string' || !field.options.includes(raw)) errors.push({ field: key, message: `${field.label}: choose one of ${field.options.join(', ')}` });
        else merged[key] = raw;
        break;
      case 'CHECKBOX':
        if (typeof raw !== 'boolean') errors.push({ field: key, message: `${field.label}: must be true or false` });
        else merged[key] = raw;
        break;
    }
  }
  if (errors.length) throw new AppError('Some field values are invalid', 400, 'VALIDATION_FAILED', errors);
  return merged;
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || v === false;

/** F2.4: refuses a stage whose required fields are not filled, naming each missing field. */
export function assertStageRequirements(stage: PipelineStage, fields: CustomField[], values: Values) {
  const missing = fields.filter((f) => stage.requiredFieldIds.includes(f.id) && isEmpty(values[f.key]));
  if (missing.length) {
    throw new AppError(
      `Fill in ${missing.map((f) => `"${f.label}"`).join(', ')} before moving this deal to "${stage.name}".`,
      422,
      'STAGE_REQUIREMENTS_NOT_MET',
      missing.map((f) => ({ field: f.key, message: `${f.label} is required in stage ${stage.name}`, code: 'REQUIRED' }))
    );
  }
}

// ----------------------------------------------------
// Filters (F2.6). Saved lists store this object; it is evaluated on every read.
// ----------------------------------------------------
export const filterSchema = z
  .object({
    pipelineId: z.string().uuid().optional(),
    stageId: z.string().uuid().optional(),
    assignedUserId: z.string().uuid().optional(),
    tag: z.string().trim().max(50).optional(),
    createdFrom: z.coerce.date().optional(),
    createdTo: z.coerce.date().optional(),
    minValue: z.coerce.number().optional(),
    maxValue: z.coerce.number().optional(),
    fields: z
      .array(
        z.object({
          key: z.string().min(1).max(40),
          op: z.enum(['eq', 'contains', 'gte', 'lte']),
          value: z.union([z.string(), z.number(), z.boolean()]).optional(),
        })
      )
      .max(10)
      .optional(),
  })
  .strict();

export type Filters = z.infer<typeof filterSchema>;

export function buildOpportunityWhere(workspaceId: string, f: Filters, canSeeValue: boolean): Prisma.OpportunityWhereInput {
  if ((f.minValue !== undefined || f.maxValue !== undefined) && !canSeeValue) {
    throw new AppError('You cannot filter by a value you are not allowed to see', 403, 'FORBIDDEN_INSUFFICIENT_PERMISSIONS');
  }
  const and: Prisma.OpportunityWhereInput[] = [{ workspaceId }];
  if (f.pipelineId) and.push({ pipelineId: f.pipelineId });
  if (f.stageId) and.push({ stageId: f.stageId });
  if (f.assignedUserId) and.push({ assignedUserId: f.assignedUserId });
  if (f.tag) and.push({ tags: { has: f.tag } });
  if (f.createdFrom || f.createdTo) and.push({ createdAt: { ...(f.createdFrom ? { gte: f.createdFrom } : {}), ...(f.createdTo ? { lte: f.createdTo } : {}) } });
  if (f.minValue !== undefined) and.push({ value: { gte: f.minValue } });
  if (f.maxValue !== undefined) and.push({ value: { lte: f.maxValue } });
  for (const c of f.fields ?? []) {
    const path = [c.key];
    switch (c.op) {
      case 'eq':
        and.push({ customValues: { path, equals: c.value as Prisma.InputJsonValue } });
        break;
      case 'contains':
        and.push({ customValues: { path, string_contains: String(c.value ?? '') } });
        break;
      case 'gte':
        and.push({ customValues: { path, gte: c.value as number | string } });
        break;
      case 'lte':
        and.push({ customValues: { path, lte: c.value as number | string } });
        break;
    }
  }
  return { AND: and };
}
