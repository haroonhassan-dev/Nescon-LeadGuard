/**
 * Customizable CRM (rubric criterion 2): custom fields, per-pipeline fields, required fields by
 * stage, editable pipeline, saved lists. Real database, through the HTTP API.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Api, startApi, call, prisma, signupWorkspace, addMember, TestWorkspace, Member } from './helpers';

let api: Api;
let ws: TestWorkspace;
let user: Member;
let sales: { id: string; stages: Array<{ id: string; name: string }> };
let service: { id: string; stages: Array<{ id: string; name: string }> };
const f: Record<string, { id: string; key: string }> = {};

before(async () => {
  api = await startApi();
  ws = await signupWorkspace(api, 'CRM Co');
  user = await addMember(api, ws, { label: 'user' });
  const pipes = await call(api, 'GET', '/api/crm/pipelines', { token: ws.owner.token });
  sales = pipes.body.data.items[0];
});

after(async () => {
  await api.close();
  await prisma.$disconnect();
});

const owner = (method: string, path: string, body?: unknown) => call(api, method, `/api/crm${path}`, { token: ws.owner.token, body });

test('an Admin creates fields of every type from the interface; a plain User cannot', async () => {
  const denied = await call(api, 'POST', '/api/crm/fields', { token: user.token, body: { pipelineId: sales.id, label: 'X', type: 'TEXT' } });
  assert.equal(denied.status, 403);
  const defs = [
    { label: 'Roof type', type: 'DROPDOWN', options: ['Flat', 'Sloped', 'Metal'] },
    { label: 'System size kW', type: 'NUMBER' },
    { label: 'Site visit date', type: 'DATE' },
    { label: 'Notes for installer', type: 'TEXT' },
    { label: 'Contract signed', type: 'CHECKBOX' },
  ];
  for (const d of defs) {
    const r = await owner('POST', '/fields', { ...d, pipelineId: sales.id });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    f[r.body.data.key] = r.body.data;
  }
  assert.deepEqual(Object.keys(f).sort(), ['contract_signed', 'notes_for_installer', 'roof_type', 'site_visit_date', 'system_size_kw']);
  const bad = await owner('POST', '/fields', { pipelineId: sales.id, label: 'Bad', type: 'DROPDOWN', options: ['only one'] });
  assert.equal(bad.status, 400);
  const pipes = await owner('GET', '/pipelines');
  assert.equal(pipes.body.data.items[0].customFields.length, 5, 'fields appear on the pipeline immediately');
});

test('values are type-checked', async () => {
  const wrong = await owner('POST', '/opportunities', { title: 'Typed deal', value: 1000, pipelineId: sales.id, customValues: { roof_type: 'Glass', system_size_kw: 'big' } });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.error.details.length, 2);
  const right = await owner('POST', '/opportunities', { title: 'Typed deal', value: 1000, pipelineId: sales.id, customValues: { roof_type: 'Flat', system_size_kw: 5, site_visit_date: '2026-10-25', contract_signed: false } });
  assert.equal(right.status, 201, JSON.stringify(right.body));
  assert.deepEqual(right.body.data.customValues, { roof_type: 'Flat', system_size_kw: 5, site_visit_date: '2026-10-25', contract_signed: false });
});

test('two pipelines show different custom fields while sharing the same contact', async () => {
  const created = await owner('POST', '/pipelines', { name: 'Maintenance', stages: ['Requested', 'Scheduled', 'Done'] });
  assert.equal(created.status, 201);
  service = created.body.data;
  const svcField = await owner('POST', '/fields', { pipelineId: service.id, label: 'Panel serial number', type: 'TEXT' });
  assert.equal(svcField.status, 201);

  const lead = await call(api, 'POST', '/api/leads', { token: ws.owner.token, body: { contactName: 'Shared Contact', contactEmail: 'shared@tests.test' } });
  const contactId = lead.body.data.contactId;
  const a = await owner('POST', '/opportunities', { title: 'Install', value: 4000, pipelineId: sales.id, contactId, customValues: { roof_type: 'Sloped' } });
  const b = await owner('POST', '/opportunities', { title: 'Service', value: 200, pipelineId: service.id, contactId, customValues: { panel_serial_number: 'PN-123' } });
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  const crossed = await owner('POST', '/opportunities', { title: 'Wrong field', value: 1, pipelineId: service.id, customValues: { roof_type: 'Flat' } });
  assert.equal(crossed.status, 400, 'a sales field is not accepted on a maintenance deal');

  const detailA = await owner('GET', `/opportunities/${a.body.data.id}`);
  const detailB = await owner('GET', `/opportunities/${b.body.data.id}`);
  assert.ok(detailA.body.data.fields.some((x: { key: string }) => x.key === 'roof_type'));
  assert.ok(!detailB.body.data.fields.some((x: { key: string }) => x.key === 'roof_type'));
  assert.equal(detailA.body.data.contact.id, detailB.body.data.contact.id);

  const contact = await owner('GET', `/contacts/${contactId}`);
  assert.equal(contact.status, 200);
  assert.equal(contact.body.data.opportunities.length, 2, 'the contact page shows all related records');
  assert.ok(contact.body.data.leads.length >= 1);
});

test('moving into a stage is blocked until its required fields are filled', async () => {
  const quote = sales.stages.find((s) => s.name === 'Quote sent')!;
  const setReq = await owner('PATCH', `/stages/${quote.id}`, { requiredFieldIds: [f.system_size_kw.id, f.site_visit_date.id] });
  assert.equal(setReq.status, 200, JSON.stringify(setReq.body));

  const opp = await owner('POST', '/opportunities', { title: 'Needs details', value: 3000, pipelineId: sales.id });
  const blocked = await owner('PATCH', `/opportunities/${opp.body.data.id}`, { stageId: quote.id, version: opp.body.data.version });
  assert.equal(blocked.status, 422);
  assert.equal(blocked.body.error.code, 'STAGE_REQUIREMENTS_NOT_MET');
  assert.match(blocked.body.error.message, /System size kW/);
  assert.match(blocked.body.error.message, /Site visit date/);

  const filled = await owner('PATCH', `/opportunities/${opp.body.data.id}`, {
    stageId: quote.id,
    customValues: { system_size_kw: 7, site_visit_date: '2026-10-30' },
    version: opp.body.data.version,
  });
  assert.equal(filled.status, 200, JSON.stringify(filled.body));
  assert.equal(filled.body.data.stage.name, 'Quote sent');
});

test('stages can be added, renamed, reordered and deleted safely', async () => {
  const added = await owner('POST', `/pipelines/${sales.id}/stages`, { name: 'Negotiation' });
  assert.equal(added.status, 201);
  const renamed = await owner('PATCH', `/stages/${added.body.data.id}`, { name: 'Price negotiation' });
  assert.equal(renamed.body.data.name, 'Price negotiation');

  const pipe = (await owner('GET', '/pipelines')).body.data.items.find((p: { id: string }) => p.id === sales.id);
  const ids: string[] = pipe.stages.map((s: { id: string }) => s.id);
  const reordered = [ids[ids.length - 1], ...ids.slice(0, -1)];
  const r = await owner('PUT', `/pipelines/${sales.id}/stage-order`, { stageIds: reordered });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.stages[0].name, 'Price negotiation');

  // Delete a stage that has deals: refused without a destination, then moves them.
  const opp = await owner('POST', '/opportunities', { title: 'In negotiation', value: 900, pipelineId: sales.id, stageId: added.body.data.id });
  const refused = await owner('DELETE', `/stages/${added.body.data.id}`);
  assert.equal(refused.status, 409);
  assert.equal(refused.body.error.code, 'STAGE_NOT_EMPTY');
  const newStage = sales.stages[0].id;
  const del = await owner('DELETE', `/stages/${added.body.data.id}?moveToStageId=${newStage}`);
  assert.equal(del.status, 200, JSON.stringify(del.body));
  assert.equal(del.body.data.movedOpportunities, 1);
  const moved = await owner('GET', `/opportunities/${opp.body.data.id}`);
  assert.equal(moved.body.data.stageId, newStage, 'no orphaned deal');
  const audit = await prisma.auditEvent.findMany({ where: { workspaceId: ws.workspaceId, action: { in: ['STAGE_CREATED', 'STAGE_UPDATED', 'STAGES_REORDERED', 'STAGE_DELETED', 'FIELD_CREATED', 'PIPELINE_CREATED'] } } });
  assert.ok(audit.length >= 8, 'configuration changes are audited');
});

test('three-criteria filters save as a list that updates as records change', async () => {
  const visit = sales.stages.find((s) => s.name === 'Site visit')!;
  const mk = (title: string, tags: string[], roof: string) =>
    owner('POST', '/opportunities', { title, value: 500, pipelineId: sales.id, stageId: visit.id, tags, customValues: { roof_type: roof } });
  const match = await mk('Match me', ['hot'], 'Metal');
  await mk('Wrong tag', ['cold'], 'Metal');
  const later = await mk('Will match later', ['hot'], 'Flat');

  const filters = { stageId: visit.id, tag: 'hot', fields: [{ key: 'roof_type', op: 'eq', value: 'Metal' }] };
  const direct = await owner('GET', `/opportunities?stageId=${visit.id}&tag=hot&fields=${encodeURIComponent(JSON.stringify(filters.fields))}`);
  assert.deepEqual(direct.body.data.items.map((o: { title: string }) => o.title), ['Match me']);

  const list = await owner('POST', '/lists', { name: 'Hot metal roofs at site visit', filters });
  assert.equal(list.status, 201, JSON.stringify(list.body));
  let items = (await owner('GET', `/lists/${list.body.data.id}/items`)).body.data.items.map((o: { title: string }) => o.title);
  assert.deepEqual(items, ['Match me']);

  // A record starts matching...
  await owner('PATCH', `/opportunities/${later.body.data.id}`, { customValues: { roof_type: 'Metal' }, version: later.body.data.version });
  // ...and another stops matching.
  await owner('PATCH', `/opportunities/${match.body.data.id}`, { tags: ['won-over'], version: match.body.data.version });
  items = (await owner('GET', `/lists/${list.body.data.id}/items`)).body.data.items.map((o: { title: string }) => o.title);
  assert.deepEqual(items, ['Will match later'], 'the saved list follows the records');

  const lists = await owner('GET', '/lists');
  assert.equal(lists.body.data.items.find((l: { id: string }) => l.id === list.body.data.id).count, 1);

  const byValue = await call(api, 'GET', '/api/crm/opportunities?minValue=100', { token: user.token });
  assert.equal(byValue.status, 403, 'cannot filter by a hidden value');
});

test('archiving a field removes it from forms and stage requirements but keeps stored values', async () => {
  const quote = sales.stages.find((s) => s.name === 'Quote sent')!;
  const del = await owner('DELETE', `/fields/${f.site_visit_date.id}`);
  assert.equal(del.status, 200);
  const stage = await prisma.pipelineStage.findUniqueOrThrow({ where: { id: quote.id } });
  assert.ok(!stage.requiredFieldIds.includes(f.site_visit_date.id));
  const fields = await owner('GET', `/fields?pipelineId=${sales.id}`);
  assert.ok(!fields.body.data.items.some((x: { key: string }) => x.key === 'site_visit_date'));
  const withValue = await prisma.opportunity.findFirst({ where: { workspaceId: ws.workspaceId, title: 'Needs details' } });
  assert.equal((withValue!.customValues as Record<string, unknown>).site_visit_date, '2026-10-30');
});

test('concurrent edits do not silently overwrite each other', async () => {
  const opp = await owner('POST', '/opportunities', { title: 'Race', value: 10, pipelineId: sales.id });
  const first = await owner('PATCH', `/opportunities/${opp.body.data.id}`, { title: 'Edit A', version: opp.body.data.version });
  const second = await owner('PATCH', `/opportunities/${opp.body.data.id}`, { title: 'Edit B', version: opp.body.data.version });
  assert.equal(first.status, 200);
  assert.equal(second.status, 409);
});
