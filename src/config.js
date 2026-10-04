// The configuration file: a strict JSON object that changes the built-in configuration key by key. A list is either a
// JSON array, which replaces the built-in list, or an object with "replace", "add" and "remove". Every key the tool does
// not know is an error with its line and a suggestion, so a typo cannot leave a default in place unnoticed; the JSON
// reader refuses a name given twice in one object.

import { LEVELS } from './data.js';
import { DEFAULT_EMPTY_VALUES, DEFAULT_MIN_SEVERITY, DEFAULT_MODES, DEFAULT_RULES, DEFAULT_SYSTEM_OWNER, SYSTEM_OWNER_KEYS } from './defaults.js';
import { JsonError, jsonProblem, parseJson } from './json.js';
import { asciiLower, normalizePhrase } from './words.js';

export const CONFIG_LIMITS = { maxEntries: 500, maxEntryLength: 120 };

// Every key of the configuration file, with the kind of its value. docs/inputs.md describes each of them.
export const KEYS = {
  name: 'text',
  modes: 'list of mode words',
  emptyValues: 'list of phrases',
  systemOwner: 'list of team and contact',
  rules: Object.fromEntries(Object.keys(DEFAULT_RULES).map((k) => [k, 'level or off'])),
  minSeverity: 'level'
};

const LIST_OPS = ['replace', 'add', 'remove'];
const MODE = /^[a-z][a-z0-9-]*$/;

export class ConfigError extends Error {
  constructor(problems) {
    super(problems.join('; '));
    this.problems = problems;
  }
}

// The edit distance of two short names, for a suggestion: an insertion, a deletion, a change or two neighbours swapped
// ("nmae" for "name") each count one.
export function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// The closest of the known names, when it is close enough to be a typo: "; did you mean ...?" or nothing. A name longer
// than any known name by more than a few characters is not compared.
export function suggestion(name, known) {
  let best = null;
  for (const k of known) {
    if (Math.abs(name.length - k.length) > 3) continue;
    const d = distance(asciiLower(name), asciiLower(k));
    if (d <= Math.max(1, Math.floor(k.length / 3)) && (!best || d < best.d)) best = { k, d };
  }
  return best ? `; did you mean "${best.k}"?` : '';
}

export function kindOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  if (typeof value === 'object') return 'an object';
  return `a ${typeof value}`;
}

export const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// The built-in configuration, as the checks use it.
export function defaultConfig() {
  return {
    file: null,
    name: null,
    modes: [...DEFAULT_MODES],
    emptyValues: DEFAULT_EMPTY_VALUES.map(normalizePhrase),
    systemOwner: [...DEFAULT_SYSTEM_OWNER],
    rules: { ...DEFAULT_RULES },
    minSeverity: DEFAULT_MIN_SEVERITY
  };
}

// The built-in configuration written as a configuration file, for --print-defaults. Read back, it gives the defaults.
export function defaultsAsConfig() {
  const d = defaultConfig();
  return { name: 'built-in defaults', modes: d.modes, emptyValues: d.emptyValues, systemOwner: d.systemOwner, rules: d.rules, minSeverity: d.minSeverity };
}

// Checks a parsed configuration and builds the configuration the checks use, or throws ConfigError with every problem.
export function validateConfig(value, lines = new Map(), file = 'config') {
  const problems = [];
  const lineOf = (path) => {
    if (lines.has(path)) return lines.get(path);
    for (let p = path, prev = null; p && p !== prev; prev = p, p = p.replace(/(?:\.[A-Za-z]+|\[\d+\])$/, '')) if (lines.has(p)) return lines.get(p);
    return 1;
  };
  const fail = (path, message) => problems.push({ line: lineOf(path), text: `${file}: line ${lineOf(path)}: ${message}` });
  const refuse = (path, message, result) => {
    fail(path, message);
    return result;
  };
  const config = defaultConfig();
  config.file = file;
  if (!isObject(value)) throw new ConfigError([`${file}: line 1: the configuration must be a JSON object, not ${kindOf(value)}`]);

  // One entry of a list: a string of 1 to 120 characters, kept in its compared form, or null with a problem.
  const entryOf = (path, e, normalize, hint) => {
    if (typeof e !== 'string') return refuse(path, `${path} must be a text, not ${kindOf(e)}`, null);
    if (e.length === 0 || e.length > CONFIG_LIMITS.maxEntryLength) return refuse(path, `${path} must hold 1 to ${CONFIG_LIMITS.maxEntryLength} characters`, null);
    const n = normalize(e);
    if (n === null) return refuse(path, `${path}: "${e.slice(0, 60)}" is not ${hint}`, null);
    if (!n) return refuse(path, `${path} holds no letter or digit`, null);
    return n;
  };
  const entriesOf = (path, list, normalize, hint) => {
    if (!Array.isArray(list)) return refuse(path, `${path} must be a list, not ${kindOf(list)}`, []);
    if (list.length > CONFIG_LIMITS.maxEntries) return refuse(path, `${path} holds more than ${CONFIG_LIMITS.maxEntries} entries`, []);
    const out = [];
    list.forEach((e, i) => {
      const n = entryOf(`${path}[${i}]`, e, normalize, hint);
      if (n === null) return;
      if (out.includes(n)) fail(`${path}[${i}]`, `${path} names "${n}" twice`);
      else out.push(n);
    });
    return out;
  };
  // A list value: an array that replaces the list, or { replace, add, remove } applied to it in that order.
  const listOf = (path, v, base, normalize, hint = 'a valid entry') => {
    if (Array.isArray(v)) return entriesOf(path, v, normalize, hint);
    if (!isObject(v)) return refuse(path, `${path} must be a list or an object with replace, add or remove, not ${kindOf(v)}`, base);
    for (const k of Object.keys(v)) if (!LIST_OPS.includes(k)) fail(`${path}.${k}`, `"${k.slice(0, 60)}" is not a key of ${path} (replace, add, remove)${suggestion(k, LIST_OPS)}`);
    let out = Object.hasOwn(v, 'replace') ? entriesOf(`${path}.replace`, v.replace, normalize, hint) : [...base];
    if (Object.hasOwn(v, 'remove')) {
      for (const [i, n] of entriesOf(`${path}.remove`, v.remove, normalize, hint).entries()) {
        if (!out.includes(n)) fail(`${path}.remove[${i}]`, `${path}.remove names "${n}", which is not on the list`);
        out = out.filter((x) => x !== n);
      }
    }
    if (Object.hasOwn(v, 'add')) {
      for (const [i, n] of entriesOf(`${path}.add`, v.add, normalize, hint).entries()) {
        if (out.includes(n)) fail(`${path}.add[${i}]`, `${path}.add names "${n}", which is already on the list`);
        else out.push(n);
      }
    }
    if (out.length > CONFIG_LIMITS.maxEntries) fail(path, `${path} holds more than ${CONFIG_LIMITS.maxEntries} entries`);
    return out;
  };

  const top = Object.keys(KEYS);
  for (const k of Object.keys(value)) if (!top.includes(k)) fail(k, `"${k.slice(0, 60)}" is not a key of the configuration${suggestion(k, top)}`);

  if (Object.hasOwn(value, 'name')) {
    if (typeof value.name !== 'string' || value.name.length === 0 || value.name.length > CONFIG_LIMITS.maxEntryLength) fail('name', `name must be a text of 1 to ${CONFIG_LIMITS.maxEntryLength} characters`);
    else config.name = value.name;
  }
  if (Object.hasOwn(value, 'modes')) {
    config.modes = listOf('modes', value.modes, config.modes, (e) => {
      const m = asciiLower(e.trim());
      return MODE.test(m) ? m : null;
    }, 'a mode: a letter a to z followed by letters, digits and dashes');
    if (!config.modes.length) fail('modes', 'modes has no mode left, so no flow could name one');
  }
  if (Object.hasOwn(value, 'emptyValues')) config.emptyValues = listOf('emptyValues', value.emptyValues, config.emptyValues, normalizePhrase);
  if (Object.hasOwn(value, 'systemOwner')) {
    config.systemOwner = listOf('systemOwner', value.systemOwner, config.systemOwner, (e) => {
      const k = e.trim();
      return SYSTEM_OWNER_KEYS.includes(k) ? k : null;
    }, `one of ${SYSTEM_OWNER_KEYS.join(', ')}`);
  }
  if (Object.hasOwn(value, 'rules')) {
    const v = value.rules;
    const keys = Object.keys(DEFAULT_RULES);
    if (!isObject(v)) fail('rules', `rules must be an object, not ${kindOf(v)}`);
    else {
      for (const k of Object.keys(v)) {
        const path = `rules.${k}`;
        if (!keys.includes(k)) fail(path, `"${k.slice(0, 60)}" is not a key of rules${suggestion(k, keys)}`);
        else if (typeof v[k] !== 'string' || ![...LEVELS, 'off'].includes(v[k])) fail(path, `${path} must be one of ${[...LEVELS, 'off'].join(', ')}, not ${typeof v[k] === 'string' ? `"${v[k].slice(0, 40)}"` : kindOf(v[k])}`);
        else config.rules[k] = v[k];
      }
    }
  }
  if (Object.hasOwn(value, 'minSeverity')) {
    if (!LEVELS.includes(value.minSeverity)) fail('minSeverity', `minSeverity must be one of ${LEVELS.join(', ')}`);
    else config.minSeverity = value.minSeverity;
  }
  // The problems in the order of their lines, so the list reads like the file.
  if (problems.length) throw new ConfigError(problems.sort((a, b) => a.line - b.line).map((p) => p.text));
  return config;
}

// Reads the text of a configuration file.
export function readConfig(text, file) {
  let parsed;
  try {
    parsed = parseJson(text, { linesUpTo: 3 });
  } catch (error) {
    if (error instanceof JsonError) throw new ConfigError([`${file}: ${jsonProblem(error, text)}`]);
    throw error;
  }
  return validateConfig(parsed.value, parsed.lines, file);
}
