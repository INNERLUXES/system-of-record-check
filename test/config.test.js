import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG_LIMITS, ConfigError, DEFAULT_MODES, DEFAULT_RULES, KEYS, RULES, defaultConfig, defaultsAsConfig, distance, isObject, kindOf, readConfig, suggestion, validateConfig } from '../src/index.js';

// The configuration file: every key with a good value and a bad one, the list forms, and the errors with their lines.

const problemsOf = (text) => {
  try {
    readConfig(text, 'c.json');
  } catch (error) {
    assert.ok(error instanceof ConfigError, error.message);
    return error.problems;
  }
  assert.fail(`not refused: ${text}`);
};

test('config: the defaults, and the defaults written as a file read back to the same configuration', () => {
  const d = defaultConfig();
  assert.deepEqual(d.modes, DEFAULT_MODES);
  assert.deepEqual(d.systemOwner, ['team', 'contact']);
  assert.equal(d.minSeverity, 'notice');
  assert.deepEqual(Object.keys(d.rules), RULES.map((r) => r.key));
  assert.deepEqual(Object.keys(DEFAULT_RULES), RULES.map((r) => r.key));
  const back = readConfig(JSON.stringify(defaultsAsConfig()), 'd.json');
  assert.deepEqual({ ...back, file: null, name: null }, d);
  assert.equal(back.name, 'built-in defaults');
});

test('config: a list as an array replaces, and an object adds, removes or replaces, in that order', () => {
  assert.deepEqual(readConfig('{"modes": ["api", "SFTP "]}', 'c.json').modes, ['api', 'sftp']);
  assert.deepEqual(readConfig('{"modes": {"add": ["sftp"], "remove": ["manual"]}}', 'c.json').modes, ['api', 'batch', 'event', 'file', 'cdc', 'etl', 'sftp']);
  assert.deepEqual(readConfig('{"modes": {"replace": ["api"], "add": ["queue"]}}', 'c.json').modes, ['api', 'queue']);
  assert.ok(readConfig('{"emptyValues": {"add": ["Ask Dana"]}}', 'c.json').emptyValues.includes('ask dana'));
  assert.deepEqual(readConfig('{"systemOwner": {"remove": ["contact"]}}', 'c.json').systemOwner, ['team']);
  assert.deepEqual(readConfig('{"systemOwner": []}', 'c.json').systemOwner, []);
  assert.equal(readConfig('{"rules": {"writeBack": "warning"}, "minSeverity": "warning"}', 'c.json').rules.writeBack, 'warning');
});

test('config: every unknown key is an error with its line and a suggestion', () => {
  const p = problemsOf('{\n  "mods": [],\n  "rules": {\n    "writeBak": "off"\n  },\n  "systemOwner": {"ad": ["team"]}\n}');
  assert.deepEqual(p, [
    'c.json: line 2: "mods" is not a key of the configuration; did you mean "modes"?',
    'c.json: line 4: "writeBak" is not a key of rules; did you mean "writeBack"?',
    'c.json: line 6: "ad" is not a key of systemOwner (replace, add, remove); did you mean "add"?'
  ]);
  assert.match(problemsOf('{"zzzzzz": 1}')[0], /"zzzzzz" is not a key of the configuration$/, 'no suggestion when nothing is close');
});

test('config: wrong values are errors: types, levels, modes, owner keys, empty entries, repeats, and entries that are or are not on a list', () => {
  for (const [text, pattern] of [
    ['[]', /the configuration must be a JSON object, not a list/],
    ['{"name": 3}', /name must be a text of 1 to 120 characters/],
    ['{"minSeverity": "fatal"}', /minSeverity must be one of notice, warning, error/],
    ['{"rules": {"writeBack": "loud"}}', /rules.writeBack must be one of notice, warning, error, off, not "loud"/],
    ['{"rules": {"writeBack": {"level": "off"}}}', /rules.writeBack must be one of .*, not an object/],
    ['{"rules": []}', /rules must be an object, not a list/],
    ['{"modes": "api"}', /modes must be a list or an object with replace, add or remove, not a string/],
    ['{"modes": [3]}', /modes\[0\] must be a text, not a number/],
    ['{"modes": [""]}', /modes\[0\] must hold 1 to 120 characters/],
    ['{"modes": ["two words"]}', /modes\[0\]: "two words" is not a mode: a letter a to z followed by letters, digits and dashes/],
    ['{"modes": ["api", "API"]}', /modes names "api" twice/],
    ['{"modes": []}', /modes has no mode left/],
    ['{"modes": {"add": ["api"]}}', /modes.add names "api", which is already on the list/],
    ['{"modes": {"remove": ["queue"]}}', /modes.remove names "queue", which is not on the list/],
    ['{"modes": {"add": "x"}}', /modes.add must be a list, not a string/],
    ['{"emptyValues": ["--"]}', /emptyValues\[0\] holds no letter or digit/],
    ['{"systemOwner": ["owner"]}', /systemOwner\[0\]: "owner" is not one of team, contact/],
    [`{"emptyValues": [${Array(CONFIG_LIMITS.maxEntries + 1).fill('"x"').join(',')}]}`, /holds more than 500 entries/],
    [`{"emptyValues": ["${'x'.repeat(121)}"]}`, /must hold 1 to 120 characters/]
  ]) assert.match(problemsOf(text).join('\n'), pattern, text.slice(0, 80));
});

test('config: JSON that is not valid, and a key named twice, are refused with the line and column', () => {
  assert.deepEqual(problemsOf('{"name": "a",}'), ['c.json: line 1, column 14: a comma before the closing brace; JSON has no trailing comma']);
  assert.match(problemsOf('{\n "rules": {},\n "rules": {}\n}')[0], /^c\.json: line 3, column 2: the name "rules" appears twice in one object/);
});

test('config: every problem of a file is listed at once, and __proto__ stays a key the configuration does not know', () => {
  const p = problemsOf('{"name": "", "minSeverity": 1, "__proto__": {"x": 1}}');
  assert.equal(p.length, 3);
  assert.equal({}.x, undefined);
  assert.throws(() => validateConfig('x'), /must be a JSON object, not a string/);
});

test('config: the keys of the file, and the small helpers', () => {
  assert.deepEqual(Object.keys(KEYS), ['name', 'modes', 'emptyValues', 'systemOwner', 'rules', 'minSeverity']);
  assert.deepEqual(Object.keys(KEYS.rules), Object.keys(DEFAULT_RULES));
  assert.equal(distance('modes', 'mdoes'), 1);
  assert.equal(distance('name', 'nmae'), 1);
  assert.equal(distance('kitten', 'sitting'), 3);
  assert.equal(distance('', 'abc'), 3);
  assert.equal(suggestion('tem', ['team', 'contact']), '; did you mean "team"?');
  assert.equal(suggestion('x'.repeat(4000), ['team']), '', 'a long name is not compared');
  assert.equal(kindOf(null), 'null');
  assert.equal(kindOf([]), 'a list');
  assert.equal(kindOf({}), 'an object');
  assert.equal(kindOf(1), 'a number');
  assert.equal(isObject([]), false);
  assert.equal(isObject({}), true);
});
