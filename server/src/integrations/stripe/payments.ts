/**
 * Payment requests (I2.1, I2.7, I2.8).
 *
 * We never see card details: we ask Stripe for a hosted Checkout page and send the customer
 * there. Our metadata (workspace, opportunity, payment id) rides along, so when Stripe calls
 * the webhook later we know exactly which record to update.
 */
import { randomUUID } from 'crypto';
import { prisma } from '../../lib/prisma';
import { recordAudit } from '../../lib/audit';
import { publish } from '../../lib/events';
import { AppError } from '../../middleware/errorHandler';
import { getStripe, explainStripeError } from './client';

const APP_BASE_URL = () => (process.env.APP_BASE_URL || process.env.CORS_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');

// Stripe allows a Checkout Session to live between 30 minutes and 24 hours.
export const MIN_EXPIRY_MINUTES = 30;
export const MAX_EXPIRY_MINUTES = 24 * 60;

export interface PaymentRequestInput {
  workspaceId: string;
  opportunityId: string;
  amountCents: number;
  currency: string; // ISO code, any case
  expiresInMinutes: number;
  requestedBy: { id: string; name: string };
}

export async function createPaymentRequest(input: PaymentRequestInput) {
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: input.opportunityId, workspaceId: input.workspaceId },
    include: { contact: true },
  });
  if (!opportunity) throw new AppError('Opportunity not found', 404, 'NOT_FOUND');

  const paymentId = randomUUID();
  const currency = input.currency.toLowerCase();
  const expiresAt = new Date(Date.now() + input.expiresInMinutes * 60_000);
  const metadata = { workspaceId: input.workspaceId, opportunityId: opportunity.id, paymentId };

  let session;
  try {
    session = await getStripe().checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: { currency, unit_amount: input.amountCents, product_data: { name: opportunity.title } },
          },
        ],
        customer_email: opportunity.contact?.email ?? undefined,
        metadata,
        // Copied onto the PaymentIntent, so payment_intent.* and charge.* events can find us too.
        payment_intent_data: { metadata },
        expires_at: Math.floor(expiresAt.getTime() / 1000),
        success_url: `${APP_BASE_URL()}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${APP_BASE_URL()}/payments/cancelled`,
      },
      // Same key → Stripe returns the same session instead of creating a second one on a retry.
      { idempotencyKey: `payment-request-${paymentId}` }
    );
  } catch (err) {
    await prisma.integrationEvent.create({
      data: {
        workspaceId: input.workspaceId,
        provider: 'stripe',
        direction: 'OUTBOUND',
        eventType: 'checkout.session.create',
        result: 'FAILED',
        detail: err instanceof Error ? err.message.slice(0, 500) : 'unknown error',
      },
    });
    throw explainStripeError(err);
  }

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        id: paymentId,
        workspaceId: input.workspaceId,
        opportunityId: opportunity.id,
        leadId: opportunity.leadId,
        contactId: opportunity.contactId,
        requestedById: input.requestedBy.id,
        amount: input.amountCents,
        currency,
        status: 'PENDING',
        provider: 'stripe',
        providerReference: session.id,
        checkoutUrl: session.url,
        expiresAt,
      },
    });
    await tx.integrationEvent.create({
      data: {
        workspaceId: input.workspaceId,
        provider: 'stripe',
        direction: 'OUTBOUND',
        eventType: 'checkout.session.create',
        externalId: `outbound:${session.id}`,
        result: 'OK',
      },
    });
    await recordAudit(tx, {
      workspaceId: input.workspaceId,
      actor: { type: 'USER', id: input.requestedBy.id, name: input.requestedBy.name },
      action: 'PAYMENT_REQUESTED',
      entityType: 'Payment',
      entityId: created.id,
      after: { opportunityId: opportunity.id, amount: input.amountCents, currency, providerReference: session.id },
    });
    if (opportunity.leadId) {
      await tx.leadActivity.create({
        data: {
          workspaceId: input.workspaceId,
          leadId: opportunity.leadId,
          actorType: 'USER',
          actorId: input.requestedBy.id,
          kind: 'PAYMENT',
          body: `Payment link created: ${(input.amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`,
          data: { paymentId: created.id, status: 'PENDING' },
        },
      });
    }
    return created;
  });

  publish({ type: 'payment.updated', workspaceId: input.workspaceId, paymentId: payment.id, opportunityId: opportunity.id });
  return payment;
}
