import { test } from 'node:test';
import assert from 'node:assert/strict';
import { YamlError, parseJson, parseYaml, stripComment } from '../src/index.js';
import { base, jsonOf } from './helpers.js';

// The YAML subset: what is read, the lines it keeps, and every form it refuses with its line.

const fails = (text, pattern, line) => assert.throws(() => parseYaml(text), (e) => e instanceof YamlError && pattern.test(e.reason) && (line === undefined || e.line === line), text.slice(0, 60));

// The map of base() written in YAML by hand, the way a team writes one.
const BASE_YAML = `# A test map
name: Test map
systems:
  crm:
    name: CRM
    kind: crm
    team: Sales
    contact: sales channel
    entities:
      customer:
        fields: [id, name, limit]
        owns: true
  erp:
    name: ERP
    kind: erp
    team: Finance
    contact: finance channel
    entities:
      customer:
        fields:
          - id
          - name
          - limit
        owns: [limit]
flows:
  - id: down
    source: crm
    target: erp
    entity: customer
    fields: [id, name]
    mode: api
  -
    id: up
    source: erp
    target: crm
    entity: customer
    fields: ["limit"]
    mode: 'batch'
`;

test('yaml: a map written in YAML reads to the same value as the same map in JSON', () => {
  assert.deepEqual(parseYaml(BASE_YAML).value, parseJson(jsonOf(base())).value);
});

test('yaml: the line of every key and list entry is kept under its path, as the JSON reader keeps it', () => {
  const { lines } = parseYaml(BASE_YAML);
  const lineOfText = (needle) => BASE_YAML.split('\n').findIndex((l) => l.includes(needle)) + 1;
  assert.equal(lines.get('systems.crm'), lineOfText('crm:'));
  assert.equal(lines.get('systems.erp.entities.customer.fields[1]'), lineOfText('- name'));
  assert.equal(lines.get('systems.crm.entities.customer.fields[2]'), lineOfText('fields: [id, name, limit]'));
  assert.equal(lines.get('flows[0]'), lineOfText('- id: down'));
  assert.equal(lines.get('flows[1]'), BASE_YAML.split('\n').indexOf('  -') + 1);
  assert.equal(lines.get('flows[1].id'), lineOfText('id: up'));
  assert.equal(lines.get(''), 2);
});

test('yaml: scalars: quotes, escapes, numbers, booleans, null, an empty list and an empty mapping', () => {
  const { value } = parseYaml([
    'a: "x\\ty\\u0041\\"#"',
    "b: 'it''s # not a comment'",
    'c: 12',
    'd: -1.5',
    'e: true',
    'f: False',
    'g: ~',
    'h:',
    'i: []',
    'j: {}',
    "k: don't",
    'l: a#b',
    'm: [ "a, b" , c ]',
    'n: 99999999999999999999',
    'o: http://example.test/x # a comment'
  ].join('\n'));
  assert.deepEqual(value, { a: 'x\tyA"#', b: "it's # not a comment", c: 12, d: -1.5, e: true, f: false, g: null, h: null, i: [], j: {}, k: "don't", l: 'a#b', m: ['a, b', 'c'], n: '99999999999999999999', o: 'http://example.test/x' });
});

test('yaml: a first --- is allowed, a byte order mark is skipped, CRLF and CR end lines, and a list may sit under its key', () => {
  assert.deepEqual(parseYaml('\ufeff---\r\na:\r\n- x\r\n- y\r\nb: 1').value, { a: ['x', 'y'], b: 1 });
  assert.deepEqual(parseYaml('a:\r  - - x\r    - y').value, { a: [['x', 'y']] });
  assert.deepEqual(parseYaml('- a: 1\n  b: 2\n- c').value, [{ a: 1, b: 2 }, 'c']);
  assert.equal(parseYaml('just text').value, 'just text');
});

test('yaml: a key named twice in one mapping is refused, because YAML keys must be unique', () => {
  fails('a: 1\nb: 2\na: 3', /the key "a" appears twice in one mapping/, 3);
  assert.deepEqual(parseYaml('x:\n  a: 1\ny:\n  a: 2').value, { x: { a: 1 }, y: { a: 2 } }, 'the same key in two mappings is fine');
});

test('yaml: a name such as __proto__ becomes an ordinary key and changes no prototype', () => {
  const { value } = parseYaml('__proto__:\n  polluted: true\nconstructor: 1');
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.equal({}.polluted, undefined);
  assert.deepEqual(Object.keys(value), ['__proto__', 'constructor']);
});

for (const [name, text, pattern, line] of [
  ['a tab in the indentation', 'a:\n\tb: 1', /a tab in the indentation/, 2],
  ['an anchor', 'a: &x 1', /starts with "&"/, 1],
  ['an alias', 'a: *x', /starts with "\*"/, 1],
  ['a tag', 'a: !!str 1', /starts with "!"/, 1],
  ['a block scalar', 'a: |\n  text', /starts with "\|"/, 1],
  ['a folded scalar', 'a: >\n  text', /starts with ">"/, 1],
  ['a mapping in braces', 'a: {b: 1}', /starts with "\{"/, 1],
  ['a complex key', '? a\n: b', /starts with "\?"/, 1],
  ['a value that runs on', 'a: one\n  two', /cannot run on over several lines/, 2],
  ['a list entry that runs on', '- one\n  two', /cannot run on over several lines/, 2],
  ['a value with a colon and a space', 'a: b: c', /holds ": "; put the value in quotes/, 1],
  ['a quote that is not closed', 'a: "b', /not closed on its line/, 1],
  ['text after a quoted value', 'a: "b" c', /text after a quoted value/, 1],
  ['an escape it does not read', 'a: "\\q"', /escape \\q/, 1],
  ['a short unicode escape', 'a: "\\u12"', /four hexadecimal digits/, 1],
  ['a list in brackets not closed', 'a: [b, c', /not closed on its line/, 1],
  ['an empty entry in brackets', 'a: [b, , c]', /an empty entry/, 1],
  ['a list in brackets inside another', 'a: [[b]]', /inside another/, 1],
  ['a second document', 'a: 1\n---\nb: 2', /a second document/, 2],
  ['a directive', '%YAML 1.2\na: 1', /a directive/, 1],
  ['a line that is not a key', 'a: 1\nb', /neither a key with a colon nor a list entry/, 2],
  ['a list entry among keys', 'a: 1\n- b', /a list entry where a key was expected/, 2],
  ['indentation out of place', 'a:\n    b: 1\n  c: 2', /indented more than the lines before it|indented less/, 3],
  ['a colon with no key', ': b', /a colon with no key/, 1],
  ['an empty file', '# only a comment\n', /holds no value/, 1]
]) {
  test(`yaml: ${name} is refused with its line`, () => fails(text, pattern, line));
}

test('yaml: a comment starts at a # after a space or at the start, outside quotes', () => {
  assert.equal(stripComment('a: b # c'), 'a: b ');
  assert.equal(stripComment('# c'), '');
  assert.equal(stripComment('a: "b # c" # d'), 'a: "b # c" ');
  assert.equal(stripComment("a: 'b '' # c'"), "a: 'b '' # c'");
  assert.equal(stripComment('a: b#c'), 'a: b#c');
});

test('yaml: values nested very deep, very many values, a very long value and very many lines are refused at their limits', () => {
  fails(Array.from({ length: 40 }, (_, i) => `${' '.repeat(i * 2)}k${i}:`).join('\n'), /nested more than 32 deep/);
  fails(`a: ${'x'.repeat(5000)}`, /longer than 4096 characters/, 1);
  fails(`a: "${'x'.repeat(5000)}"`, /longer than 4096 characters/, 1);
  assert.throws(() => parseYaml(`a: [${'1,'.repeat(200)}1]`, { maxValues: 100 }), /more than 100 values/);
  assert.throws(() => parseYaml('a: 1\nb: 2\nc: 3', { maxLines: 2 }), /holds 3 lines, more than the 2 read/);
});
