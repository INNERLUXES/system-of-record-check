// The reports: text for a terminal, JSON for other tools, GitHub workflow commands that turn each finding into an
// annotation on the map file and line, and the ownership matrix. Every text from the map (a name, a team, a reason) was
// cleaned by safeText before it reached the report object. The GitHub commands also escape the characters a command
// gives a meaning to, so a name in the map cannot end a command early or start another one.

import { grouped, listText, plural } from './size.js';
import { safeText } from './text.js';

const clean = (t, max = 200) => safeText(t, max);

function configLine(r) {
  const c = r.config;
  const where = c.file ? `${c.file}${c.name ? ` (${clean(c.name, 120)})` : ''}` : 'built-in defaults';
  const owner = c.systemOwner.length ? `systems name a ${c.systemOwner.join(' and a ')}` : 'systems need no team or contact';
  return `${where}: modes ${c.modes.join(', ')}; ${owner}; minimum severity ${c.minSeverity}`;
}

function inputLine(r) {
  const n = r.map.counts;
  return `${r.input.path} (${r.input.format}; ${plural(n.systems, 'system')}, ${plural(n.entities, 'entity', 'entities')}, ${plural(n.fields, 'field')}, ${plural(n.flows, 'flow')})`;
}

const rulesLine = (r) => r.config.rules.map((x) => `${x.id} (${x.level})`).join('; ');

function findingsLine(r) {
  const b = r.totals.byLevel;
  const parts = ['error', 'warning', 'notice'].filter((l) => b[l]).map((l) => `${grouped(b[l])} ${l}`);
  return `${grouped(r.totals.findings)}${parts.length ? ` (${parts.join(', ')})` : ''}${r.totals.hidden ? `; ${grouped(r.totals.hidden)} below ${r.config.minSeverity} not shown` : ''}`;
}

// How the ownership of an entity reads in a sentence.
function ownerText(e) {
  if (e.claims.length >= 2) return `${e.claims.length} owners`;
  if (e.owner) return `owner ${e.owner}`;
  return e.holders.length >= 2 ? 'no owner' : `held by ${e.holders[0]} only, no owner`;
}

// The lines that say what the map holds.
function mapLines(r) {
  const m = r.map;
  const n = m.counts;
  const rows = [];
  rows.push(['systems', `${grouped(n.systems)}: ${listText(m.systems.map((s) => s.id), 8)}; ${grouped(n.systemsWithoutOwner)} without a ${r.config.systemOwner.join(' or a ') || 'team or a contact'}`]);
  rows.push(['entities', n.entities ? `${grouped(n.entities)}: ${listText(m.entities.map((e) => `${e.entity} (${ownerText(e)})`), 6)}` : '0']);
  const s = n.shared;
  rows.push(['fields', `${grouped(n.fields)} held, ${grouped(s.all)} held by two or more systems: ${grouped(s.owned)} with one owner, ${grouped(s.unowned)} with no owner, ${grouped(s.conflicting)} with two owners or more`]);
  const modes = Object.entries(n.modes).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([k, v]) => `${grouped(v)} ${k}`);
  rows.push(['flows', `${grouped(n.flows)}${modes.length ? `: ${listText(modes, 8)}` : ''}; ${grouped(n.twoWay)} two-way; ${plural(n.approved, 'approved exception')}`]);
  const width = Math.max(...rows.map((x) => x[0].length));
  return rows.map(([k, v]) => `  ${k.padEnd(width)}  ${v}`);
}

export function toText(r, { explain = false } = {}) {
  const out = [];
  out.push(`system-of-record-check: ${r.input.path}`);
  out.push(`input: ${inputLine(r)}`);
  out.push(`config: ${configLine(r)}`);
  out.push(`rules: ${rulesLine(r)}`);
  out.push(`findings: ${findingsLine(r)}`);
  out.push('', `Findings (${grouped(r.findings.length)})`, '');
  if (!r.findings.length) out.push('  none', '');
  const width = Math.max(...r.config.rules.map((x) => x.id.length));
  const pad = ' '.repeat(11);
  for (const f of r.findings) {
    out.push(`  ${f.level.toUpperCase().padEnd(8)} ${f.rule.padEnd(width)}  ${f.at}`);
    out.push(`${pad}${f.found}`);
    if (explain) {
      out.push(`${pad}rule: ${r.config.rules.find((x) => x.id === f.rule).rule}`);
      for (const b of f.basis) out.push(`${pad}basis: ${b.text} (${b.source}, ${b.url})`);
      if (f.own) out.push(`${pad}the tool's own choice: ${f.own}`);
    }
    out.push('');
  }
  out.push(`Map: ${r.input.path}${r.map.name ? ` ("${clean(r.map.name, 100)}")` : ''}`, '');
  out.push(...mapLines(r), '');
  for (const n of r.notes) out.push(`note: ${n}`);
  if (r.notes.length) out.push('');
  out.push(r.notice, '');
  out.push(`RESULT: ${r.result.text}`);
  return `${out.join('\n')}\n`;
}

export function toJson(r, { explain = false } = {}) {
  const out = { ...r, findings: r.findings.map((f) => (explain ? f : { ...f, basis: undefined, own: undefined })) };
  return `${JSON.stringify(out, null, 2)}\n`;
}

// The message of a workflow command: %, CR and LF escaped.
export const escapeData = (t) => String(t).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

// A property of a workflow command: also : and , escaped.
export const escapeProperty = (t) => escapeData(t).replace(/:/g, '%3A').replace(/,/g, '%2C');

const COMMANDS = { error: 'error', warning: 'warning', notice: 'notice' };

export function toGithub(r) {
  const out = [];
  for (const f of r.findings) {
    const props = [`file=${escapeProperty(f.file)}`];
    if (f.line) props.push(`line=${f.line}`);
    props.push(`title=${escapeProperty(`system-of-record-check ${f.rule}`)}`);
    out.push(`::${COMMANDS[f.level]} ${props.join(',')}::${escapeData(f.found)}`);
  }
  out.push(`system-of-record-check: ${r.input.path}: ${grouped(r.totals.findings)} ${r.totals.findings === 1 ? 'finding' : 'findings'}; RESULT: ${r.result.text}`);
  return `${out.join('\n')}\n`;
}

// The ownership matrix: a row for every entity and every field of it, a column for every system, O for the owner, C
// for a copy held by a system that does not own it, and . for a system that does not hold it. A note at the end of a row
// says when shared data has no owner or more than one.
export function toMatrix(r) {
  const m = r.map;
  const ids = m.systems.map((s) => s.id);
  const rows = [];
  const note = (owners, holders) => (owners.length >= 2 ? `${owners.length} owners` : !owners.length && holders.length >= 2 ? 'no owner' : '');
  for (const e of m.entities) {
    rows.push({ name: e.entity, cells: ids.map((id) => (e.claims.includes(id) ? 'O' : e.holders.includes(id) ? 'C' : '.')), note: note(e.claims, e.holders) });
    for (const f of e.fields) rows.push({ name: `${e.entity}.${f.field}`, cells: ids.map((id) => (f.owners.includes(id) ? 'O' : f.holders.includes(id) ? 'C' : '.')), note: note(f.owners, f.holders) });
  }
  const first = Math.max(6, ...rows.map((x) => x.name.length));
  const widths = ids.map((id) => id.length);
  const line = (name, cells, extra) => `${name.padEnd(first)}  ${cells.map((c, i) => c.padEnd(widths[i])).join('  ')}${extra ? `  ${extra}` : ''}`.trimEnd();
  const out = [];
  out.push(`system-of-record-check: ${r.input.path}`);
  out.push(`ownership matrix: ${plural(ids.length, 'system')}, ${plural(m.counts.entities, 'entity', 'entities')}, ${plural(m.counts.fields, 'field')}; O owner (system of record), C copy, . not held`);
  out.push('');
  out.push(line('', ids, ''));
  for (const row of rows) out.push(line(row.name, row.cells, row.note));
  if (!rows.length) out.push('  no entity');
  out.push('');
  out.push(`findings: ${findingsLine(r)}; run without --matrix for the report`);
  out.push(`RESULT: ${r.result.text}`);
  return `${out.join('\n')}\n`;
}
