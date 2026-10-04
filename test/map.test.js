import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP_KEYS, MAP_LIMITS, MapError, defaultConfig, formatOf, isName, parseMapText, readMap, validateMap } from '../src/index.js';
import { base, configOf, jsonOf, lineOf } from './helpers.js';

// The form of the map: what is read, and every mistake it refuses with its line.

const problemsOf = (map, config = null, file = 'map.json') => {
  const text = typeof map === 'string' ? map : jsonOf(map);
  try {
    readMap(text, file, configOf(config));
  } catch (error) {
    assert.ok(error instanceof MapError, error.message);
    return error.problems;
  }
  assert.fail(`not refused: ${text.slice(0, 200)}`);
};

test('map: the model of the base map, with the line of every system, entity, field and flow', () => {
  const text = jsonOf(base());
  const m = readMap(text, 'map.json', defaultConfig());
  assert.equal(m.format, 'JSON');
  assert.equal(m.name, 'Test map');
  assert.deepEqual(m.systems.map((s) => [s.id, s.team, s.contact, s.line]), [['crm', 'Sales', 'sales channel', lineOf(text, '"crm": {')], ['erp', 'Finance', 'finance channel', lineOf(text, '"erp": {')]]);
  const crm = m.systems[0].entities[0];
  assert.deepEqual([crm.entity, crm.fields, crm.owns], ['customer', ['id', 'name', 'limit'], true]);
  assert.equal(crm.fieldLines.get('limit'), lineOf(text, '"limit"'));
  const erp = m.systems[1].entities[0];
  assert.deepEqual(erp.owns, ['limit']);
  assert.equal(erp.ownsLines.get('limit'), lineOf(text, '"limit"', 3));
  assert.deepEqual(m.flows.map((f) => [f.label, f.direction, f.mode, f.approved, f.line]), [['down', 'one-way', 'api', false, lineOf(text, '"id": "down"') - 1], ['up', 'one-way', 'batch', false, lineOf(text, '"id": "up"') - 1]]);
});

test('map: an entity may be a plain list of fields, a flow needs no id, and the flows may be left out', () => {
  const m = base();
  m.systems.erp.entities.invoice = ['number', 'total'];
  delete m.flows[0].id;
  const model = readMap(jsonOf(m), 'map.json', defaultConfig());
  assert.deepEqual(model.systems[1].entities[1], { ...model.systems[1].entities[1], entity: 'invoice', fields: ['number', 'total'], owns: false });
  assert.equal(model.flows[0].label, 'flows[0]');
  delete m.flows;
  delete m.name;
  assert.deepEqual(readMap(jsonOf(m), 'map.json', defaultConfig()).flows, []);
});

test('map: the format comes from the end of the name, and other names are refused', () => {
  assert.equal(formatOf('a/MAP.JSON'), 'JSON');
  assert.equal(formatOf('map.yml'), 'YAML');
  assert.equal(formatOf('map.yaml'), 'YAML');
  assert.equal(formatOf('map.txt'), null);
  assert.throws(() => readMap('{}', 'map.txt', defaultConfig()), /map\.txt: the name must end in \.json, \.yaml or \.yml/);
  assert.throws(() => parseMapText('{"a": 1,}', 'm.json', 'JSON'), (e) => e instanceof MapError && /m\.json: line 1, column 9: a comma before the closing brace/.test(e.problems[0]));
  assert.throws(() => parseMapText('a: 1\na: 2', 'm.yaml', 'YAML'), (e) => e instanceof MapError && /m\.yaml: line 2: the key "a" appears twice/.test(e.problems[0]));
});

test('map: every unknown key is a mistake with its line and a suggestion', () => {
  const m = base();
  m.sytems = {};
  m.systems.crm.teem = 'x';
  m.systems.crm.entities.customer.own = true;
  m.flows[0].targte = 'erp';
  m.flows[1].exception = { reason: 'x', approvedby: 'y' };
  const text = jsonOf(m);
  assert.deepEqual(problemsOf(m), [
    `map.json: line ${lineOf(text, '"own"')}: "own" is not a key of systems.crm.entities.customer (fields, owns); did you mean "owns"?`,
    `map.json: line ${lineOf(text, '"teem"')}: "teem" is not a key of systems.crm (name, kind, team, contact, entities); did you mean "team"?`,
    `map.json: line ${lineOf(text, '"targte"')}: "targte" is not a key of flows[0] (id, source, target, entity, fields, direction, mode, exception, note); did you mean "target"?`,
    `map.json: line ${lineOf(text, '"approvedby"')}: "approvedby" is not a key of flows[1].exception (reason, approvedBy); did you mean "approvedBy"?`,
    `map.json: line ${lineOf(text, '"sytems"')}: "sytems" is not a key of the map (name, systems, flows); did you mean "systems"?`
  ]);
});

test('map: wrong values are mistakes: kinds, names, repeats, owned fields, flows to themselves, ids used twice, modes, directions', () => {
  const cases = [
    [(m) => { m.systems = []; }, /systems must be an object of systems by their ids, not a list/],
    [(m) => { m.systems = {}; }, /systems describes no system/],
    [(m) => { delete m.systems; }, /the map has no systems/],
    [(m) => { m.systems['1crm'] = {}; }, /the system id "1crm" is not a name/],
    [(m) => { m.systems.crm = 'x'; }, /systems\.crm must be an object/],
    [(m) => { m.systems.crm.team = 3; }, /systems\.crm\.team must be a text, not a number/],
    [(m) => { m.systems.crm.name = 'x'.repeat(301); }, /holds more than 300 characters/],
    [(m) => { m.systems.crm.entities = []; }, /systems\.crm\.entities must be an object of entities/],
    [(m) => { m.systems.crm.entities['cust omer'] = ['a']; }, /the entity "cust omer" of crm is not a name/],
    [(m) => { m.systems.crm.entities.customer = 'id'; }, /must be a list of fields or an object with fields and owns, not a string/],
    [(m) => { m.systems.crm.entities.customer = { owns: true }; }, /has no fields/],
    [(m) => { m.systems.crm.entities.customer.fields = []; }, /fields lists no field/],
    [(m) => { m.systems.crm.entities.customer.fields = ['id', 'id']; }, /fields names "id" twice/],
    [(m) => { m.systems.crm.entities.customer.fields = ['id', 'first name']; }, /"first name" is not a name/],
    [(m) => { m.systems.crm.entities.customer.fields = [1]; }, /must be the name of a field, not a number/],
    [(m) => { m.systems.crm.entities.customer.owns = 'yes'; }, /owns must be true, false or a list of its fields, not a string/],
    [(m) => { m.systems.crm.entities.customer.owns = ['email']; }, /owns names "email", which is not one of its fields/],
    [(m) => { m.flows = {}; }, /flows must be a list of flows, not an object/],
    [(m) => { m.flows[0] = 'x'; }, /flows\[0\] must be an object/],
    [(m) => { delete m.flows[0].mode; }, /flows\[0\] has no mode/],
    [(m) => { delete m.flows[0].fields; }, /flows\[0\] has no fields/],
    [(m) => { m.flows[0].target = 'crm'; }, /flows\[0\] runs from crm to itself/],
    [(m) => { m.flows[1].id = 'down'; }, /the flow id "down" is used twice, first by flows\[0\]/],
    [(m) => { m.flows[0].mode = 'sftp'; }, /flows\[0\]\.mode "sftp" is not one of the modes \(api, batch, event, file, manual, cdc, etl\); add it to modes in the configuration/],
    [(m) => { m.flows[0].mode = 'evnet'; }, /did you mean "event"\?/],
    [(m) => { m.flows[0].mode = 7; }, /flows\[0\]\.mode must be a text, not a number/],
    [(m) => { m.flows[0].direction = 'both'; }, /flows\[0\]\.direction must be one-way or two-way, not "both"/],
    [(m) => { m.flows[0].exception = 'yes'; }, /flows\[0\]\.exception must be true or an object with reason and approvedBy, not a string/],
    [(m) => { m.flows[0].source = { id: 'crm' }; }, /flows\[0\]\.source must be the name of a system, not an object/]
  ];
  for (const [change, pattern] of cases) {
    const m = base();
    change(m);
    assert.match(problemsOf(m).join('\n'), pattern, pattern.source);
  }
  assert.throws(() => readMap('[]', 'map.json', defaultConfig()), /map\.json: line 1: the map must be an object with systems and flows, not a list/);
});

test('map: a mode and a direction are compared without case, and a mode of the configuration is read', () => {
  const m = base();
  m.flows[0].mode = 'API';
  m.flows[0].direction = 'Two-Way';
  m.flows[1].mode = 'sftp';
  const model = readMap(jsonOf(m), 'map.json', configOf({ modes: { add: ['sftp'] } }));
  assert.deepEqual(model.flows.map((f) => [f.mode, f.direction]), [['api', 'two-way'], ['sftp', 'one-way']]);
});

test('map: every problem of a file is listed at once, in the order of the lines', () => {
  const m = base();
  m.systems.crm.team = 1;
  m.flows[1].mode = 'x';
  m.flows[0].direction = 'x';
  const p = problemsOf(m);
  assert.equal(p.length, 3);
  const lines = p.map((x) => Number(/line (\d+)/.exec(x)[1]));
  assert.deepEqual(lines, [...lines].sort((a, b) => a - b));
});

test('map: names, keys and limits', () => {
  assert.equal(isName('customer_id-2'), true);
  assert.equal(isName('2x'), false);
  assert.equal(isName('a.b'), false);
  assert.equal(isName('x'.repeat(81)), false);
  assert.deepEqual(MAP_KEYS.map, ['name', 'systems', 'flows']);
  assert.equal(MAP_LIMITS.maxFlows, 5000);
  assert.throws(() => validateMap({ systems: { s: { entities: { e: Array.from({ length: 5001 }, (_, i) => `f${i}`) } } } }, new Map(), 'm.json', defaultConfig()), /lists more than 5,000 fields/);
});
