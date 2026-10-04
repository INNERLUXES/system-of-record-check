import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FILE_LIMITS, LIMITS, MAX_PROBLEMS, YamlError, parseJson, parseYaml } from '../src/index.js';
import { base, cli, jsonOf, reportOf, rulesOf, run, withFiles } from './helpers.js';

// Hostile input: maps built to exhaust the memory or the time, to make the tool follow a link, to rewrite the terminal,
// to start a second workflow command or to change how objects behave. Each heavy test also checks the time, because work
// that grows faster than the input is a failure even when the answer is right. Tests that need a symbolic link, a
// device or file permissions are guarded with process.platform, and none of them asserts a line: lines are asserted in
// the tests that run everywhere.

const LIMIT = { timeout: 180000 };
// Coverage counting slows every line of the tool several times over, so a run with --experimental-test-coverage gets a
// wider time limit. A plain `npm test` keeps the tight one, and that is the run that guards against slow growth.
// The runner sets NODE_V8_COVERAGE for its test processes only when coverage is on.
const COVERAGE = Boolean(process.env.NODE_V8_COVERAGE);
const fast = async (fn, ms = 5000) => {
  const limit = COVERAGE ? ms * 4 : ms;
  const start = Date.now();
  const result = await fn();
  assert.ok(Date.now() - start < limit, `took ${Date.now() - start} ms`);
  return result;
};

const GOOD = { 'map.json': jsonOf(base()) };

test('hostile: a map or a configuration over its size limit is refused before it is read', LIMIT, async () => {
  const big = await fast(() => run({ 'map.json': `{"name": "${'x'.repeat(FILE_LIMITS.maxMapBytes)}"}` }, ['map.json']));
  assert.equal(big.code, 2);
  assert.match(big.err, /map\.json: [\d,]+ bytes is over the 2 MB limit/);
  const config = await run({ ...GOOD, 'c.json': ' '.repeat(FILE_LIMITS.maxConfigBytes + 1) }, ['map.json', '--config', 'c.json']);
  assert.equal(config.code, 2);
  assert.match(config.err, /c\.json: [\d,]+ bytes is over the 1 MB limit/);
  const small = await run(GOOD, ['map.json'], { maxMapBytes: 100 });
  assert.match(small.err, /over the 100 byte limit/);
});

test('hostile: hundreds of systems and thousands of flows and fields are checked in seconds', LIMIT, async () => {
  const m = { systems: {}, flows: [] };
  for (let s = 0; s < 300; s += 1) {
    m.systems[`s${s}`] = { team: 'T', contact: 'C', entities: { customer: { fields: Array.from({ length: 40 }, (_, f) => `f${f}`), owns: s === 0 } } };
    if (s > 0) m.flows.push({ source: 's0', target: `s${s}`, entity: 'customer', fields: Array.from({ length: 40 }, (_, f) => `f${f}`), mode: 'api' });
    if (s > 0 && s % 3 === 0) m.flows.push({ source: `s${s}`, target: 's0', entity: 'customer', fields: ['f1', 'f2'], mode: 'event' });
  }
  const r = await fast(() => run({ 'map.json': jsonOf(m) }, ['map.json', '--json']), 20000);
  const json = JSON.parse(r.out);
  assert.equal(json.map.counts.fields, 40);
  assert.equal(json.totals.findings, 99 + 99, 'a write-back and a loop for every third system');
  assert.equal(json.findings.filter((f) => f.rule === 'write-back').length, 99);
  const many = { systems: { a: { team: 'T', contact: 'C', entities: { e: { fields: ['x'], owns: true } } }, b: { team: 'T', contact: 'C', entities: { e: ['x'] } } }, flows: [] };
  for (let i = 0; i < 1200; i += 1) many.flows.push({ source: 'b', target: 'a', entity: 'e', fields: ['x'], mode: 'api' });
  const capped = JSON.parse((await fast(() => run({ 'map.json': jsonOf(many) }, ['map.json', '--json']), 20000)).out);
  assert.equal(capped.findings.filter((f) => f.rule === 'write-back').length, LIMITS.maxFindingsPerRule, 'every rule lists at most its limit');
  assert.equal(capped.totals.findings, 1200 + 1, 'every flow writes back, and the copy has no feed');
  assert.ok(capped.notes.some((n) => /findings past the limit of 500 per rule are counted but not listed/.test(n)));
});

test('hostile: YAML lines of megabytes full of colons, quotes, hashes, brackets and spaces are read in one pass', LIMIT, async () => {
  for (const text of [
    `a: ${':'.repeat(1000000)}`,
    `a: ${': '.repeat(500000)}x`,
    `a: "${'\\"'.repeat(500000)}`,
    `a: '${"''".repeat(500000)}`,
    `a: [${'b,'.repeat(300000)}`,
    `${' '.repeat(1000000)}x`,
    `a: ${' #'.repeat(500000)}`,
    `${'- '.repeat(200000)}x`,
    `a: ${'x '.repeat(500000)}`
  ]) {
    await fast(() => {
      try {
        parseYaml(text);
      } catch (error) {
        assert.ok(error instanceof YamlError, error.message);
      }
    });
  }
  await fast(() => parseYaml(Array.from({ length: 40000 }, (_, i) => `k${i}: v`).join('\n')));
  await fast(() => assert.throws(() => parseYaml(`a: [${'1,'.repeat(200000)}1]`), /more than 100000 values/));
});

test('hostile: JSON nested very deep or very long is refused in one pass', LIMIT, async () => {
  for (const content of ['['.repeat(500000), `{"name": "${'x'.repeat(5000)}"}`, `{"flows": [${'{},'.repeat(100001)}{}]}`]) {
    const r = await fast(() => run({ 'map.json': content }, ['map.json']));
    assert.equal(r.code, 2);
    assert.ok(r.err.length < 3000, 'the error stays short');
  }
  await fast(async () => assert.throws(() => parseJson(`[${'1,'.repeat(300000)}1]`), /more than 100000 values/));
});

test('hostile: a map with a hundred mistakes lists twenty problems and a count', LIMIT, async () => {
  const m = base();
  m.flows = Array.from({ length: 100 }, () => ({ source: 'crm' }));
  const r = await fast(() => run({ 'map.json': jsonOf(m) }, ['map.json']));
  assert.equal(r.code, 2);
  assert.match(r.err, /the input has problems:/);
  assert.match(r.err, /\n {2}and \d+ more\n$/);
  assert.equal(r.err.split('\n').filter((l) => l.startsWith('  map.json')).length, MAX_PROBLEMS);
});

test('hostile: CRLF, CR and a byte order mark give the same report as LF, in JSON and in YAML', async () => {
  const m = base();
  m.flows.pop();
  const text = jsonOf(m);
  const lf = await run({ 'map.json': text }, ['map.json', '--json']);
  const yaml = 'systems:\n  a:\n    team: T\n    entities:\n      e:\n        fields: [x]\n        owns: true\n  b:\n    team: T\n    contact: C\n    entities:\n      e: [x]\n';
  const ylf = await run({ 'map.yaml': yaml }, ['map.yaml', '--json']);
  assert.equal(ylf.code, 0, ylf.err);
  for (const eol of ['\r\n', '\r']) {
    const r = await run({ 'map.json': `${String.fromCharCode(0xfeff)}${text.split('\n').join(eol)}` }, ['map.json', '--json']);
    assert.equal(r.out, lf.out, JSON.stringify(eol));
    const y = await run({ 'map.yaml': `${String.fromCharCode(0xfeff)}${yaml.split('\n').join(eol)}` }, ['map.yaml', '--json']);
    assert.equal(y.out, ylf.out, JSON.stringify(eol));
  }
});

test('hostile: control, escape and direction characters in file names, teams, contacts and reasons never reach the reports', async () => {
  const esc = String.fromCharCode(27);
  const rlo = String.fromCharCode(0x202e);
  const ls = String.fromCharCode(0x2028);
  const m = base();
  m.name = `Map${esc}[31m${ls}`;
  m.systems.crm.contact = `TBD${rlo}`;
  m.systems.erp.team = `Fin${esc}[2J`;
  m.flows.push({ source: 'erp', target: 'crm', entity: 'customer', fields: ['name'], mode: 'api', exception: { reason: `x${esc}`, approvedBy: rlo } });
  const files = { [`map${rlo}.json`]: jsonOf(m), [`bad${rlo}.json`]: `{"name": "${esc}"` };
  for (const format of ['text', 'json', 'github']) {
    const r = await run(files, [`map${rlo}.json`, '--format', format, '--explain'].filter((a) => format !== 'github' || a !== '--explain'));
    assert.ok(r.code === 0 || r.code === 1, r.err);
    for (const c of [esc, rlo, ls]) assert.ok(!r.out.includes(c) && !r.err.includes(c), `${format}: ${c.charCodeAt(0)}`);
  }
  const bad = await run(files, [`bad${rlo}.json`]);
  assert.equal(bad.code, 2);
  assert.ok(!bad.err.includes(esc) && !bad.err.includes(rlo));
  const matrix = await run(files, [`map${rlo}.json`, '--matrix']);
  assert.ok(!matrix.out.includes(rlo));
});

test('hostile: constructor, toString and hasOwnProperty as system, entity, field and flow names are only data; __proto__ is not a name', async () => {
  const m = {
    systems: {
      constructor: { team: 'T', contact: 'C', entities: { toString: { fields: ['hasOwnProperty', 'valueOf'], owns: true } } },
      toString: { team: 'T', contact: 'C', entities: { toString: ['hasOwnProperty'] } }
    },
    flows: [{ id: 'constructor', source: 'constructor', target: 'toString', entity: 'toString', fields: ['hasOwnProperty'], mode: 'api' }]
  };
  assert.deepEqual(rulesOf(reportOf(m)), []);
  m.flows.push({ source: 'toString', target: 'constructor', entity: 'toString', fields: ['valueOf'], mode: 'api' });
  assert.deepEqual(rulesOf(reportOf(m)), ['unknown-reference']);
  assert.equal(Object.getPrototypeOf({}), Object.prototype);
  const proto = await run({ 'map.json': '{"systems": {"__proto__": {}}}' }, ['map.json']);
  assert.equal(proto.code, 2);
  assert.match(proto.err, /the system id "__proto__" is not a name/);
  const yaml = await run({ 'map.yaml': '__proto__:\n  polluted: true\n' }, ['map.yaml']);
  assert.equal(yaml.code, 2);
  assert.match(yaml.err, /"__proto__" is not a key of the map/);
  assert.equal({}.polluted, undefined);
});

test('hostile: an empty file, only a comment, a map with no entities and a flow list of null are read without a crash', async () => {
  assert.equal((await run({ 'map.json': '' }, ['map.json'])).code, 2);
  assert.match((await run({ 'map.yaml': '# nothing\n' }, ['map.yaml'])).err, /map\.yaml: line 1: the file holds no value/);
  const r = await run({ 'map.yaml': 'systems:\n  a:\n    team: T\n    contact: C\nflows:\n' }, ['map.yaml', '--matrix']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /\n {2}no entity\n/);
});

test('hostile: a map named through a symbolic link is refused, not followed', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows needs extra rights to make a symbolic link');
    return;
  }
  await withFiles({ ...GOOD, 'secret.json': '{"systems": {}}' }, async (dir) => {
    await symlink(resolve(dir, 'map.json'), resolve(dir, 'linked.json'));
    const r = await cli(['linked.json'], dir);
    assert.equal(r.code, 2);
    assert.match(r.err, /linked\.json: is a symbolic link, which is not followed/);
    const c = await cli(['map.json', '--config', 'linked.json'], dir);
    assert.equal(c.code, 2);
    assert.match(c.err, /is a symbolic link/);
  });
});

test('hostile: a device named as the map or the configuration is refused', LIMIT, async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows has no /dev/zero to name as an input');
    return;
  }
  await withFiles(GOOD, async (dir) => {
    const config = await fast(() => cli(['map.json', '--config', '/dev/zero'], dir));
    assert.equal(config.code, 2);
    assert.match(config.err, /is not a regular file/);
    const input = await fast(() => cli(['/dev/zero'], dir));
    assert.equal(input.code, 2);
    assert.match(input.err, /the name must end in \.json, \.yaml or \.yml/);
  });
});

test('hostile: a file that cannot be opened stops the run with its reason, and is never passed over', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows does not take away read access with chmod');
    return;
  }
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    t.skip('the root user can read a file without read access');
    return;
  }
  await withFiles(GOOD, async (dir) => {
    await chmod(resolve(dir, 'map.json'), 0o000);
    try {
      const r = await cli(['map.json'], dir);
      assert.equal(r.code, 2);
      assert.match(r.err, /map\.json: cannot be read \(EACCES\)/);
    } finally {
      await chmod(resolve(dir, 'map.json'), 0o644);
    }
  });
});
