/**
 * WhatsApp (Vonage) integration tests against the real database.
 * Vonage itself is replaced by a local HTTP server that answers like the Messages API, and
 * webhooks are signed the way Vonage signs them, so verification, dedup, contact matching,
 * delivery statuses, failures, retry and opt-out are all exercised end to end.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { AddressInfo } from 'net';
import { Api, startApi, call, prisma, signupWorkspace, addMember, TestWorkspace, Member } from './helpers';
import { signLikeVonage } from '../src/integrations/vonage/client';

const OUR_NUMBER = `1555${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
const CUSTOMER = `92300${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;

let api: Api;
let ws: TestWorkspace;
let bilal: Member;
let ayesha: Member;
let fakeVonage: http.Server;
let fakeMode: 'ok' | 'reject' = 'ok';
let sentCount = 0;

before(async () => {
  // Fake Vonage Messages API.
  fakeVonage = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (fakeMode === 'reject') {
        res.writeHead(422, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ title: 'Invalid recipient', detail: 'The number has not joined the sandbox' }));
        return;
      }
      sentCount++;
      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message_uuid: `fake-${Date.now()}-${sentCount}` }));
    });
  });
  await new Promise<void>((r) => fakeVonage.listen(0, r));
  process.env.VONAGE_API_URL = `http://127.0.0.1:${(fakeVonage.address() as AddressInfo).port}`;
  process.env.VONAGE_API_KEY = 'testkey';
  process.env.VONAGE_API_SECRET = 'testsecret';
  process.env.VONAGE_SIGNATURE_SECRET = 'test-signature-secret';
  process.env.VONAGE_WHATSAPP_NUMBER = OUR_NUMBER;

  api = await startApi();
  ws = await signupWorkspace(api, 'WhatsApp Co');
  bilal = await addMember(api, ws, { label: 'bilal', availability: 'AVAILABLE' });
  ayesha = await addMember(api, ws, { label: 'ayesha', availability: 'AVAILABLE' });
});

after(async () => {
  await api.close();
  await new Promise<void>((r) => fakeVonage.close(() => r()));
  await prisma.$disconnect();
});

async function webhook(path: 'inbound' | 'status', payload: object, opts: { secret?: string; tamper?: boolean } = {}) {
  const body = JSON.stringify(payload);
  const token = signLikeVonage(body, opts.secret ?? 'test-signature-secret', 'testkey');
  const res = await fetch(`${api.baseUrl}/api/integrations/vonage/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: opts.tamper ? body.replace('Hello', 'HACKED') : body,
  });
  return { status: res.status, body: await res.json() };
}

const inbound = (uuid: string, text: string, from = CUSTOMER) => ({
  channel: 'whatsapp',
  message_type: 'text',
  message_uuid: uuid,
  from,
  to: OUR_NUMBER,
  text,
  timestamp: new Date().toISOString(),
  profile: { name: 'Ahmed WhatsApp' },
});

test('only users with integration permission can connect the number', async () => {
  const denied = await call(api, 'POST', '/api/integrations/vonage/connect', { token: bilal.token });
  assert.equal(denied.status, 403);
  const okRes = await call(api, 'POST', '/api/integrations/vonage/connect', { token: ws.owner.token });
  assert.equal(okRes.status, 200, JSON.stringify(okRes.body));
  const audit = await prisma.auditEvent.count({ where: { workspaceId: ws.workspaceId, action: 'INTEGRATION_CONNECTED' } });
  assert.equal(audit, 1);
});

test('forged, wrongly-signed and altered webhooks are rejected and recorded', async () => {
  const unsigned = await fetch(`${api.baseUrl}/api/integrations/vonage/inbound`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(inbound('forged-1', 'hi')),
  });
  assert.equal(unsigned.status, 401);
  assert.equal((await webhook('inbound', inbound('forged-2', 'hi'), { secret: 'wrong' })).status, 401);
  assert.equal((await webhook('inbound', inbound('forged-3', 'Hello there'), { tamper: true })).status, 401);
  const rejected = await prisma.integrationEvent.findMany({ where: { provider: 'vonage', result: 'REJECTED' }, orderBy: { createdAt: 'desc' }, take: 3 });
  assert.ok(rejected.some((e) => e.detail?.includes('payload hash mismatch')));
  assert.equal(await prisma.message.count({ where: { externalMessageId: { in: ['forged-1', 'forged-2', 'forged-3'] } } }), 0);
});

let contactId: string;
let leadId: string;

test('a message from an unknown number creates a contact and an assigned WhatsApp lead, once', async () => {
  const uuid = `in-${Date.now()}`;
  const first = await webhook('inbound', inbound(uuid, 'Hello, how much for a 5kW system?'));
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const again = await webhook('inbound', inbound(uuid, 'Hello, how much for a 5kW system?'));
  assert.equal(again.body.result, 'DUPLICATE');

  const contacts = await prisma.contact.findMany({ where: { workspaceId: ws.workspaceId, phone: `+${CUSTOMER}` } });
  assert.equal(contacts.length, 1);
  contactId = contacts[0].id;
  const leads = await prisma.lead.findMany({ where: { workspaceId: ws.workspaceId, contactId } });
  assert.equal(leads.length, 1, 'one lead, not two');
  assert.equal(leads[0].source, 'WHATSAPP');
  assert.equal(leads[0].status, 'ASSIGNED');
  leadId = leads[0].id;
  assert.equal(await prisma.message.count({ where: { externalMessageId: uuid } }), 1, 'one message, not two');
});

test('a message from a known number attaches to the existing contact without a new lead', async () => {
  const res = await webhook('inbound', inbound(`in2-${Date.now()}`, 'Also, do you install on weekends?'));
  assert.equal(res.status, 200);
  assert.equal(await prisma.lead.count({ where: { workspaceId: ws.workspaceId, contactId } }), 1);
  assert.equal(await prisma.message.count({ where: { contactId, direction: 'INBOUND' } }), 2);
});

test('only the assigned employee (or read-all roles) can see the conversation', async () => {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  const owner = lead.currentOwnerId === bilal.userId ? bilal : ayesha;
  const other = owner === bilal ? ayesha : bilal;
  const seen = await call(api, 'GET', `/api/integrations/vonage/conversations/${contactId}`, { token: owner.token });
  assert.equal(seen.status, 200);
  assert.equal(seen.body.data.messages.length, 2);
  assert.equal(seen.body.data.assignedEmployee.id, owner.userId);
  assert.equal((await call(api, 'GET', `/api/integrations/vonage/conversations/${contactId}`, { token: other.token })).status, 404);
  assert.equal((await call(api, 'GET', `/api/integrations/vonage/conversations/${contactId}`, { token: ws.owner.token })).status, 200);
});

test('a reply is sent, acknowledges the lead, and delivery statuses only move forward', async () => {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  const owner = lead.currentOwnerId === bilal.userId ? bilal : ayesha;
  fakeMode = 'ok';
  const sent = await call(api, 'POST', `/api/integrations/vonage/conversations/${contactId}/messages`, {
    token: owner.token,
    body: { text: 'Hi Ahmed! A 5kW system starts at $4,000. Can we visit tomorrow?' },
  });
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  assert.equal(sent.body.data.status, 'SENT');
  const msg = await prisma.message.findUniqueOrThrow({ where: { id: sent.body.data.id } });
  assert.ok(msg.externalMessageId?.startsWith('fake-'));
  assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).status, 'ACKNOWLEDGED', 'replying counts as acknowledging');

  await webhook('status', { message_uuid: msg.externalMessageId, status: 'delivered', timestamp: new Date().toISOString() });
  assert.equal((await prisma.message.findUniqueOrThrow({ where: { id: msg.id } })).status, 'DELIVERED');
  await webhook('status', { message_uuid: msg.externalMessageId, status: 'read', timestamp: new Date().toISOString() });
  await webhook('status', { message_uuid: msg.externalMessageId, status: 'submitted', timestamp: new Date().toISOString() }); // late, out of order
  const final = await prisma.message.findUniqueOrThrow({ where: { id: msg.id } });
  assert.equal(final.status, 'READ');
  assert.ok(final.deliveredAt);
});

test('a rejected send stays visible as FAILED with the reason, and can be retried', async () => {
  fakeMode = 'reject';
  const failed = await call(api, 'POST', `/api/integrations/vonage/conversations/${contactId}/messages`, {
    token: ws.owner.token,
    body: { text: 'Following up on your quote' },
  });
  assert.equal(failed.status, 201);
  assert.equal(failed.body.data.status, 'FAILED');
  assert.match(failed.body.data.error, /not joined the sandbox/);
  assert.equal(failed.body.data.canRetry, true);

  fakeMode = 'ok';
  const retried = await call(api, 'POST', `/api/integrations/vonage/messages/${failed.body.data.id}/retry`, { token: ws.owner.token });
  assert.equal(retried.status, 200);
  assert.equal(retried.body.data.status, 'SENT');
});

test('an undeliverable status marks the message failed with the provider reason', async () => {
  const sent = await call(api, 'POST', `/api/integrations/vonage/conversations/${contactId}/messages`, { token: ws.owner.token, body: { text: 'Test' } });
  const msg = await prisma.message.findUniqueOrThrow({ where: { id: sent.body.data.id } });
  await webhook('status', { message_uuid: msg.externalMessageId, status: 'undeliverable', error: { title: 'Outside 24h window' } });
  const after = await prisma.message.findUniqueOrThrow({ where: { id: msg.id } });
  assert.equal(after.status, 'FAILED');
  assert.match(after.errorMessage ?? '', /24h window/);
});

test('replying STOP opts the customer out, and they cannot be messaged', async () => {
  await webhook('inbound', inbound(`stop-${Date.now()}`, 'STOP'));
  assert.equal((await prisma.contact.findUniqueOrThrow({ where: { id: contactId } })).optedOut, true);
  const blocked = await call(api, 'POST', `/api/integrations/vonage/conversations/${contactId}/messages`, { token: ws.owner.token, body: { text: 'One more offer' } });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.error.code, 'CONTACT_OPTED_OUT');
  const convo = await call(api, 'GET', `/api/integrations/vonage/conversations/${contactId}`, { token: ws.owner.token });
  assert.equal(convo.body.data.canSend, false);
  assert.ok(convo.body.data.cannotSendReason);
  const sends = sentCount;
  assert.equal(sentCount, sends, 'nothing reached the provider');
});
