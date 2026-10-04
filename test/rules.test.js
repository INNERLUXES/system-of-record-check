import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownershipOf, readMap, defaultConfig, fieldList } from '../src/index.js';
import { base, findingsOf, jsonOf, lineOf, reportOf, rulesOf } from './helpers.js';

// Every rule with a map written inline, small enough that the result can be worked out by hand, and a near miss on each
// side. base() in test/helpers.js is a map that passes every check.

const third = (entities, more = {}) => ({ name: 'Shop', kind: 'commerce', team: 'Digital', contact: 'shop channel', entities, ...more });

test('the base map passes every rule', () => {
  const r = reportOf(base());
  assert.deepEqual(r.findings, []);
  assert.equal(r.result.text, 'PASS - no error');
});

test('ownership: a claim on a field comes before a claim on its entity, and an entity claim covers only the fields its owner holds', () => {
  const m = base();
  m.systems.erp.entities.customer.fields.push('terms');
  const own = ownershipOf(readMap(jsonOf(m), 'map.json', defaultConfig()));
  const rec = own.byName.get('customer');
  assert.equal(rec.owner, 'crm');
  assert.deepEqual(rec.fields.map((f) => [f.field, f.owner, f.via]), [['id', 'crm', 'entity'], ['name', 'crm', 'entity'], ['limit', 'erp', 'field'], ['terms', null, null]]);
  assert.equal(own.holds('erp', 'customer', 'terms'), true);
  assert.equal(own.holds('crm', 'customer', 'terms'), false);
  assert.equal(own.entityOf('crm', 'invoice'), undefined);
});

test('missing-owner: an entity held by two systems with no owner, and a field the owner of its entity does not hold', () => {
  const m = base();
  delete m.systems.crm.entities.customer.owns;
  const r = reportOf(m);
  assert.deepEqual(rulesOf(r).filter((x) => x === 'missing-owner'), ['missing-owner']);
  const f = findingsOf(r, 'missing-owner')[0];
  assert.equal(f.found, 'the entity customer is held by 2 systems, crm and erp, and none owns it; mark its system of record with "owns: true"');
  assert.equal(f.line, lineOf(jsonOf(m), '"customer"'));
  // A field held by two systems, neither of them the owner of the entity.
  const n = base();
  n.systems.shop = third({ customer: ['id', 'email'] });
  n.systems.erp.entities.customer.fields.push('email');
  n.flows.push({ source: 'crm', target: 'shop', entity: 'customer', fields: ['id'], mode: 'api' });
  const s = reportOf(n);
  assert.deepEqual(findingsOf(s, 'missing-owner').map((x) => x.found), ['customer.email is held by 2 systems, erp and shop, and none owns it; crm, the owner of customer, does not hold it']);
  assert.equal(findingsOf(s, 'missing-owner')[0].line, lineOf(jsonOf(n), '"email"'));
  // Near misses: a field held by one system only, and a field with an owner of its own.
  const one = base();
  one.systems.erp.entities.customer.fields.push('email');
  assert.deepEqual(findingsOf(reportOf(one), 'missing-owner'), []);
  n.systems.shop.entities.customer = { fields: ['id', 'email'], owns: ['email'] };
  n.flows.push({ source: 'shop', target: 'erp', entity: 'customer', fields: ['email'], mode: 'event' });
  assert.deepEqual(rulesOf(reportOf(n)), []);
});

test('missing-owner: an entity with no owner is reported once, not once for each of its fields', () => {
  const m = base();
  delete m.systems.crm.entities.customer.owns;
  delete m.systems.erp.entities.customer.owns;
  m.flows = [];
  const r = reportOf(m);
  assert.deepEqual(rulesOf(r), ['missing-owner']);
});

test('conflicting-owner: an entity claimed by two systems, and a field claimed by two systems', () => {
  const m = base();
  m.systems.erp.entities.customer.owns = true;
  const r = reportOf(m);
  const f = findingsOf(r, 'conflicting-owner');
  assert.equal(f.length, 1);
  assert.equal(f[0].found, 'the entity customer is claimed as owned by 2 systems, crm and erp; name one system of record');
  assert.equal(f[0].line, lineOf(jsonOf(m), '"owns"', 2));
  const n = base();
  n.systems.crm.entities.customer.owns = ['id', 'name', 'limit'];
  const s = reportOf(n);
  assert.deepEqual(findingsOf(s, 'conflicting-owner').map((x) => x.found), ['customer.limit is claimed as owned by 2 systems, crm and erp; name one system of record']);
  assert.equal(findingsOf(s, 'conflicting-owner')[0].line, lineOf(jsonOf(n), '"limit"', 4));
  assert.ok(!rulesOf(s).includes('write-back'), 'a field with two owners is not also a write-back');
  // Near miss: a field owner inside an entity another system owns is not a conflict.
  assert.deepEqual(findingsOf(reportOf(base()), 'conflicting-owner'), []);
});

test('write-back: a flow into the owner, a flow that passes on a copy, the return way of a two-way flow', () => {
  const m = base();
  m.flows.push({ id: 'back', source: 'erp', target: 'crm', entity: 'customer', fields: ['name'], mode: 'api' });
  const r = reportOf(m);
  assert.deepEqual(findingsOf(r, 'write-back').map((f) => f.found), ['the flow back writes customer.name from erp into crm, which owns that field; the owner should be the source']);
  assert.equal(findingsOf(r, 'write-back')[0].line, lineOf(jsonOf(m), '"id": "back"') - 1);
  const n = base();
  n.systems.shop = third({ customer: ['id', 'name'] });
  n.flows.push({ id: 'relay', source: 'erp', target: 'shop', entity: 'customer', fields: ['id', 'name'], mode: 'file' });
  assert.deepEqual(findingsOf(reportOf(n), 'write-back').map((f) => f.found), ['the flow relay passes customer.id and customer.name from erp to shop, but crm owns those fields; feed shop from crm']);
  const two = base();
  two.flows[1].direction = 'two-way';
  assert.deepEqual(findingsOf(reportOf(two), 'write-back').map((f) => f.found), ['the flow up (two-way) writes customer.limit from crm into erp, which owns that field; the owner should be the source']);
  // Near misses: the owner as the source, and a field with no owner.
  assert.deepEqual(findingsOf(reportOf(base()), 'write-back'), []);
});

test('write-back: an exception with a reason is approved; with no reason, or a reason such as TBD, it is not', () => {
  const m = base();
  m.flows.push({ id: 'back', source: 'erp', target: 'crm', entity: 'customer', fields: ['name'], mode: 'api', exception: { reason: 'Finance corrects legal names during the credit check.', approvedBy: 'Sales' } });
  const r = reportOf(m);
  assert.deepEqual(rulesOf(r), []);
  assert.equal(r.map.counts.approved, 1);
  for (const exception of [true, { reason: 'TBD' }, { reason: ' ' }, { approvedBy: 'Sales' }]) {
    m.flows[2].exception = exception;
    const s = reportOf(m);
    assert.match(findingsOf(s, 'write-back')[0].found, /; it is marked as an exception but gives no reason$/, JSON.stringify(exception));
    assert.equal(s.map.counts.approved, 0);
  }
  m.flows[2].exception = false;
  assert.doesNotMatch(findingsOf(reportOf(m), 'write-back')[0].found, /exception/);
});

test('unfed-copy: a copy that no flow from the owner feeds, grouped by holder and owner; a feed from another copy does not count', () => {
  const m = base();
  m.flows.pop();
  const r = reportOf(m);
  assert.deepEqual(findingsOf(r, 'unfed-copy').map((f) => f.found), ['crm holds customer.limit, owned by erp, and no flow from erp feeds it; the copy can drift from its owner']);
  assert.equal(findingsOf(r, 'unfed-copy')[0].line, lineOf(jsonOf(m), '"limit"'));
  assert.equal(findingsOf(r, 'unfed-copy')[0].level, 'warning');
  const n = base();
  n.systems.shop = third({ customer: ['id', 'name'] });
  n.flows.push({ id: 'relay', source: 'erp', target: 'shop', entity: 'customer', fields: ['id', 'name'], mode: 'file', exception: { reason: 'The shop reads from the ERP until the CRM has an interface.' } });
  assert.deepEqual(findingsOf(reportOf(n), 'unfed-copy').map((f) => f.found), ['shop holds customer.id and customer.name, owned by crm, and no flow from crm feeds them; the copy can drift from its owner']);
  // Near miss: a two-way flow feeds both of its ends.
  const two = base();
  two.flows[0] = { id: 'both', source: 'erp', target: 'crm', entity: 'customer', fields: ['id', 'name'], direction: 'two-way', mode: 'api', exception: { reason: 'Kept both ways during the move.' } };
  assert.deepEqual(findingsOf(reportOf(two), 'unfed-copy'), []);
});

test('unknown-reference: an unknown system, an entity no system holds, an entity or fields an end does not hold', () => {
  const m = base();
  m.flows.push({ id: 'a', source: 'crm', target: 'billing', entity: 'customer', fields: ['id'], mode: 'file' });
  m.flows.push({ id: 'b', source: 'ledger', target: 'billing', entity: 'customer', fields: ['id'], mode: 'file' });
  m.flows.push({ id: 'c', source: 'crm', target: 'erp', entity: 'invoice', fields: ['id'], mode: 'file' });
  m.systems.erp.entities.invoice = ['number'];
  m.flows.push({ id: 'd', source: 'crm', target: 'erp', entity: 'invoice', fields: ['number'], mode: 'file' });
  m.flows.push({ id: 'e', source: 'crm', target: 'erp', entity: 'customer', fields: ['id', 'email', 'phone'], mode: 'file' });
  m.flows.push({ id: 'f', source: 'crm', target: 'erp', entity: 'contract', fields: ['id'], mode: 'file' });
  const found = findingsOf(reportOf(m), 'unknown-reference').map((f) => f.found);
  assert.deepEqual(found, [
    'the flow a names the target "billing", which is not a system of the map',
    'the flow b names the source "ledger" and the target "billing", which are not systems of the map',
    'the source of c, crm, does not hold the entity invoice',
    'the target of c, erp, does not hold invoice.id',
    'the source of d, crm, does not hold the entity invoice',
    'the source of e, crm, does not hold customer.email and customer.phone',
    'the target of e, erp, does not hold customer.email and customer.phone',
    'the flow f carries the entity "contract", which no system of the map holds'
  ]);
  // Near miss: every name the flows use is described.
  assert.deepEqual(findingsOf(reportOf(base()), 'unknown-reference'), []);
});

test('circular-sync: a two-way flow and two one-way flows; an approved exception in the loop silences it', () => {
  const m = base();
  m.flows.push({ id: 'back', source: 'erp', target: 'crm', entity: 'customer', fields: ['id', 'name'], mode: 'api' });
  const r = reportOf(m);
  assert.deepEqual(findingsOf(r, 'circular-sync').map((f) => f.found), ['customer.id and customer.name go both ways between crm and erp through the flows down and back; each side can overwrite the other']);
  assert.equal(findingsOf(r, 'circular-sync')[0].line, lineOf(jsonOf(m), '"id": "back"') - 1);
  const two = base();
  two.flows[1].direction = 'two-way';
  assert.deepEqual(findingsOf(reportOf(two), 'circular-sync').map((f) => f.found), ['customer.limit goes both ways between crm and erp through the two-way flow up; each side can overwrite the other']);
  m.flows[2].exception = { reason: 'Finance corrects names during the credit check.' };
  assert.deepEqual(findingsOf(reportOf(m), 'circular-sync'), []);
  // Near miss: different fields each way.
  assert.deepEqual(findingsOf(reportOf(base()), 'circular-sync'), []);
});

test('system-without-owner: no team, no contact, a value that names no one; the configuration says which are needed', () => {
  const m = base();
  delete m.systems.crm.team;
  m.systems.erp.contact = 'TBD';
  const r = reportOf(m);
  assert.deepEqual(findingsOf(r, 'system-without-owner').map((f) => f.found), [
    'the system crm has no team, so no one answers for the data it holds',
    'the system erp has no contact ("TBD" names no one), so no one answers for the data it holds'
  ]);
  assert.equal(findingsOf(r, 'system-without-owner')[0].line, lineOf(jsonOf(m), '"crm": {'));
  assert.deepEqual(findingsOf(reportOf(m, { systemOwner: ['team'] }), 'system-without-owner').map((f) => f.found), ['the system crm has no team, so no one answers for the data it holds']);
  assert.deepEqual(findingsOf(reportOf(m, { systemOwner: [] }), 'system-without-owner'), []);
  m.systems.erp.contact = '-';
  assert.match(findingsOf(reportOf(m), 'system-without-owner')[1].found, /has no contact, so/);
  // Near miss: any text that names someone counts.
  m.systems.erp.contact = 'someone';
  m.systems.crm.team = 'x';
  assert.deepEqual(findingsOf(reportOf(m), 'system-without-owner'), []);
});

test('levels: a rule can be raised, lowered or turned off; findings are sorted by level, then line', () => {
  const m = base();
  m.flows.pop();
  delete m.systems.crm.team;
  assert.equal(reportOf(m).result.text, 'PASS - no error (2 warnings)');
  const raised = reportOf(m, { rules: { unfedCopy: 'error' } });
  assert.deepEqual(rulesOf(raised), ['unfed-copy', 'system-without-owner']);
  assert.equal(raised.result.pass, false);
  assert.deepEqual(rulesOf(reportOf(m, { rules: { unfedCopy: 'off', systemWithoutOwner: 'notice' } })), ['system-without-owner']);
  const r = reportOf(m);
  assert.deepEqual(r.findings.map((f) => f.line), [...r.findings.map((f) => f.line)].sort((a, b) => a - b));
});

test('fieldList: fields of an entity for a sentence', () => {
  assert.equal(fieldList('customer', ['a']), 'customer.a');
  assert.equal(fieldList('customer', ['a', 'b', 'c', 'd', 'e', 'f']), 'customer.a, customer.b, customer.c, customer.d and 2 more');
});

test('the map summary counts the systems, the entities, the shared fields and the flows', () => {
  const m = base();
  m.flows[1].direction = 'two-way';
  const c = reportOf(m).map.counts;
  assert.deepEqual(c, { systems: 2, systemsWithoutOwner: 0, entities: 1, fields: 3, shared: { all: 3, owned: 3, unowned: 0, conflicting: 0 }, flows: 2, modes: { api: 1, batch: 1 }, twoWay: 1, approved: 0 });
});
