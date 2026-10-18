import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ok, parse, paginate, paginationSchema } from '../../lib/http';
import { authenticate, requirePermission, hasPermission } from '../../middleware/authMiddleware';
import { requireWorkspaceContext, ScopedRequest, WorkspaceScopedRequest } from '../../middleware/workspaceContext';
import { createPaymentRequest, MIN_EXPIRY_MINUTES, MAX_EXPIRY_MINUTES } from './payments';
import { processStripeWebhook } from './webhook';
import { isStripeConfigured } from './client';

export const stripeRouter = Router();

const tenant = [authenticate, requireWorkspaceContext];

/**
 * POST /api/integrations/stripe/webhook
 * Public: authenticated by Stripe's signature, not by a session.
 */
stripeRouter.post(
  '/webhook',
  asyncHandler<WorkspaceScopedRequest>(async (req, res) => {
    const outcome = await processStripeWebhook(req.rawBody, req.headers['stripe-signature'] as string | undefined);
    res.status(outcome.status).json(outcome.body);
  })
);

const requestSchema = z.object({
  opportunityId: z.string().uuid(),
  amount: z
    .number()
    .min(0.5, 'Stripe needs at least 0.50')
    .max(999_999.99)
    .refine((v) => Math.round(v * 100) === Number((v * 100).toFixed(2)), 'At most 2 decimal places'),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, 'Use a 3-letter currency code like USD').optional(),
  expiresInMinutes: z.number().int().min(MIN_EXPIRY_MINUTES).max(MAX_EXPIRY_MINUTES).default(60),
});

/**
 * POST /api/integrations/stripe/payment-requests
 * Creates a Stripe Checkout link for an opportunity (I2.1). The employee sends the link to the customer.
 */
stripeRouter.post(
  '/payment-requests',
  ...tenant,
  requirePermission('payment:create'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const input = parse(requestSchema, req.body);
    const opportunity = await prisma.opportunity.findFirst({
      where: { id: input.opportunityId, workspaceId: req.ctx.workspaceId },
      select: { currency: true },
    });
    const payment = await createPaymentRequest({
      workspaceId: req.ctx.workspaceId,
      opportunityId: input.opportunityId,
      amountCents: Math.round(input.amount * 100),
      currency: input.currency ?? opportunity?.currency ?? 'USD',
      expiresInMinutes: input.expiresInMinutes,
      requestedBy: { id: req.auth.userId, name: req.auth.name },
    });
    ok(
      req,
      res,
      {
        paymentId: payment.id,
        status: payment.status,
        checkoutUrl: payment.checkoutUrl,
        expiresAt: payment.expiresAt?.toISOString() ?? null,
        providerReference: payment.providerReference,
        testModeHint: 'Pay with test card 4242 4242 4242 4242, any future date, any CVC.',
      },
      201
    );
  })
);

const listSchema = paginationSchema.extend({
  status: z.enum(['PENDING', 'PAID', 'EXPIRED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED']).optional(),
  opportunityId: z.string().uuid().optional(),
});

/** GET /api/integrations/stripe/payments: traceable list (I2.7). Amounts follow the value permission. */
stripeRouter.get(
  '/payments',
  ...tenant,
  requirePermission('payment:read'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const q = parse(listSchema, req.query);
    const where: Prisma.PaymentWhereInput = {
      workspaceId: req.ctx.workspaceId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.opportunityId ? { opportunityId: q.opportunityId } : {}),
    };
    const canSeeValue = hasPermission(req, 'opportunity:view_value');
    const [total, items] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        include: {
          opportunity: { select: { id: true, title: true } },
          contact: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
    ]);
    const requesterIds = [...new Set(items.map((p) => p.requestedById).filter(Boolean) as string[])];
    const requesters = await prisma.user.findMany({ where: { id: { in: requesterIds } }, select: { id: true, firstName: true, lastName: true } });
    const nameOf = new Map(requesters.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));

    ok(req, res, {
      items: items.map((p) => ({
        id: p.id,
        status: p.status,
        amount: canSeeValue ? p.amount : null,
        refundedAmount: canSeeValue ? p.refundedAmount : null,
        currency: p.currency,
        opportunity: p.opportunity,
        contact: p.contact ? { id: p.contact.id, name: `${p.contact.firstName} ${p.contact.lastName}`.trim() } : null,
        requestedBy: p.requestedById ? { id: p.requestedById, name: nameOf.get(p.requestedById) ?? 'unknown' } : null,
        providerReference: p.providerReference,
        stripePaymentIntentId: p.stripePaymentIntentId,
        checkoutUrl: p.status === 'PENDING' ? p.checkoutUrl : null,
        failureReason: p.failureReason,
        expiresAt: p.expiresAt?.toISOString() ?? null,
        paidAt: p.paidAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
      })),
      pagination: paginate(q.page, q.limit, total),
    });
  })
);

/** GET /api/integrations/stripe/status: what works and what does not (I5.1, I5.6). */
stripeRouter.get(
  '/status',
  ...tenant,
  requirePermission('integration:manage'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const [lastOk, recentErrors] = await Promise.all([
      prisma.integrationEvent.findFirst({
        where: { provider: 'stripe', result: 'OK', OR: [{ workspaceId: req.ctx.workspaceId }, { workspaceId: null }] },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.integrationEvent.findMany({
        where: { provider: 'stripe', result: { in: ['FAILED', 'REJECTED'] }, OR: [{ workspaceId: req.ctx.workspaceId }, { workspaceId: null }] },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);
    const configured = isStripeConfigured() && Boolean(process.env.STRIPE_WEBHOOK_SECRET);
    ok(req, res, {
      provider: 'stripe',
      status: !configured ? 'not_connected' : recentErrors[0] && (!lastOk || recentErrors[0].createdAt > lastOk.createdAt) ? 'error' : 'connected',
      mode: 'test',
      lastWorkedAt: lastOk?.createdAt.toISOString() ?? null,
      recentErrors: recentErrors.map((e) => ({ at: e.createdAt.toISOString(), type: e.eventType, result: e.result, detail: e.detail })),
      limits: [
        'Test mode only: no real money moves. Pay with test card 4242 4242 4242 4242.',
        'Card details are entered only on Stripe’s hosted page; this platform never sees them.',
        'Payment links expire between 30 minutes and 24 hours after creation.',
        'Refunds are made in the Stripe dashboard and appear here automatically.',
      ],
    });
  })
);
