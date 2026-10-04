// Command line: system-of-record-check <map-file> [options]

import { readFileSync } from 'node:fs';
import { InputError, LIMITS, checkPaths } from './check.js';
import { defaultsAsConfig } from './config.js';
import { LEVELS } from './data.js';
import { toGithub, toJson, toMatrix, toText } from './report.js';
import { RULES } from './rules.js';
import { safeText } from './text.js';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const FORMATS = { text: toText, json: toJson, github: toGithub };

export const USAGE = `Usage: system-of-record-check <map-file> [options]

Checks an integration map, a JSON file or a YAML file of a plain subset, that lists the systems of an enterprise
(ERP, CRM, HR, finance and the rest), the entities and fields each system holds, which system owns each of them as its
system of record, and the flows of data between the systems. It reports an entity or a field held by several systems
with no owner or with two owners, a flow that writes a field whose owner is not the system the flow comes from (unless
the flow is an approved exception with a reason), a copy that no flow from the owner feeds, a flow that names a system,
an entity or a field the map does not describe, a field synced both ways, and a system with no team or no contact. It
opens no network connection, follows no symbolic link and writes nothing to disk.

Options:
  --config <file>           a configuration file (strict JSON) that changes the modes, the empty values, what a system
                            must name, or the level of the rules (default: the built-in configuration;
                            --print-defaults shows it)
  --format <name>           text, json or github (default: text); github writes workflow commands that GitHub shows
                            as annotations on the map file
  --json                    the same as --format json
  --min-severity <level>    the lowest level of a finding that is shown: ${LEVELS.join(', ')} (default: minSeverity of
                            the configuration, else notice)
  --matrix                  print the ownership matrix in place of the report: entity.field by system, O for the
                            owner, C for a copy
  --explain                 show the rule and the public sources behind each finding
  --print-defaults          print the built-in configuration as a configuration file and exit
  --help                    show this text
  --version                 show the version

Rules: ${RULES.map((r) => `${r.id} (rules.${r.key})`).join(', ')}.

Exit codes: 0 no finding at the level error, 1 a finding at the level error, 2 usage or input error.
`;

const isUrl = (f) => /^[a-z][a-z0-9+.-]*:\/\//i.test(f);

export function parseArgs(argv) {
  const o = { input: null, config: null, format: null, json: false, minSeverity: null, matrix: false, explain: false, printDefaults: false, help: false, version: false };
  const once = (name, current, value) => {
    if (current !== null) throw new Error(`${name} was given twice`);
    return value;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || (v.startsWith('--') && v.length > 2)) throw new Error(`${a} needs a value`);
      if (v === '-') throw new Error('reading from standard input is not supported; give a file');
      i += 1;
      return v;
    };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--version' || a === '-v') o.version = true;
    else if (a === '--explain') o.explain = true;
    else if (a === '--matrix') o.matrix = true;
    else if (a === '--json') o.json = true;
    else if (a === '--print-defaults') o.printDefaults = true;
    else if (a === '--config') o.config = once(a, o.config, next());
    else if (a === '--format') o.format = once(a, o.format, next());
    else if (a === '--min-severity') o.minSeverity = once(a, o.minSeverity, next());
    else if (a === '-') throw new Error('reading from standard input is not supported; give a file');
    else if (a.startsWith('-')) throw new Error(`unknown argument ${a}`);
    else if (o.input !== null) throw new Error(`one map at a time; ${a} is a second one`);
    else o.input = a;
  }
  if (o.json) {
    if (o.format !== null && o.format !== 'json') throw new Error(`--json and --format ${o.format} ask for two formats; give one`);
    o.format = 'json';
  }
  if (o.matrix && o.format !== null && o.format !== 'text') throw new Error('--matrix prints text; give it without --json or --format');
  if (o.matrix && o.explain) throw new Error('--matrix shows no findings to explain; give one of --matrix and --explain');
  if (o.format === null) o.format = 'text';
  if (!o.help && !o.version && !o.printDefaults) {
    if (!o.input) throw new Error('give the integration map to check, a .json, .yaml or .yml file, such as system-of-record-check integration-map.yaml');
    for (const p of [o.input, o.config].filter(Boolean)) if (isUrl(p)) throw new Error('give a local path; the tool never fetches a URL');
    if (!Object.hasOwn(FORMATS, o.format)) throw new Error(`unknown format ${o.format} (text, json or github)`);
    if (o.minSeverity !== null && !LEVELS.includes(o.minSeverity)) throw new Error(`unknown level ${o.minSeverity} (${LEVELS.join(', ')})`);
  }
  return o;
}

const clean = (text) => safeText(text, 1500);

// Exit code: 0 no finding at the level error, 1 a finding at the level error, 2 usage or input error.
export async function main(argv, io = { out: (t) => process.stdout.write(t), err: (t) => process.stderr.write(t) }, limits = undefined, base = process.cwd()) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (error) {
    io.err(`system-of-record-check: ${clean(error.message)}\n\n${USAGE}`);
    return 2;
  }
  if (o.help) {
    io.out(USAGE);
    return 0;
  }
  if (o.version) {
    io.out(`${VERSION}\n`);
    return 0;
  }
  if (o.printDefaults) {
    io.out(`${JSON.stringify(defaultsAsConfig(), null, 2)}\n`);
    return 0;
  }
  let report;
  try {
    report = await checkPaths({ input: o.input, config: o.config, minSeverity: o.minSeverity, version: VERSION, limits: { ...LIMITS, ...(limits ?? {}) }, base });
  } catch (error) {
    if (error instanceof InputError) io.err(`system-of-record-check: no result, the input has ${error.problems.length === 1 ? 'a problem' : 'problems'}:\n${error.problems.map((p) => `  ${clean(p)}`).join('\n')}\n`);
    else io.err(`system-of-record-check: ${clean(error.message)}\n`);
    return 2;
  }
  io.out(o.matrix ? toMatrix(report) : FORMATS[o.format](report, { explain: o.explain }));
  return report.result.pass ? 0 : 1;
}
