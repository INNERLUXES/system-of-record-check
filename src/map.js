// The integration map: the systems, the entities and fields each holds, which of them each system owns, and the flows
// between the systems. The map is a file in JSON (.json) or in the YAML subset of src/yaml.js (.yaml, .yml). Its form is
// strict: a key the tool does not know is a mistake with its line and a suggestion, and so is a value of the wrong
// kind, a name that is not a name, a field named twice, an owned field the system does not hold, a flow from a system to
// itself, a flow id used twice and a mode the configuration does not list. A mistake stops the run with exit code 2 and
// every problem listed, so a typo never leaves a part of the map unread. A flow that names a system, an entity or a field
// the map does not describe is read: that is a finding of the rule unknown-reference, not a mistake in the form.

import { DIRECTIONS } from './defaults.js';
import { isObject, kindOf, suggestion } from './config.js';
import { JsonError, jsonProblem, parseJson } from './json.js';
import { safeText } from './text.js';
import { asciiLower, isEmptyValue } from './words.js';
import { YamlError, parseYaml } from './yaml.js';

export const MAP_LIMITS = { maxSystems: 500, maxEntities: 1000, maxFields: 5000, maxFlows: 5000, maxText: 300, maxName: 80 };

// Every key of the map, by the place it is written in. docs/inputs.md describes each of them.
export const MAP_KEYS = {
  map: ['name', 'systems', 'flows'],
  system: ['name', 'kind', 'team', 'contact', 'entities'],
  entity: ['fields', 'owns'],
  flow: ['id', 'source', 'target', 'entity', 'fields', 'direction', 'mode', 'exception', 'note'],
  exception: ['reason', 'approvedBy']
};

// A name of a system, an entity, a field or a flow: a letter followed by letters, digits, dashes and underscores.
const NAME = /^[A-Za-z][A-Za-z0-9_-]*$/;
export const isName = (s) => typeof s === 'string' && s.length <= MAP_LIMITS.maxName && NAME.test(s);
const NAME_RULE = `a letter followed by letters, digits, - or _, at most ${MAP_LIMITS.maxName} characters`;

export class MapError extends Error {
  constructor(problems) {
    super(problems.join('; '));
    this.problems = problems;
  }
}

// The format of a map by the end of its name: JSON, YAML, or null.
export function formatOf(file) {
  const name = asciiLower(file);
  if (name.endsWith('.json')) return 'JSON';
  if (name.endsWith('.yaml') || name.endsWith('.yml')) return 'YAML';
  return null;
}

// The parsed map: { value, lines }, or MapError with the line of the problem.
export function parseMapText(text, file, format) {
  try {
    return format === 'JSON' ? parseJson(text) : parseYaml(text);
  } catch (error) {
    if (error instanceof JsonError) throw new MapError([`${file}: ${jsonProblem(error, text)}`]);
    if (error instanceof YamlError) throw new MapError([`${file}: line ${error.line}: ${error.reason}`]);
    throw error;
  }
}

// Checks a parsed map and builds the model the checks use, or throws MapError with every problem.
export function validateMap(value, lines, file, config) {
  const problems = [];
  const lineOf = (path) => {
    if (lines.has(path)) return lines.get(path);
    for (let p = path, prev = null; p && p !== prev; prev = p, p = p.replace(/(?:\.[A-Za-z0-9_-]+|\[\d+\])$/, '')) if (lines.has(p)) return lines.get(p);
    return lines.get('') ?? 1;
  };
  const fail = (path, message) => problems.push({ line: lineOf(path), text: `${file}: line ${lineOf(path)}: ${message}` });
  const refuse = (path, message, result) => {
    fail(path, message);
    return result;
  };
  const shown = (v) => safeText(v, 60);
  const keysOf = (path, object, known) => {
    for (const k of Object.keys(object)) if (!known.includes(k)) fail(path ? `${path}.${k}` : k, `"${shown(k)}" is not a key of ${path || 'the map'} (${known.join(', ')})${suggestion(k, known)}`);
  };
  const textOf = (path, v) => {
    if (v === undefined || v === null) return null;
    if (typeof v !== 'string') return refuse(path, `${path} must be a text, not ${kindOf(v)}`, null);
    if (v.length > MAP_LIMITS.maxText) return refuse(path, `${path} holds more than ${MAP_LIMITS.maxText} characters`, null);
    return v;
  };
  const nameOf = (path, v, what) => {
    if (typeof v !== 'string') return refuse(path, `${path} must be the name of ${what}, not ${kindOf(v)}`, null);
    if (!isName(v)) return refuse(path, `${path}: "${shown(v)}" is not a name: ${NAME_RULE}`, null);
    return v;
  };
  // A list of names: [{ name, at }] with the index of each in the list, every name once.
  const namesOf = (path, list, what, max) => {
    if (!Array.isArray(list)) return refuse(path, `${path} must be a list of ${what} names, not ${kindOf(list)}`, []);
    if (!list.length) return refuse(path, `${path} lists no ${what}`, []);
    if (list.length > max) return refuse(path, `${path} lists more than ${max.toLocaleString('en-US')} ${what}s`, []);
    const out = [];
    const seen = new Set();
    list.forEach((v, i) => {
      const name = nameOf(`${path}[${i}]`, v, `a ${what}`);
      if (name === null) return;
      if (seen.has(name)) fail(`${path}[${i}]`, `${path} names "${name}" twice`);
      else {
        seen.add(name);
        out.push({ name, at: i });
      }
    });
    return out;
  };

  if (!isObject(value)) throw new MapError([`${file}: line ${lineOf('')}: the map must be an object with systems and flows, not ${kindOf(value)}`]);
  keysOf('', value, MAP_KEYS.map);
  const model = { name: Object.hasOwn(value, 'name') ? textOf('name', value.name) : null, systems: [], flows: [] };

  if (!Object.hasOwn(value, 'systems')) fail('', 'the map has no systems; describe them under "systems"');
  else if (!isObject(value.systems)) fail('systems', `systems must be an object of systems by their ids, not ${kindOf(value.systems)}`);
  else {
    const ids = Object.keys(value.systems);
    if (!ids.length) fail('systems', 'systems describes no system');
    if (ids.length > MAP_LIMITS.maxSystems) fail('systems', `systems describes more than ${MAP_LIMITS.maxSystems} systems`);
    else for (const id of ids) readSystem(id, value.systems[id]);
  }

  function readSystem(id, s) {
    const path = `systems.${id}`;
    if (!isName(id)) return fail(path, `the system id "${shown(id)}" is not a name: ${NAME_RULE}`);
    if (!isObject(s)) return fail(path, `${path} must be an object with ${MAP_KEYS.system.join(', ')}, not ${kindOf(s)}`);
    keysOf(path, s, MAP_KEYS.system);
    const system = { id, name: textOf(`${path}.name`, s.name), kind: textOf(`${path}.kind`, s.kind), team: textOf(`${path}.team`, s.team), contact: textOf(`${path}.contact`, s.contact), line: lineOf(path), entities: [] };
    model.systems.push(system);
    if (!Object.hasOwn(s, 'entities') || s.entities === null) return undefined;
    if (!isObject(s.entities)) return fail(`${path}.entities`, `${path}.entities must be an object of entities by their names, not ${kindOf(s.entities)}`);
    const names = Object.keys(s.entities);
    if (names.length > MAP_LIMITS.maxEntities) return fail(`${path}.entities`, `${path}.entities holds more than ${MAP_LIMITS.maxEntities} entities`);
    for (const name of names) {
      const ep = `${path}.entities.${name}`;
      if (!isName(name)) {
        fail(ep, `the entity "${shown(name)}" of ${id} is not a name: ${NAME_RULE}`);
        continue;
      }
      const v = s.entities[name];
      let fieldsPath = `${ep}.fields`;
      let fieldsValue;
      let ownsValue = false;
      if (Array.isArray(v)) {
        fieldsPath = ep;
        fieldsValue = v;
      } else if (isObject(v)) {
        keysOf(ep, v, MAP_KEYS.entity);
        if (!Object.hasOwn(v, 'fields')) {
          fail(ep, `${ep} has no fields; list the fields ${id} holds`);
          continue;
        }
        fieldsValue = v.fields;
        if (Object.hasOwn(v, 'owns')) ownsValue = v.owns;
      } else {
        fail(ep, `${ep} must be a list of fields or an object with fields and owns, not ${kindOf(v)}`);
        continue;
      }
      const fields = namesOf(fieldsPath, fieldsValue, 'field', MAP_LIMITS.maxFields);
      const fieldSet = new Set(fields.map((f) => f.name));
      let owns = false;
      const ownsLines = new Map();
      if (ownsValue === true || ownsValue === false || ownsValue === null) owns = ownsValue === true;
      else if (Array.isArray(ownsValue)) {
        const list = [];
        for (const f of namesOf(`${ep}.owns`, ownsValue, 'field', MAP_LIMITS.maxFields)) {
          if (!fieldSet.has(f.name)) fail(`${ep}.owns[${f.at}]`, `${ep}.owns names "${f.name}", which is not one of its fields`);
          else {
            list.push(f.name);
            ownsLines.set(f.name, lineOf(`${ep}.owns[${f.at}]`));
          }
        }
        owns = list;
      } else fail(`${ep}.owns`, `${ep}.owns must be true, false or a list of its fields, not ${kindOf(ownsValue)}`);
      system.entities.push({
        entity: name,
        fields: fields.map((f) => f.name),
        fieldSet,
        fieldLines: new Map(fields.map((f) => [f.name, lineOf(`${fieldsPath}[${f.at}]`)])),
        owns,
        ownsLine: lineOf(Object.hasOwn(v, 'owns') && !Array.isArray(v) ? `${ep}.owns` : ep),
        ownsLines,
        line: lineOf(ep)
      });
    }
    return undefined;
  }

  if (Object.hasOwn(value, 'flows') && value.flows !== null) {
    if (!Array.isArray(value.flows)) fail('flows', `flows must be a list of flows, not ${kindOf(value.flows)}`);
    else if (value.flows.length > MAP_LIMITS.maxFlows) fail('flows', `flows lists more than ${MAP_LIMITS.maxFlows.toLocaleString('en-US')} flows`);
    else {
      const ids = new Map();
      value.flows.forEach((f, i) => readFlow(f, i, ids));
    }
  }

  function readFlow(f, i, ids) {
    const path = `flows[${i}]`;
    if (!isObject(f)) return fail(path, `${path} must be an object with source, target, entity, fields and mode, not ${kindOf(f)}`);
    keysOf(path, f, MAP_KEYS.flow);
    for (const k of ['source', 'target', 'entity', 'fields', 'mode']) if (!Object.hasOwn(f, k)) fail(path, `${path} has no ${k}`);
    const id = Object.hasOwn(f, 'id') ? nameOf(`${path}.id`, f.id, 'the flow') : null;
    if (id !== null) {
      if (ids.has(id)) fail(`${path}.id`, `the flow id "${id}" is used twice, first by flows[${ids.get(id)}]`);
      else ids.set(id, i);
    }
    const source = Object.hasOwn(f, 'source') ? nameOf(`${path}.source`, f.source, 'a system') : null;
    const target = Object.hasOwn(f, 'target') ? nameOf(`${path}.target`, f.target, 'a system') : null;
    const entity = Object.hasOwn(f, 'entity') ? nameOf(`${path}.entity`, f.entity, 'an entity') : null;
    const fields = Object.hasOwn(f, 'fields') ? namesOf(`${path}.fields`, f.fields, 'field', MAP_LIMITS.maxFields) : [];
    if (source !== null && source === target) fail(path, `${path} runs from ${source} to itself`);
    let direction = 'one-way';
    if (Object.hasOwn(f, 'direction')) {
      if (typeof f.direction === 'string' && DIRECTIONS.includes(asciiLower(f.direction))) direction = asciiLower(f.direction);
      else fail(`${path}.direction`, `${path}.direction must be ${DIRECTIONS.join(' or ')}, not ${typeof f.direction === 'string' ? `"${shown(f.direction)}"` : kindOf(f.direction)}`);
    }
    let mode = null;
    if (Object.hasOwn(f, 'mode')) {
      const m = typeof f.mode === 'string' ? asciiLower(f.mode.trim()) : null;
      if (m === null) fail(`${path}.mode`, `${path}.mode must be a text, not ${kindOf(f.mode)}`);
      else if (!config.modes.includes(m)) fail(`${path}.mode`, `${path}.mode "${shown(f.mode)}" is not one of the modes (${config.modes.join(', ')}); add it to modes in the configuration${suggestion(m, config.modes)}`);
      else mode = m;
    }
    let exception = null;
    if (Object.hasOwn(f, 'exception')) {
      const e = f.exception;
      if (e === true) exception = { reason: null, approvedBy: null };
      else if (isObject(e)) {
        keysOf(`${path}.exception`, e, MAP_KEYS.exception);
        exception = { reason: textOf(`${path}.exception.reason`, e.reason), approvedBy: textOf(`${path}.exception.approvedBy`, e.approvedBy) };
      } else if (e !== false && e !== null) fail(`${path}.exception`, `${path}.exception must be true or an object with reason and approvedBy, not ${kindOf(e)}`);
    }
    if (source === null || target === null || entity === null || !fields.length || mode === null) return undefined;
    model.flows.push({
      index: i,
      id,
      label: id ?? path,
      source,
      target,
      entity,
      fields: fields.map((x) => x.name),
      direction,
      mode,
      exception,
      approved: exception !== null && !isEmptyValue(exception.reason, config.emptyValues),
      note: textOf(`${path}.note`, f.note),
      line: lineOf(path)
    });
    return undefined;
  }

  // The problems in the order of their lines, so the list reads like the file.
  if (problems.length) throw new MapError(problems.sort((a, b) => a.line - b.line).map((p) => p.text));
  return model;
}

// Reads the text of a map file: the model, or MapError.
export function readMap(text, file, config) {
  const format = formatOf(file);
  if (format === null) throw new MapError([`${file}: the name must end in .json, .yaml or .yml, which says how the map is written`]);
  const { value, lines } = parseMapText(text, file, format);
  return { format, ...validateMap(value, lines, file, config) };
}
