/**
 * Stripe integration tests.
 * - Payment links are created against the REAL Stripe test-mode API (STRIPE_SECRET_KEY).
 * - Webhook events are signed with the configured webhook secret (or a local one if none is
 *   set) using Stripe's own signing helper, then posted to our endpoint, which exercises the real
 *   verification, deduplication and status logic. Stripe delivering events is checked manually.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { Api, startApi, call, prisma, signupWorkspace, addMember, TestWorkspace, Member } from './helpers';

const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'));
if (!process.env.STRIPE_WEBHOOK_SECRET) process.env.STRIPE_WEBHOOK_SECRET = 'whsec_local_test_secret_for_signing';

let api: Api;
let ws: TestWorkspace;
let viewer: Member; // plain User role: no opportunity:view_value
let opportunityId: string;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_unset');

before(async () => {
  api = await startApi();
  ws = await signupWorkspace(api, 'Stripe Co');
  viewer = await addMember(api, ws, { label: 'viewer' });
  const lead = await call(api, 'POST', '/api/leads', {
    token: ws.owner.token,
    body: { contactName: 'Ahmed Buyer', contactEmail: 'ahmed@tests.test' },
  });
  assert.equal(lead.status, 201, JSON.stringify(lead.body));
  const opp = await call(api, 'POST', '/api/crm/opportunities', {
    token: ws.owner.token,
    body: { title: '5kW rooftop system', value: 4000, currency: 'usd', leadId: lead.body.data.id },
  });
  assert.equal(opp.status, 201, JSON.stringify(opp.body));
  opportunityId = opp.body.data.id;
});

after(async () => {
  await api.close();
  await prisma.$disconnect();
});

let eventCounter = 0;
async function sendEvent(type: string, object: Record<string, unknown>, opts: { id?: string; livemode?: boolean; secret?: string } = {}) {
  const payload = JSON.stringify({
    id: opts.id ?? `evt_test_${Date.now()}_${eventCounter++}`,
    object: 'event',
    type,
    livemode: opts.livemode ?? false,
    created: Math.floor(Date.now() / 1000),
    data: { object },
  });
  const header = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: opts.secret ?? (process.env.STRIPE_WEBHOOK_SECRET as string),
  });
  const res = await fetch(`${api.baseUrl}/api/integrations/stripe/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': header },
    body: payload,
  });
  return { status: res.status, body: await res.json() };
}

async function requestPayment(amount: number) {
  const res = await call(api, 'POST', '/api/integrations/stripe/payment-requests', {
    token: ws.owner.token,
    body: { opportunityId, amount },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data as { paymentId: string; checkoutUrl: string; providerReference: string };
}

test('opportunity value is hidden on the server from users without the value permission', async () => {
  const owner = await call(api, 'GET', `/api/crm/opportunities/${opportunityId}`, { token: ws.owner.token });
  assert.equal(owner.body.data.value, 4000);
  const hidden = await call(api, 'GET', `/api/crm/opportunities/${opportunityId}`, { token: viewer.token });
  assert.equal(hidden.status, 200);
  assert.equal(hidden.body.data.value, null);
  assert.equal(hidden.body.data.valueMasked, true);
  const list = await call(api, 'GET', '/api/crm/opportunities', { token: viewer.token });
  assert.ok(list.body.data.items.every((o: { value: unknown }) => o.value === null));
});

test('a real Stripe Checkout link is created for an opportunity', { skip: !stripeConfigured }, async () => {
  const pr = await requestPayment(4000);
  assert.match(pr.checkoutUrl, /^https:\/\/checkout\.stripe\.com\//);
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: pr.paymentId } });
  assert.equal(payment.status, 'PENDING');
  assert.equal(payment.amount, 400000);
  assert.equal(payment.requestedById, ws.owner.userId);
  // Ask Stripe directly: the session exists, in test mode, carrying our metadata.
  const session = await stripe.checkout.sessions.retrieve(pr.providerReference);
  assert.equal(session.livemode, false);
  assert.equal(session.amount_total, 400000);
  assert.equal(session.metadata?.paymentId, pr.paymentId);
});

test('forged and live-mode webhooks are rejected and recorded', async () => {
  const forged = await sendEvent('checkout.session.completed', { id: 'cs_fake' }, { secret: 'whsec_wrong_secret' });
  assert.equal(forged.status, 400);
  const rejected = await prisma.integrationEvent.findFirst({
    where: { provider: 'stripe', result: 'REJECTED' },
    orderBy: { createdAt: 'desc' },
  });
  assert.ok(rejected?.detail?.includes('Signature verification failed'));

  const unsigned = await fetch(`${api.baseUrl}/api/integrations/stripe/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"id":"evt_x","type":"checkout.session.completed"}',
  });
  assert.equal(unsigned.status, 400);

  const live = await sendEvent('checkout.session.completed', { id: 'cs_live' }, { livemode: true });
  assert.equal(live.status, 400);
});

test('payment confirmation updates the record once, even when the event is delivered twice', { skip: !stripeConfigured }, async () => {
  const pr = await requestPayment(250);
  const eventId = `evt_test_dup_${Date.now()}`;
  const session = { id: pr.providerReference, object: 'checkout.session', payment_status: 'paid', payment_intent: `pi_test_${Date.now()}` };

  const first = await sendEvent('checkout.session.completed', session, { id: eventId });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const again = await sendEvent('checkout.session.completed', session, { id: eventId });
  assert.equal(again.status, 200);
  assert.equal(again.body.duplicate, true);

  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: pr.paymentId } });
  assert.equal(payment.status, 'PAID');
  assert.ok(payment.paidAt);
  assert.equal(await prisma.auditEvent.count({ where: { entityId: pr.paymentId, action: 'PAYMENT_PAID' } }), 1);

  // A late "failed" event must not downgrade a paid payment.
  await sendEvent('payment_intent.payment_failed', {
    id: session.payment_intent,
    object: 'payment_intent',
    metadata: { paymentId: pr.paymentId },
    last_payment_error: { message: 'Your card was declined.' },
  });
  assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: pr.paymentId } })).status, 'PAID');

  // Collected revenue on the dashboard counts it.
  const dash = await call(api, 'GET', '/api/dashboard/summary', { token: ws.owner.token });
  const usd = dash.body.data.figures.paymentsReceivedThisMonth.find((r: { currency: string }) => r.currency === 'usd');
  assert.equal(usd.collectedCents, 25000);

  // Refunds: partial, then the same refund event again, then full.
  const charge = { id: `ch_test_${Date.now()}`, object: 'charge', payment_intent: session.payment_intent, amount: 25000, amount_refunded: 10000, metadata: {} };
  await sendEvent('charge.refunded', charge);
  await sendEvent('charge.refunded', charge); // a new event id, same cumulative amount: no double counting
  let refunded = await prisma.payment.findUniqueOrThrow({ where: { id: pr.paymentId } });
  assert.equal(refunded.status, 'PARTIALLY_REFUNDED');
  assert.equal(refunded.refundedAmount, 10000);
  await sendEvent('charge.refunded', { ...charge, amount_refunded: 25000 });
  refunded = await prisma.payment.findUniqueOrThrow({ where: { id: pr.paymentId } });
  assert.equal(refunded.status, 'REFUNDED');

  const after = await call(api, 'GET', '/api/dashboard/summary', { token: ws.owner.token });
  const usdAfter = after.body.data.figures.paymentsReceivedThisMonth.find((r: { currency: string }) => r.currency === 'usd');
  assert.equal(usdAfter.collectedCents, 0, 'collected revenue subtracts confirmed refunds');

  // The lead's history shows the money events.
  const opp = await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunityId } });
  const activity = await prisma.leadActivity.findMany({ where: { leadId: opp.leadId!, kind: 'PAYMENT' } });
  assert.ok(activity.some((a) => a.body?.startsWith('Payment received')));
  assert.ok(activity.some((a) => a.body?.startsWith('Refund')));
});

test('failed and expired payments show the right status', { skip: !stripeConfigured }, async () => {
  const pr = await requestPayment(99);
  await sendEvent('payment_intent.payment_failed', {
    id: `pi_test_fail_${Date.now()}`,
    object: 'payment_intent',
    metadata: { paymentId: pr.paymentId },
    last_payment_error: { message: 'Your card has insufficient funds.' },
  });
  let payment = await prisma.payment.findUniqueOrThrow({ where: { id: pr.paymentId } });
  assert.equal(payment.status, 'FAILED');
  assert.equal(payment.failureReason, 'Your card has insufficient funds.');

  await sendEvent('checkout.session.expired', { id: pr.providerReference, object: 'checkout.session', payment_status: 'unpaid', payment_intent: null });
  payment = await prisma.payment.findUniqueOrThrow({ where: { id: pr.paymentId } });
  assert.equal(payment.status, 'EXPIRED');

  const list = await call(api, 'GET', '/api/integrations/stripe/payments?status=EXPIRED', { token: ws.owner.token });
  assert.ok(list.body.data.items.some((p: { id: string }) => p.id === pr.paymentId));
});

test('users without payment permission cannot create payment links', async () => {
  // The default User role has payment:create, so strip it via a custom role to prove the server check.
  const role = await call(api, 'POST', '/api/permissions/roles', {
    token: ws.owner.token,
    body: { name: 'Read only', permissions: ['opportunity:read'] },
  });
  assert.equal(role.status, 201, JSON.stringify(role.body));
  await call(api, 'PATCH', `/api/team/${viewer.userId}`, { token: ws.owner.token, body: { roleId: role.body.data.id } });
  const res = await call(api, 'POST', '/api/integrations/stripe/payment-requests', {
    token: viewer.token,
    body: { opportunityId, amount: 10 },
  });
  assert.equal(res.status, 403);
});
