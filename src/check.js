// A run: read the configuration and the map, run the checks, and build the report of the run. An input that cannot be
// read, or a map whose form is wrong, stops the run with an InputError and no result, so a run never passes because a
// part of the map was passed over.

import { analyse } from './analyse.js';
import { ConfigError, defaultConfig, readConfig } from './config.js';
import { LEVELS, NOTICE, POINTS, pointPage } from './data.js';
import { FILE_LIMITS, readTextFile } from './files.js';
import { MapError, formatOf, readMap } from './map.js';
import { RULES, atOrAbove, decide } from './rules.js';
import { grouped, plural } from './size.js';
import { safeText } from './text.js';

export const LIMITS = { ...FILE_LIMITS, maxFindingsPerRule: 500 };
export const MAX_PROBLEMS = 20;

export class InputError extends Error {
  constructor(problems) {
    super(problems.join('; '));
    this.problems = problems;
  }
}

// A copy of a value with every text in it cleaned by safeText, for the parts of the report that come from the input.
export function cleanTexts(value) {
  if (typeof value === 'string') return safeText(value, 300);
  if (Array.isArray(value)) return value.map(cleanTexts);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cleanTexts(v)]));
  return value;
}

// A list of problems for an error message: the first twenty, then a count.
export function capped(problems) {
  return problems.length > MAX_PROBLEMS ? [...problems.slice(0, MAX_PROBLEMS), `and ${grouped(problems.length - MAX_PROBLEMS)} more`] : problems;
}

// The run as a report object, from a map that was read (src/map.js) and the configuration.
export function buildReport({ input, model, config, minSeverity, version, limits = LIMITS }) {
  const { summary, findings: raw } = analyse(model, config);
  const ruleOrder = new Map(RULES.map((r, i) => [r.id, i]));
  const all = [];
  for (const f of raw) {
    const rule = RULES.find((r) => r.id === f.rule);
    const level = config.rules[rule.key];
    if (level === 'off') continue;
    all.push({ rule: f.rule, level, line: f.line ?? null, found: safeText(f.found, 400) });
  }
  all.sort((a, b) => LEVELS.indexOf(b.level) - LEVELS.indexOf(a.level) || (a.line ?? 0) - (b.line ?? 0) || ruleOrder.get(a.rule) - ruleOrder.get(b.rule));
  const shown = all.filter((f) => atOrAbove(f.level, minSeverity));
  const hidden = all.length - shown.length;
  const perRule = new Map();
  const findings = [];
  let cut = 0;
  const file = safeText(input.path);
  for (const f of shown) {
    const n = (perRule.get(f.rule) ?? 0) + 1;
    perRule.set(f.rule, n);
    if (n > limits.maxFindingsPerRule) cut += 1;
    else {
      const rule = RULES.find((r) => r.id === f.rule);
      findings.push({ rule: f.rule, level: f.level, file, line: f.line, column: null, at: f.line ? `${file}:${f.line}` : file, found: f.found, basis: rule.basis.map((k) => ({ text: POINTS[k].text, source: pointPage(k).title, url: pointPage(k).url })), own: rule.own });
    }
  }
  // The result counts every finding at or above the minimum severity, including the ones past the limit of a rule.
  const result = decide(shown);
  const notes = [];
  if (cut) notes.push(`${plural(cut, 'finding')} past the limit of ${grouped(limits.maxFindingsPerRule)} per rule ${cut === 1 ? 'is' : 'are'} counted but not listed`);
  if (hidden) notes.push(`${plural(hidden, 'finding')} below ${minSeverity} ${hidden === 1 ? 'is' : 'are'} not shown`);
  const byLevel = { error: 0, warning: 0, notice: 0 };
  for (const f of shown) byLevel[f.level] += 1;
  return {
    tool: 'system-of-record-check',
    version,
    input: { path: file, format: model.format },
    config: {
      file: config.file === null ? null : safeText(config.file),
      name: config.name === null ? null : safeText(config.name, 120),
      modes: config.modes,
      systemOwner: config.systemOwner,
      minSeverity,
      rules: RULES.map((r) => ({ id: r.id, key: r.key, level: config.rules[r.key], rule: safeText(r.rule(config), 600) }))
    },
    map: cleanTexts(summary),
    findings,
    totals: { findings: shown.length, byLevel, hidden, notListed: cut },
    result,
    notes,
    notice: NOTICE
  };
}

// Reads the configuration and the map and checks them: the report object of the run.
export async function checkPaths({ input, config: configPath = null, minSeverity = null, version = '0.0.0', limits = LIMITS, base = process.cwd() }) {
  let config;
  try {
    if (configPath) {
      const c = await readTextFile(configPath, base, limits.maxConfigBytes);
      config = readConfig(c.text, c.file);
    } else config = defaultConfig();
  } catch (error) {
    if (error instanceof ConfigError) throw new InputError(capped(error.problems));
    throw new InputError([error.message]);
  }
  let model;
  let shown;
  try {
    if (formatOf(input) === null) throw new MapError([`${safeText(input, 200)}: the name must end in .json, .yaml or .yml, which says how the map is written`]);
    const m = await readTextFile(input, base, limits.maxMapBytes);
    shown = m.file;
    model = readMap(m.text, m.file, config);
  } catch (error) {
    if (error instanceof MapError) throw new InputError(capped(error.problems));
    throw new InputError([error.message]);
  }
  return buildReport({ input: { path: shown }, model, config, minSeverity: minSeverity ?? config.minSeverity, version, limits });
}
