/**
 * Stripe webhook processing (I2.2–I2.5).
 *
 *   1. Verify the signature over the exact raw bytes      → forged / altered requests rejected
 *   2. Insert IntegrationEvent(provider, event.id) UNIQUE → a redelivered event is a no-op
 *   3. Apply the change in the SAME transaction as step 2 → a crash mid-way rolls both back,
 *      we answer 500, and Stripe retries later
 */
import Stripe from 'stripe';
import { Payment } from '@prisma/client';
import { prisma, Tx, isUniqueViolation } from '../../lib/prisma';
import { recordAudit } from '../../lib/audit';
import { publish } from '../../lib/events';
import { getStripe } from './client';

export type WebhookOutcome =
  | { status: 200; body: { received: true; duplicate?: true; ignored?: string } }
  | { status: 400 | 503; body: { error: string } };

const STRIPE_ACTOR = { type: 'INTEGRATION' as const, id: null, name: 'stripe webhook' };

/** Status transitions that would lose information are refused (e.g. a late "failed" after "paid"). */
function canMove(from: string, to: string): boolean {
  if (from === to) return false;
  if (from === 'REFUNDED') return false;
  if (from === 'PARTIALLY_REFUNDED') return to === 'REFUNDED';
  if (from === 'PAID') return to === 'REFUNDED' || to === 'PARTIALLY_REFUNDED';
  return true; // PENDING / FAILED / EXPIRED can still become PAID etc.
}

async function applyPaymentChange(
  tx: Tx,
  payment: Payment,
  change: Partial<Pick<Payment, 'status' | 'paidAt' | 'stripePaymentIntentId' | 'refundedAmount' | 'failureReason'>>,
  eventType: string,
  touched: Payment[]
): Promise<void> {
  if (change.status && !canMove(payment.status, change.status)) {
    // Still record the payment intent link if we learned it, but keep the stronger status.
    if (change.stripePaymentIntentId && !payment.stripePaymentIntentId) {
      await tx.payment.update({ where: { id: payment.id }, data: { stripePaymentIntentId: change.stripePaymentIntentId } });
    }
    return;
  }
  const updated = await tx.payment.update({ where: { id: payment.id }, data: change });

  const action = updated.status === 'REFUNDED' || updated.status === 'PARTIALLY_REFUNDED' ? 'PAYMENT_REFUNDED' : `PAYMENT_${updated.status}`;
  await recordAudit(tx, {
    workspaceId: payment.workspaceId,
    actor: STRIPE_ACTOR,
    action,
    entityType: 'Payment',
    entityId: payment.id,
    before: { status: payment.status, refundedAmount: payment.refundedAmount },
    after: { status: updated.status, refundedAmount: updated.refundedAmount, failureReason: updated.failureReason, eventType },
  });

  if (payment.leadId) {
    const money = (cents: number) => `${(cents / 100).toFixed(2)} ${payment.currency.toUpperCase()}`;
    const body =
      updated.status === 'PAID'
        ? `Payment received: ${money(updated.amount)}`
        : updated.status === 'REFUNDED' || updated.status === 'PARTIALLY_REFUNDED'
          ? `Refund: ${money(updated.refundedAmount)} of ${money(updated.amount)}`
          : updated.status === 'FAILED'
            ? `Payment failed${updated.failureReason ? `: ${updated.failureReason}` : ''}`
            : `Payment link ${updated.status.toLowerCase()}`;
    await tx.leadActivity.create({
      data: {
        workspaceId: payment.workspaceId,
        leadId: payment.leadId,
        actorType: 'INTEGRATION',
        kind: 'PAYMENT',
        body,
        data: { paymentId: payment.id, status: updated.status, eventType },
      },
    });
  }
  touched.push(updated);
}

/** Finds our payment for a PaymentIntent: by stored id, else by the metadata we attached. */
async function paymentForIntent(tx: Tx, intentId: string, metadata?: Stripe.Metadata | null): Promise<Payment | null> {
  const byIntent = await tx.payment.findUnique({ where: { stripePaymentIntentId: intentId } });
  if (byIntent) return byIntent;
  let paymentId = metadata?.paymentId;
  if (!paymentId) {
    // Charges do not always carry the intent's metadata: ask Stripe for the intent itself.
    const intent = await getStripe().paymentIntents.retrieve(intentId);
    paymentId = intent.metadata?.paymentId;
  }
  return paymentId ? tx.payment.findUnique({ where: { id: paymentId } }) : null;
}

async function handleEvent(tx: Tx, event: Stripe.Event, touched: Payment[]): Promise<string | null> {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session;
      const payment = await tx.payment.findUnique({ where: { providerReference: session.id } });
      if (!payment) return `no payment for session ${session.id}`;
      const intentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null;
      const link = intentId ? { stripePaymentIntentId: intentId } : {};

      if (event.type === 'checkout.session.expired') {
        // Customer never paid before the link ran out: the "abandoned" outcome (I2.5).
        await applyPaymentChange(tx, payment, { status: 'EXPIRED', ...link }, event.type, touched);
      } else if (event.type === 'checkout.session.async_payment_failed') {
        await applyPaymentChange(tx, payment, { status: 'FAILED', failureReason: 'The bank declined the delayed payment', ...link }, event.type, touched);
      } else if (session.payment_status === 'paid' || event.type === 'checkout.session.async_payment_succeeded') {
        await applyPaymentChange(tx, payment, { status: 'PAID', paidAt: new Date(event.created * 1000), failureReason: null, ...link }, event.type, touched);
      } else if (intentId && !payment.stripePaymentIntentId) {
        // Completed but not yet paid (delayed methods): remember the intent, wait for async_* events.
        await tx.payment.update({ where: { id: payment.id }, data: { stripePaymentIntentId: intentId } });
      }
      return null;
    }

    case 'payment_intent.payment_failed': {
      const intent = event.data.object as Stripe.PaymentIntent;
      const payment = await paymentForIntent(tx, intent.id, intent.metadata);
      if (!payment) return `no payment for intent ${intent.id}`;
      // The customer can still retry on the same page; a later success moves it to PAID.
      await applyPaymentChange(
        tx,
        payment,
        { status: 'FAILED', failureReason: intent.last_payment_error?.message ?? 'Payment failed', stripePaymentIntentId: intent.id },
        event.type,
        touched
      );
      return null;
    }

    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      const intentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
      if (!intentId) return 'refund without payment intent';
      const payment = await paymentForIntent(tx, intentId, charge.metadata);
      if (!payment) return `no payment for intent ${intentId}`;
      // amount_refunded is cumulative, so applying the same refund twice cannot double-count it.
      const fully = charge.amount_refunded >= charge.amount;
      await applyPaymentChange(
        tx,
        payment,
        { status: fully ? 'REFUNDED' : 'PARTIALLY_REFUNDED', refundedAmount: charge.amount_refunded, stripePaymentIntentId: intentId },
        event.type,
        touched
      );
      return null;
    }

    default:
      return `event type ${event.type} not used`;
  }
}

export async function processStripeWebhook(rawBody: Buffer | undefined, signature: string | undefined): Promise<WebhookOutcome> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return { status: 503, body: { error: 'STRIPE_WEBHOOK_SECRET is not configured' } };

  // 1. Authenticity. constructEvent recomputes the HMAC over the raw body and checks the timestamp.
  let event: Stripe.Event;
  try {
    if (!rawBody || !signature) throw new Error('missing body or Stripe-Signature header');
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    await prisma.integrationEvent.create({
      data: {
        provider: 'stripe',
        direction: 'INBOUND',
        eventType: 'unverified',
        result: 'REJECTED',
        detail: `Signature verification failed: ${err instanceof Error ? err.message : 'unknown'}`.slice(0, 500),
      },
    });
    return { status: 400, body: { error: 'Invalid signature' } };
  }

  if (event.livemode) {
    await prisma.integrationEvent.create({
      data: { provider: 'stripe', direction: 'INBOUND', eventType: event.type, result: 'REJECTED', detail: 'Live-mode event refused: this platform runs Stripe in test mode only' },
    });
    return { status: 400, body: { error: 'Live-mode events are not accepted' } };
  }

  const touched: Payment[] = [];
  try {
    const ignored = await prisma.$transaction(
      async (tx) => {
        // 2. Deduplication: the unique (provider, externalId) row is the "seen it" marker.
        const record = await tx.integrationEvent.create({
          data: { provider: 'stripe', direction: 'INBOUND', eventType: event.type, externalId: event.id, result: 'OK' },
        });
        // 3. Apply.
        const reason = await handleEvent(tx, event, touched);
        await tx.integrationEvent.update({
          where: { id: record.id },
          data: { workspaceId: touched[0]?.workspaceId ?? null, result: reason ? 'IGNORED' : 'OK', detail: reason },
        });
        return reason;
      },
      { maxWait: 10_000, timeout: 30_000 }
    );

    for (const p of touched) {
      publish({ type: 'payment.updated', workspaceId: p.workspaceId, paymentId: p.id, opportunityId: p.opportunityId ?? undefined, leadId: p.leadId ?? undefined });
    }
    return { status: 200, body: ignored ? { received: true, ignored } : { received: true } };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { status: 200, body: { received: true, duplicate: true } }; // already processed: tell Stripe to stop retrying
    }
    // Recorded without externalId, so Stripe's retry is still processed normally.
    await prisma.integrationEvent.create({
      data: {
        provider: 'stripe',
        direction: 'INBOUND',
        eventType: event.type,
        result: 'FAILED',
        detail: `${event.id}: ${err instanceof Error ? err.message : 'unknown'}`.slice(0, 500),
      },
    });
    throw err;
  }
}
