import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  Api,
  startApi,
  call,
  prisma,
  signupWorkspace,
  addMember,
  expireDeadline,
  TestWorkspace,
  Member,
} from './helpers';
import { escalateIfDue, runWorkerTick } from '../src/modules/leads/worker';

let api: Api;
let ws: TestWorkspace;
let other: TestWorkspace;
let bilal: Member;
let ayesha: Member;
let omar: Member;
let offlineUser: Member;

before(async () => {
  api = await startApi();
  ws = await signupWorkspace(api, 'Isolation A');
  other = await signupWorkspace(api, 'Isolation B');
  bilal = await addMember(api, ws, { label: 'bilal', availability: 'AVAILABLE' });
  ayesha = await addMember(api, ws, { label: 'ayesha', availability: 'AVAILABLE' });
  omar = await addMember(api, ws, { label: 'omar', availability: 'AVAILABLE' });
  offlineUser = await addMember(api, ws, { label: 'offline' }); // never set Available
});

after(async () => {
  await api.close();
  await prisma.$disconnect();
});

/** Manual entry by the Owner (the public form is rate-limited per IP, so it gets its own test). */
async function createLead(name: string): Promise<string> {
  const res = await call(api, 'POST', '/api/leads', {
    token: ws.owner.token,
    body: { contactName: name, contactPhone: '+923001234567', message: 'Interested in solar' },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const lead = await prisma.lead.findFirstOrThrow({ where: { workspaceId: ws.workspaceId, contactName: name } });
  return lead.id;
}

test('the public web form creates a WEB_FORM lead and reveals nothing internal', async () => {
  const res = await call(api, 'POST', `/api/public/forms/${ws.formKey}/leads`, {
    body: { name: 'Form Visitor', email: 'visitor@tests.test', message: 'Quote please' },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.deepEqual(Object.keys(res.body.data).sort(), ['message', 'received']);
  const lead = await prisma.lead.findFirstOrThrow({ where: { workspaceId: ws.workspaceId, contactName: 'Form Visitor' } });
  assert.equal(lead.source, 'WEB_FORM');
  assert.equal((await call(api, 'POST', '/api/public/forms/not-a-key/leads', { body: { name: 'x', email: 'x@tests.test' } })).status, 404);
  const spam = await call(api, 'POST', `/api/public/forms/${ws.formKey}/leads`, {
    body: { name: 'Bot', email: 'bot@tests.test', website: 'http://spam' },
  });
  assert.equal(spam.status, 400);
});

test('signup creates a separate workspace and makes the creator Owner', async () => {
  assert.notEqual(ws.workspaceId, other.workspaceId);
  const me = await call(api, 'GET', '/api/auth/me', { token: ws.owner.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.data.memberships.length, 1);
  assert.equal(me.body.data.memberships[0].baseLevel, 'OWNER');
  assert.equal(me.body.data.memberships[0].workspaceId, ws.workspaceId);
});

test('invalid, missing and revoked tokens are rejected', async () => {
  assert.equal((await call(api, 'GET', '/api/leads')).status, 401);
  assert.equal((await call(api, 'GET', '/api/leads', { token: 'not-a-real-token' })).status, 401);

  const login = await call(api, 'POST', '/api/auth/login', { body: { email: bilal.email, password: (await import('./helpers')).PASSWORD } });
  assert.equal(login.status, 200);
  const token = login.body.data.token;
  assert.equal((await call(api, 'GET', '/api/leads', { token })).status, 200);
  assert.equal((await call(api, 'POST', '/api/auth/logout', { token })).status, 200);
  assert.equal((await call(api, 'GET', '/api/leads', { token })).status, 401, 'logged-out token must stop working');
});

test('wrong password is rejected and does not reveal whether the email exists', async () => {
  const wrong = await call(api, 'POST', '/api/auth/login', { body: { email: bilal.email, password: 'wrong-password-123' } });
  const unknown = await call(api, 'POST', '/api/auth/login', { body: { email: 'nobody@tests.test', password: 'wrong-password-123' } });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.body.error.code, unknown.body.error.code);
});

test('a user cannot reach another workspace, by header or by guessed id', async () => {
  const leadId = await createLead('Isolation Lead');
  // Owner of B sends A's workspace id: membership is checked, header is not trusted.
  const byHeader = await call(api, 'GET', '/api/leads', { token: other.owner.token, workspace: ws.workspaceId });
  assert.equal(byHeader.status, 403);
  // Owner of B asks for A's lead id inside their own workspace: not found.
  const byId = await call(api, 'GET', `/api/leads/${leadId}`, { token: other.owner.token });
  assert.equal(byId.status, 404);
  const ack = await call(api, 'POST', `/api/leads/${leadId}/acknowledge`, { token: other.owner.token });
  assert.equal(ack.status, 404);
});

test('missing permissions are rejected on the server (fail closed)', async () => {
  // Plain User role has no audit:read, role:manage, assignment:manage or lead:read_all.
  assert.equal((await call(api, 'GET', '/api/audit', { token: bilal.token })).status, 403);
  assert.equal((await call(api, 'GET', '/api/permissions', { token: bilal.token })).status, 403);
  assert.equal((await call(api, 'GET', '/api/leads/recovery-queue', { token: bilal.token })).status, 403);
  const settings = await call(api, 'GET', '/api/leads/settings', { token: bilal.token });
  const put = await call(api, 'PUT', '/api/leads/settings', {
    token: bilal.token,
    body: { ackTimeoutSeconds: 5, version: settings.body.data.version },
  });
  assert.equal(put.status, 403);
});

test('an Admin cannot modify the Owner', async () => {
  const admin = await addMember(api, ws, { label: 'admin', role: 'Admin', baseLevel: 'ADMIN' });
  const res = await call(api, 'PATCH', `/api/team/${ws.owner.userId}`, {
    token: admin.token,
    body: { maxOpenLeads: 1 },
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'CANNOT_MODIFY_OWNER');
});

test('only Available employees below their limit receive leads, in round-robin order', async () => {
  const owners = new Set<string>();
  for (let i = 0; i < 3; i++) {
    const id = await createLead(`RR Lead ${i}`);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id } });
    assert.equal(lead.status, 'ASSIGNED');
    assert.ok(lead.currentOwnerId);
    assert.ok(lead.ackDeadline && lead.ackDeadline > new Date(), 'deadline is in the future');
    owners.add(lead.currentOwnerId!);
  }
  assert.ok(!owners.has(offlineUser.userId), 'offline employee never receives leads');
  assert.ok(!owners.has(ws.owner.userId), 'owner is Offline by default');
  assert.deepEqual(owners, new Set([bilal.userId, ayesha.userId, omar.userId]), 'three leads went to three different people');
});

test('an expired lead escalates exactly once, even with concurrent workers', async () => {
  const leadId = await createLead('Race Lead');
  const before = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  await expireDeadline(leadId);

  // Eight workers race for the same expired lead.
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => escalateIfDue(leadId)));
  const succeeded = results.filter((r) => r.status === 'fulfilled' && r.value === true).length;
  assert.equal(succeeded, 1, 'exactly one worker escalates');

  const escalations = await prisma.leadAssignment.count({ where: { leadId, kind: 'ESCALATION' } });
  assert.equal(escalations, 1);
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  assert.equal(lead.escalationCount, 1);
  assert.equal(lead.escalationLevel, 1);
  assert.notEqual(lead.currentOwnerId, before.currentOwnerId, 'moved to a different employee');
  assert.ok(lead.ackDeadline && lead.ackDeadline > new Date(), 'new window started');

  // One owner at a time: exactly one assignment row is open.
  const open = await prisma.leadAssignment.count({ where: { leadId, endedAt: null } });
  assert.equal(open, 1);

  // The escalation was audited and queued for an external alert.
  const audit = await prisma.auditEvent.findMany({ where: { entityId: leadId, action: 'LEAD_ESCALATED' } });
  assert.equal(audit.length, 1);
  assert.equal(audit[0].actorType, 'SYSTEM');
  assert.equal((audit[0].previousState as { ownerId: string }).ownerId, before.currentOwnerId);
  assert.equal((audit[0].newState as { ownerId: string }).ownerId, lead.currentOwnerId);
  const alerts = await prisma.notification.count({ where: { leadId, kind: 'ESCALATION' } });
  assert.equal(alerts, 1);
});

test('overdue work is picked up by a fresh worker tick (restart safety)', async () => {
  const leadId = await createLead('Restart Lead');
  await expireDeadline(leadId);
  // No in-memory timer exists for this lead. A worker that just started finds it from the database.
  await runWorkerTick();
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  assert.equal(lead.escalationCount, 1);
});

test('acknowledging stops escalation; a note by the owner also acknowledges', async () => {
  const a = await createLead('Ack Lead');
  const leadA = await prisma.lead.findUniqueOrThrow({ where: { id: a } });
  const ownerA = [bilal, ayesha, omar].find((m) => m.userId === leadA.currentOwnerId)!;

  const notOwner = [bilal, ayesha, omar].find((m) => m.userId !== leadA.currentOwnerId)!;
  const denied = await call(api, 'POST', `/api/leads/${a}/acknowledge`, { token: notOwner.token });
  assert.equal(denied.status, 404, 'a non-owner without lead:read_all cannot even see it');

  const ack = await call(api, 'POST', `/api/leads/${a}/acknowledge`, { token: ownerA.token });
  assert.equal(ack.status, 200, JSON.stringify(ack.body));
  assert.equal(ack.body.data.status, 'ACKNOWLEDGED');
  await prisma.lead.update({ where: { id: a }, data: { ackDeadline: new Date(Date.now() - 1000) } });
  assert.equal(await escalateIfDue(a), false, 'acknowledged lead does not escalate');

  const b = await createLead('Note Lead');
  const leadB = await prisma.lead.findUniqueOrThrow({ where: { id: b } });
  const ownerB = [bilal, ayesha, omar].find((m) => m.userId === leadB.currentOwnerId)!;
  const note = await call(api, 'POST', `/api/leads/${b}/activities`, {
    token: ownerB.token,
    body: { kind: 'NOTE', body: 'Called the customer, booked a site visit' },
  });
  assert.equal(note.status, 201, JSON.stringify(note.body));
  assert.equal(note.body.data.status, 'ACKNOWLEDGED');
  const fresh = await prisma.lead.findUniqueOrThrow({ where: { id: b } });
  assert.ok(fresh.firstAcknowledgedAt && fresh.firstAssignedAt);
});

test('going On leave immediately reassigns unacknowledged leads', async () => {
  const leadId = await createLead('Leave Lead');
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  const owner = [bilal, ayesha, omar].find((m) => m.userId === lead.currentOwnerId)!;

  const res = await call(api, 'PATCH', '/api/team/me/availability', {
    token: owner.token,
    body: { availability: 'ON_LEAVE' },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(res.body.data.reassigned >= 1);
  assert.ok(res.body.data.policyDescription, 'the acknowledged-lead policy is shown to the user');

  const after = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  assert.notEqual(after.currentOwnerId, owner.userId);
  const open = await prisma.lead.count({
    where: { workspaceId: ws.workspaceId, currentOwnerId: owner.userId, status: 'ASSIGNED' },
  });
  assert.equal(open, 0, 'no unacknowledged lead left with the absent employee');

  await call(api, 'PATCH', '/api/team/me/availability', { token: owner.token, body: { availability: 'AVAILABLE' } });
});

test('a duplicate intake key creates one lead, not two', async () => {
  const { ingestLead } = await import('../src/modules/leads/service');
  const input = {
    workspaceId: ws.workspaceId,
    source: 'WHATSAPP' as const,
    contactName: 'Dup Sender',
    contactPhone: '+923009999999',
    message: 'hi',
    intakeKey: `SM${Date.now()}`,
    actor: { type: 'INTEGRATION' as const, id: null, name: 'twilio' },
  };
  const results = await Promise.all([ingestLead(input), ingestLead(input), ingestLead(input)]);
  assert.equal(new Set(results.map((r) => r.lead.id)).size, 1);
  assert.equal(await prisma.lead.count({ where: { workspaceId: ws.workspaceId, intakeKey: input.intakeKey } }), 1);
});

test('audit history cannot be edited or deleted', async () => {
  const row = await prisma.auditEvent.findFirstOrThrow({ where: { workspaceId: ws.workspaceId } });
  await assert.rejects(prisma.auditEvent.update({ where: { id: row.id }, data: { action: 'TAMPERED' } }));
  await assert.rejects(prisma.auditEvent.delete({ where: { id: row.id } }));

  const audit = await call(api, 'GET', '/api/audit?action=LEAD_ESCALATED', { token: ws.owner.token });
  assert.equal(audit.status, 200);
  assert.ok(audit.body.data.items.length >= 1);
  assert.ok(audit.body.data.items.every((e: { action: string }) => e.action === 'LEAD_ESCALATED'));
});

test('dashboard figures come from stored records', async () => {
  const res = await call(api, 'GET', '/api/dashboard/summary', { token: ws.owner.token });
  assert.equal(res.status, 200);
  const f = res.body.data.figures;
  const leadsToday = await prisma.lead.count({
    where: { workspaceId: ws.workspaceId, createdAt: { gte: new Date(res.body.data.dayStartsAt) } },
  });
  assert.equal(f.newLeadsToday, leadsToday);
  assert.ok(f.escalationsLast24h >= 2);
  assert.equal(res.body.data.scope, 'company');

  const personal = await call(api, 'GET', '/api/dashboard/summary', { token: bilal.token });
  assert.equal(personal.body.data.scope, 'personal');
});
