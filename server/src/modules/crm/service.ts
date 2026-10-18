import { Opportunity, PipelineStage, Prisma } from '@prisma/client';
import { Tx } from '../../lib/prisma';

/** Stages every new workspace starts with. Admins will be able to edit them (F2.5, planned). */
export const DEFAULT_STAGES: Array<{ name: string; isWonStage?: boolean; isLostStage?: boolean }> = [
  { name: 'New' },
  { name: 'Site visit' },
  { name: 'Quote sent' },
  { name: 'Won', isWonStage: true },
  { name: 'Lost', isLostStage: true },
];

/** Returns the workspace's default pipeline, creating it on first use (also covers older workspaces). */
export async function ensureDefaultPipeline(tx: Tx, workspaceId: string) {
  const existing = await tx.pipeline.findFirst({
    where: { workspaceId, isDefault: true },
    include: { stages: { orderBy: { position: 'asc' } } },
  });
  if (existing) return existing;
  return tx.pipeline.create({
    data: {
      workspaceId,
      name: 'Sales',
      isDefault: true,
      stages: {
        create: DEFAULT_STAGES.map((stage, position) => ({
          workspaceId,
          name: stage.name,
          position,
          isWonStage: stage.isWonStage ?? false,
          isLostStage: stage.isLostStage ?? false,
        })),
      },
    },
    include: { stages: { orderBy: { position: 'asc' } } },
  });
}

type OpportunityWithRelations = Opportunity & {
  stage?: PipelineStage | null;
  contact?: { id: string; firstName: string; lastName: string; email: string | null; phone: string | null } | null;
  assignedUser?: { id: string; firstName: string; lastName: string } | null;
};

/**
 * API shape for an opportunity. Field-level protection (F1.4): without opportunity:view_value
 * the value is removed on the server, so no list, detail page or export can leak it.
 */
export function presentOpportunity(o: OpportunityWithRelations, canSeeValue: boolean) {
  return {
    id: o.id,
    title: o.title,
    value: canSeeValue ? Number(o.value) : null,
    valueMasked: !canSeeValue,
    currency: o.currency,
    pipelineId: o.pipelineId,
    stageId: o.stageId,
    stage: o.stage
      ? { id: o.stage.id, name: o.stage.name, isWonStage: o.stage.isWonStage, isLostStage: o.stage.isLostStage }
      : undefined,
    contactId: o.contactId,
    contact: o.contact
      ? {
          id: o.contact.id,
          name: `${o.contact.firstName} ${o.contact.lastName}`.trim(),
          email: o.contact.email,
          phone: o.contact.phone,
        }
      : null,
    leadId: o.leadId,
    assignedUser: o.assignedUser
      ? { id: o.assignedUser.id, name: `${o.assignedUser.firstName} ${o.assignedUser.lastName}`.trim() }
      : null,
    version: o.version,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

export const opportunityInclude = {
  stage: true,
  contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
  assignedUser: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.OpportunityInclude;
