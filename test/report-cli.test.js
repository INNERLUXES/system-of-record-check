import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { NOTICE, USAGE, VERSION, escapeData, escapeProperty, parseArgs, toGithub, toJson, toMatrix, toText } from '../src/index.js';
import { base, cli, jsonOf, reportOf, run, withFiles } from './helpers.js';

const GOOD = { 'map.json': jsonOf(base()) };
const badMap = () => {
  const m = base();
  m.flows.pop();
  m.flows.push({ id: 'back', source: 'erp', target: 'crm', entity: 'customer', fields: ['name'], mode: 'api' });
  return m;
};
const BAD = { 'map.json': jsonOf(badMap()) };

test('cli: exit 0 with no error, 1 with an error, and a warning alone does not fail the run', async () => {
  const good = await run(GOOD, ['map.json']);
  assert.equal(good.code, 0, good.err);
  assert.match(good.out, /^system-of-record-check: map\.json\ninput: map\.json \(JSON; 2 systems, 1 entity, 3 fields, 2 flows\)\nconfig: built-in defaults: modes api, batch, event, file, manual, cdc, etl; systems name a team and a contact; minimum severity notice\n/);
  assert.match(good.out, /RESULT: PASS - no error\n$/);
  assert.equal(good.err, '');
  const bad = await run(BAD, ['map.json']);
  assert.equal(bad.code, 1);
  assert.match(bad.out, /RESULT: FAIL - 1 error \(and 2 warnings\)\n$/);
  const m = base();
  m.flows.pop();
  const warning = await run({ 'map.json': jsonOf(m) }, ['map.json']);
  assert.equal(warning.code, 0);
  assert.match(warning.out, /RESULT: PASS - no error \(1 warning\)\n$/);
  const raised = await run({ 'map.json': jsonOf(m), 'c.json': '{"rules": {"unfedCopy": "error"}}' }, ['map.json', '--config', 'c.json']);
  assert.equal(raised.code, 1);
});

test('cli: a map in YAML is read like the same map in JSON', async () => {
  const yaml = ['systems:', '  crm:', '    team: Sales', '    contact: sales channel', '    entities:', '      customer:', '        fields: [id]', '        owns: true', '  erp:', '    team: Finance', '    contact: finance channel', '    entities:', '      customer: [id]', 'flows:', '  - source: crm', '    target: erp', '    entity: customer', '    fields: [id]', '    mode: api', ''].join('\n');
  for (const name of ['map.yaml', 'map.yml']) {
    const r = await run({ [name]: yaml }, [name]);
    assert.equal(r.code, 0, r.err + r.out);
    assert.match(r.out, new RegExp(`input: ${name.replace('.', '\\.')} \\(YAML; 2 systems, 1 entity, 1 field, 1 flow\\)`));
  }
});

test('cli: exit 2 for usage errors, with the usage and nothing on standard output', async () => {
  for (const [args, message] of [
    [[], /give the integration map to check, a \.json, \.yaml or \.yml file/],
    [['a.json', 'b.json'], /one map at a time; b\.json is a second one/],
    [['map.json', '--bogus'], /unknown argument --bogus/],
    [['map.json', '--format', 'html'], /unknown format html \(text, json or github\)/],
    [['map.json', '--format', 'json', '--format', 'text'], /--format was given twice/],
    [['map.json', '--json', '--format', 'github'], /--json and --format github ask for two formats; give one/],
    [['map.json', '--matrix', '--json'], /--matrix prints text; give it without --json or --format/],
    [['map.json', '--matrix', '--explain'], /--matrix shows no findings to explain/],
    [['map.json', '--min-severity', 'fatal'], /unknown level fatal/],
    [['map.json', '--min-severity', 'error', '--min-severity', 'error'], /--min-severity was given twice/],
    [['map.json', '--config'], /--config needs a value/],
    [['map.json', '--config', '--json'], /--config needs a value/],
    [['-'], /reading from standard input is not supported/],
    [['map.json', '--config', '-'], /reading from standard input is not supported/],
    [['https://example.com/map.json'], /give a local path; the tool never fetches a URL/]
  ]) {
    const r = await run(GOOD, args);
    assert.equal(r.code, 2, args.join(' '));
    assert.match(r.err, message);
    assert.ok(r.err.includes('Usage: system-of-record-check'), args.join(' '));
    assert.equal(r.out, '');
  }
  assert.equal(parseArgs(['a.json', '--json', '--format', 'json']).format, 'json');
  assert.equal(parseArgs(['a.json', '--matrix', '--format', 'text']).matrix, true);
});

test('cli: exit 2 for input errors, with every problem and no result', async () => {
  const missing = await run(GOOD, ['nowhere.json']);
  assert.equal(missing.code, 2);
  assert.equal(missing.err, 'system-of-record-check: no result, the input has a problem:\n  nowhere.json: no such file\n');
  assert.equal(missing.out, '');
  assert.match((await run({ 'map.txt': 'x' }, ['map.txt'])).err, /map\.txt: the name must end in \.json, \.yaml or \.yml/);
  assert.match((await run({ 'maps/a.json': '{}' }, ['maps'])).err, /maps: the name must end in/);
  assert.match((await run({ 'maps.json/a.json': '{}' }, ['maps.json'])).err, /maps\.json: is a folder; give the file itself/);
  assert.match((await run({ ...GOOD, 'c.json': '{"nmae": 1}' }, ['map.json', '--config', 'c.json'])).err, /c\.json: line 1: "nmae" is not a key of the configuration; did you mean "name"\?/);
  assert.match((await run(GOOD, ['map.json', '--config', 'none.json'])).err, /none\.json: no such file/);
  assert.match((await run({ 'map.json': Buffer.from([123, 32, 0, 1]) }, ['map.json'])).err, /map\.json: holds binary data \(a null byte\); only text is read/);
  const two = await run({ 'map.json': '{"systems": {"crm": {"teem": 1}}, "flowz": []}' }, ['map.json']);
  assert.equal(two.code, 2);
  assert.match(two.err, /the input has problems:\n {2}map\.json: line 1: "flowz" is not a key of the map .*did you mean "flows"\?\n {2}map\.json: line 1: "teem" is not a key of systems\.crm .*\n/);
  const m = base();
  m.flows[0].mode = 'sftp';
  assert.equal((await run({ 'map.json': jsonOf(m), 'c.json': '{"modes": {"add": ["sftp"]}}' }, ['map.json', '--config', 'c.json'])).code, 0, 'a mode of the configuration is read');
});

test('cli: --help, --version and --print-defaults exit 0 and need no input', async () => {
  const help = await run({}, ['--help']);
  assert.equal(help.code, 0);
  assert.equal(help.out, USAGE);
  for (const option of ['--config', '--format', '--json', '--min-severity', '--matrix', '--explain', '--print-defaults', '--help', '--version']) assert.ok(USAGE.includes(option), option);
  assert.equal((await run({}, ['--version'])).out, `${VERSION}\n`);
  const defaults = await run({}, ['--print-defaults']);
  assert.equal(defaults.code, 0);
  assert.equal(JSON.parse(defaults.out).name, 'built-in defaults');
  assert.equal((await run({ 'c.json': defaults.out, ...GOOD }, ['map.json', '--config', 'c.json'])).code, 0, 'the printed defaults read back as a configuration');
});

test('cli: --min-severity hides findings below it, and the command line wins over the configuration', async () => {
  const all = await run(BAD, ['map.json']);
  assert.match(all.out, /findings: 3 \(1 error, 2 warning\)/);
  const errors = await run(BAD, ['map.json', '--min-severity', 'error']);
  assert.match(errors.out, /findings: 1 \(1 error\); 2 below error not shown/);
  assert.match(errors.out, /note: 2 findings below error are not shown/);
  assert.ok(!errors.out.includes('WARNING'));
  const cfg = await run({ ...BAD, 'c.json': '{"minSeverity": "error"}' }, ['map.json', '--config', 'c.json', '--min-severity', 'warning']);
  assert.match(cfg.out, /findings: 3 \(1 error, 2 warning\)/);
});

test('text: the findings with their level, rule and place, what the map holds, the notice and the result', () => {
  const r = reportOf(badMap());
  const out = toText(r);
  assert.match(out, /\n {2}ERROR {4}write-back {12}map\.json:\d+\n {11}the flow back writes customer\.name from erp into crm/);
  assert.match(out, /\nMap: map\.json \("Test map"\)\n\n {2}systems {3}2: crm and erp; 0 without a team or a contact\n {2}entities {2}1: customer \(owner crm\)\n/);
  assert.match(out, /\n {2}fields {4}3 held, 3 held by two or more systems: 3 with one owner, 0 with no owner, 0 with two owners or more\n {2}flows {5}2: 2 api; 0 two-way; 0 approved exceptions\n/);
  assert.ok(out.includes(`\n${NOTICE}\n\nRESULT: FAIL - 1 error (and 2 warnings)\n`));
  const explained = toText(r, { explain: true });
  assert.match(explained, /\n {11}rule: a flow, or the return way of a two-way flow, that carries a field/);
  assert.match(explained, /\n {11}basis: each data element is mastered, or edited, in one place only.* \(Single source of truth \(Wikipedia\), https:\/\/en\.wikipedia\.org\/wiki\/Single_source_of_truth\)\n/);
  assert.match(explained, /\n {11}the tool's own choice: a flow that passes on a copy/);
  const m = base();
  m.name = undefined;
  m.systems.crm.entities = {};
  m.flows = [];
  assert.match(toText(reportOf(m)), /\nMap: map\.json\n\n {2}systems {3}2: crm and erp; 0 without a team or a contact\n {2}entities {2}1: customer \(held by erp only, no owner\)\n/);
});

test('json: the whole report, with the basis of each finding only when asked', () => {
  const r = reportOf(badMap());
  const plain = JSON.parse(toJson(r));
  assert.equal(plain.tool, 'system-of-record-check');
  assert.deepEqual(Object.keys(plain), ['tool', 'version', 'input', 'config', 'map', 'findings', 'totals', 'result', 'notes', 'notice']);
  assert.deepEqual(Object.keys(plain.findings[0]), ['rule', 'level', 'file', 'line', 'column', 'at', 'found']);
  assert.equal(plain.findings[0].rule, 'write-back');
  assert.deepEqual(plain.result, { pass: false, errors: 1, byLevel: { error: 1, warning: 2, notice: 0 }, text: 'FAIL - 1 error (and 2 warnings)' });
  assert.equal(plain.config.rules.length, 7);
  assert.deepEqual(plain.map.entities[0].fields[2], { field: 'limit', owner: 'erp', owners: ['erp'], holders: ['crm', 'erp'] });
  const explained = JSON.parse(toJson(r, { explain: true }));
  assert.equal(explained.findings[0].basis[0].url, 'https://en.wikipedia.org/wiki/Single_source_of_truth');
  assert.match(explained.findings[0].own, /^a flow that passes on a copy/);
});

test('github: one workflow command per finding at its level, with the file and line, then a summary line', () => {
  const lines = toGithub(reportOf(badMap())).trimEnd().split('\n');
  assert.equal(lines.length, 4);
  assert.match(lines[0], /^::error file=map\.json,line=\d+,title=system-of-record-check write-back::the flow back writes customer\.name from erp into crm/);
  assert.match(lines[1], /^::warning file=map\.json,line=\d+,title=system-of-record-check /);
  assert.equal(lines[3], 'system-of-record-check: map.json: 3 findings; RESULT: FAIL - 1 error (and 2 warnings)');
  assert.equal(toGithub(reportOf(base())), 'system-of-record-check: map.json: 0 findings; RESULT: PASS - no error\n');
});

test('github: the characters a workflow command gives a meaning to are escaped, so a finding cannot start another command', () => {
  assert.equal(escapeData('a%b\r\nc'), 'a%25b%0D%0Ac');
  assert.equal(escapeProperty('dir/a,b:c.json'), 'dir/a%2Cb%3Ac.json');
  const m = base();
  m.systems.crm.contact = '100% TBD';
  delete m.systems.crm.team;
  m.systems.erp.contact = 'tbd';
  const r = reportOf(m, { emptyValues: { add: ['100% tbd'] } }, { file: 'a,b:c.json' });
  const out = toGithub(r);
  assert.match(out, /^::warning file=a%2Cb%3Ac\.json,line=\d+,title=system-of-record-check system-without-owner::the system crm has no team and no contact \("100%25 TBD" names no one\)/m);
  assert.equal(out.split('\n').filter((l) => l.startsWith('::')).length, 2);
});

test('matrix: a row for every entity and field, a column for every system, O, C and . with a note for shared data with no owner or two', () => {
  const m = base();
  m.systems.shop = { team: 'Digital', contact: 'shop channel', entities: { customer: { fields: ['id', 'limit'], owns: ['limit'] }, cart: ['id'] } };
  m.systems.erp.entities.cart = ['id'];
  const out = toMatrix(reportOf(m));
  assert.equal(out, [
    'system-of-record-check: map.json',
    'ownership matrix: 3 systems, 2 entities, 4 fields; O owner (system of record), C copy, . not held',
    '',
    '                crm  erp  shop',
    'customer        O    C    C',
    'customer.id     O    C    C',
    'customer.name   O    C    .',
    'customer.limit  C    O    O     2 owners',
    'cart            .    C    C     no owner',
    'cart.id         .    C    C     no owner',
    '',
    'findings: 3 (2 error, 1 warning); run without --matrix for the report',
    'RESULT: FAIL - 2 errors (and 1 warning)',
    ''
  ].join('\n'));
});

test('cli: --matrix prints the matrix with the exit code of the check', async () => {
  const r = await run(BAD, ['map.json', '--matrix']);
  assert.equal(r.code, 1);
  assert.match(r.out, /^system-of-record-check: map\.json\nownership matrix: 2 systems, 1 entity, 3 fields;/);
  assert.equal((await run(GOOD, ['map.json', '--matrix'])).code, 0);
});

test('cli: a run reads its inputs and writes nothing to the folder', async () => {
  await withFiles(GOOD, async (dir) => {
    for (const args of [['--format', 'text'], ['--format', 'json'], ['--format', 'github'], ['--matrix']]) assert.equal((await cli(['map.json', ...args], dir)).code, 0);
    assert.deepEqual(await readdir(dir), ['map.json']);
  });
});
