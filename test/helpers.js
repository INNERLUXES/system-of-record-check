// Shared test helpers: maps and configurations built inline, checked in memory or written into a temporary folder that
// is removed after the test. Paths are built with resolve() from forward-slash names, so the same test runs on Linux,
// macOS and Windows. The line a test expects is found with lineOf(), which counts lines the way the tool does, so a
// test never holds a line number worked out by hand for one system only. No test reads the clock, the time zone or the
// locale.

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { buildReport, defaultConfig, lineStarts, main, positionOf, readConfig, readMap } from '../src/index.js';

export async function withFiles(files, fn) {
  const dir = await mkdtemp(resolve(tmpdir(), 'system-of-record-check-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(dirname(resolve(dir, rel)), { recursive: true });
      await writeFile(resolve(dir, rel), content);
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function offsetOf(text, needle, n) {
  let at = -1;
  for (let i = 0; i < n; i += 1) {
    at = text.indexOf(needle, at + 1);
    if (at < 0) throw new Error(`${needle} is not in the text ${n} times`);
  }
  return at;
}

// The line (from 1) of the n-th place where needle starts in text.
export const lineOf = (text, needle, n = 1) => positionOf(lineStarts(text), offsetOf(text, needle, n)).line;

// The configuration of a configuration object, through the real reader, or the defaults.
export const configOf = (object) => (object ? readConfig(JSON.stringify(object), 'config.json') : defaultConfig());

// A small map that passes every check: a CRM that owns the customer, an ERP that owns its credit limit and holds a fed
// copy of the rest, and a flow each way that feeds every copy from its owner. Each call gives a new object, so a test
// can change it freely.
export function base() {
  return {
    name: 'Test map',
    systems: {
      crm: { name: 'CRM', kind: 'crm', team: 'Sales', contact: 'sales channel', entities: { customer: { fields: ['id', 'name', 'limit'], owns: true } } },
      erp: { name: 'ERP', kind: 'erp', team: 'Finance', contact: 'finance channel', entities: { customer: { fields: ['id', 'name', 'limit'], owns: ['limit'] } } }
    },
    flows: [
      { id: 'down', source: 'crm', target: 'erp', entity: 'customer', fields: ['id', 'name'], mode: 'api' },
      { id: 'up', source: 'erp', target: 'crm', entity: 'customer', fields: ['limit'], mode: 'batch' }
    ]
  };
}

// The text of a map object as the tests write it: JSON with two spaces, one key or entry per line.
export const jsonOf = (map) => `${JSON.stringify(map, null, 2)}\n`;

// The report object of a map, checked in memory: a map object (written as JSON) or a text with its file name, with a
// configuration object or none.
export function reportOf(map, config = null, { minSeverity = 'notice', file = 'map.json' } = {}) {
  const text = typeof map === 'string' ? map : jsonOf(map);
  const cfg = configOf(config);
  const model = readMap(text, file, cfg);
  return buildReport({ input: { path: file }, model, config: cfg, minSeverity, version: 'test' });
}

// The findings of a report, of one rule or of all.
export const findingsOf = (r, rule) => r.findings.filter((f) => !rule || f.rule === rule);

// The rule ids of the findings of a report, in order.
export const rulesOf = (r) => r.findings.map((f) => f.rule);

// Writes the files and runs the command line with these arguments (paths relative to the folder).
export async function run(files, args = [], limits) {
  return withFiles(files, async (dir) => {
    let out = '';
    let err = '';
    const code = await main(args, { out: (t) => { out += t; }, err: (t) => { err += t; } }, limits, dir);
    return { code, out, err, dir };
  });
}

// Runs the command line with exactly these arguments, in a folder.
export async function cli(argv, dir) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, dir);
  return { code, out, err };
}
