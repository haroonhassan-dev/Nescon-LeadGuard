import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ok } from '../../lib/http';
import { requirePermission, hasPermission } from '../../middleware/authMiddleware';
import { ScopedRequest } from '../../middleware/workspaceContext';
import { getSettings } from '../leads/settings';
import { buildRecoveryWhere } from '../leads/recovery';

/**
 * Operational dashboard (F5), computed from stored records using the glossary definitions.
 * Owner/Admin (dashboard:company) see company-wide figures; others see their own (F5.4).
 * "Today" is the current UTC day until per-workspace time zones are wired in.
 */
export const dashboardRouter = Router();

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

dashboardRouter.get(
  '/summary',
  requirePermission('dashboard:read'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const workspaceId = req.ctx.workspaceId;
    const userId = req.auth.userId;
    const company = hasPermission(req, 'dashboard:company');
    const now = new Date();
    const dayStart = startOfUtcDay(now);
    const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000);
    const settings = await getSettings(prisma, workspaceId);

    const leadScope: Prisma.LeadWhereInput = company ? { workspaceId } : { workspaceId, currentOwnerId: userId };

    // Time to first response = first assignment → first acknowledgement (glossary).
    // Personal view: this user's own assignments → their acknowledgement.
    const responseRows = company
      ? await prisma.$queryRaw<Array<{ avg: number | null; n: bigint }>>`
          SELECT AVG(EXTRACT(EPOCH FROM ("firstAcknowledgedAt" - "firstAssignedAt")))::float AS avg, COUNT(*) AS n
          FROM leads
          WHERE "workspaceId" = ${workspaceId} AND "firstAcknowledgedAt" IS NOT NULL AND "firstAssignedAt" IS NOT NULL`
      : await prisma.$queryRaw<Array<{ avg: number | null; n: bigint }>>`
          SELECT AVG(EXTRACT(EPOCH FROM ("acknowledgedAt" - "assignedAt")))::float AS avg, COUNT(*) AS n
          FROM lead_assignments
          WHERE "workspaceId" = ${workspaceId} AND "userId" = ${userId} AND "acknowledgedAt" IS NOT NULL`;

    const recoveryWhere = buildRecoveryWhere(workspaceId, settings, now);

    const [newLeadsToday, openLeads, awaitingAck, recoveryQueue, escalations24h, availability] = await Promise.all([
      prisma.lead.count({ where: { ...leadScope, createdAt: { gte: dayStart } } }),
      prisma.lead.count({ where: { ...leadScope, status: { in: ['ASSIGNED', 'ACKNOWLEDGED'] } } }),
      prisma.lead.count({ where: { ...leadScope, status: 'ASSIGNED' } }),
      company && hasPermission(req, 'lead:read_all') ? prisma.lead.count({ where: recoveryWhere }) : Promise.resolve(null),
      prisma.leadAssignment.count({
        where: { workspaceId, kind: 'ESCALATION', assignedAt: { gte: dayAgo }, ...(company ? {} : { userId }) },
      }),
      company
        ? prisma.membership.groupBy({ by: ['availability'], where: { workspaceId, status: 'ACTIVE' }, _count: { _all: true } })
        : Promise.resolve(null),
    ]);

    // Collected revenue (glossary): payments confirmed by the provider's webhook, minus confirmed refunds.
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const canSeeValue = hasPermission(req, 'opportunity:view_value');
    const collectedRows = canSeeValue
      ? await prisma.payment.groupBy({
          by: ['currency'],
          where: {
            workspaceId,
            status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
            paidAt: { gte: monthStart },
            ...(company ? {} : { requestedById: userId }),
          },
          _sum: { amount: true, refundedAmount: true },
          _count: { _all: true },
        })
      : null;

    // Open pipeline value: opportunities not in a won or lost stage, grouped by stage; value permission only.
    const pipelineRows = canSeeValue
      ? await prisma.$queryRaw<Array<{ stageId: string; stage: string; position: number; currency: string; total: string; n: bigint }>>`
          SELECT s.id AS "stageId", s.name AS stage, s.position, o.currency, SUM(o.value)::text AS total, COUNT(*) AS n
          FROM opportunities o JOIN pipeline_stages s ON s.id = o."stageId"
          WHERE o."workspaceId" = ${workspaceId} AND s."isWonStage" = false AND s."isLostStage" = false
            ${company ? Prisma.empty : Prisma.sql`AND o."assignedUserId" = ${userId}`}
          GROUP BY s.id, s.name, s.position, o.currency
          ORDER BY s.position`
      : null;

    const weekAhead = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    const upcomingAppointments = await prisma.appointment.count({
      where: {
        workspaceId,
        status: { not: 'CANCELLED' },
        startTime: { gte: now, lt: weekAhead },
        ...(company ? {} : { assignedUserId: userId }),
      },
    });

    ok(req, res, {
      scope: company ? 'company' : 'personal',
      generatedAt: now.toISOString(),
      dayStartsAt: dayStart.toISOString(),
      figures: {
        newLeadsToday,
        openLeads,
        awaitingAcknowledgement: awaitingAck,
        averageFirstResponseSeconds: responseRows[0]?.avg !== null && responseRows[0]?.avg !== undefined
          ? Math.round(responseRows[0].avg)
          : null,
        firstResponseSampleSize: Number(responseRows[0]?.n ?? 0),
        recoveryQueue,
        escalationsLast24h: escalations24h,
        availability: availability
          ? Object.fromEntries(availability.map((a) => [a.availability, a._count._all]))
          : null,
        // null = hidden by permission (not zero)
        paymentsReceivedThisMonth: collectedRows
          ? collectedRows.map((r) => ({
              currency: r.currency,
              collectedCents: (r._sum.amount ?? 0) - (r._sum.refundedAmount ?? 0),
              payments: r._count._all,
            }))
          : null,
        openPipelineValueByStage: pipelineRows
          ? pipelineRows.map((r) => ({
              stageId: r.stageId,
              stage: r.stage,
              currency: r.currency,
              total: Number(r.total),
              opportunities: Number(r.n),
            }))
          : null,
      },
      upcomingAppointmentsNext7Days: upcomingAppointments,
      monthStartsAt: monthStart.toISOString(),
      drillDown: {
        newLeadsToday: `/api/leads?createdFrom=${dayStart.toISOString()}`,
        awaitingAcknowledgement: '/api/leads?status=ASSIGNED',
        recoveryQueue: '/api/leads/recovery-queue',
        paymentsReceivedThisMonth: '/api/integrations/stripe/payments?status=PAID',
        openPipelineValueByStage: '/api/crm/opportunities?stageId={stageId}',
      },
    });
  })
);
