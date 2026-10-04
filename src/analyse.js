// The checks of one map. Each finding is { rule, line, found }: the rule id, the line of the map it points at, and what
// was found, in words. The level of a finding comes from the configuration (src/check.js). docs/method.md says what each
// rule looks at.

import { ownershipOf } from './ownership.js';
import { listText, plural } from './size.js';
import { isEmptyValue, normalizePhrase } from './words.js';

// A list of fields of an entity for a sentence: customer.email, customer.phone and 2 more.
export function fieldList(entity, fields, max = 4) {
  return listText(fields.map((f) => `${entity}.${f}`), max);
}

const them = (n) => (n === 1 ? 'it' : 'them');
const thatField = (n) => (n === 1 ? 'that field' : 'those fields');
const edgeKey = (from, to, entity, field) => `${from}\n${to}\n${entity}\n${field}`;

export function analyse(model, config) {
  const own = ownershipOf(model);
  const findings = [];
  const add = (rule, line, found) => findings.push({ rule, line, found });
  const order = new Map(model.systems.map((s, i) => [s.id, i]));
  const known = (id) => order.has(id);

  // system-without-owner: a team and a contact, as the configuration asks.
  let systemsWithoutOwner = 0;
  for (const s of model.systems) {
    const missing = config.systemOwner.filter((k) => isEmptyValue(s[k], config.emptyValues));
    if (!missing.length) continue;
    systemsWithoutOwner += 1;
    const parts = missing.map((k) => (s[k] && normalizePhrase(s[k]) ? `no ${k} ("${s[k]}" names no one)` : `no ${k}`));
    add('system-without-owner', s.line, `the system ${s.id} has ${parts.join(' and ')}, so no one answers for the data it holds`);
  }

  // missing-owner and conflicting-owner, entity by entity.
  for (const rec of own.entities) {
    const at = (system) => own.entityOf(system, rec.entity);
    if (rec.claims.length >= 2) {
      add('conflicting-owner', at(rec.claims[1]).ownsLine, `the entity ${rec.entity} is claimed as owned by ${plural(rec.claims.length, 'system')}, ${listText(rec.claims, 5)}; name one system of record`);
    } else if (rec.claims.length === 0 && rec.holders.length >= 2) {
      add('missing-owner', at(rec.holders[0]).line, `the entity ${rec.entity} is held by ${plural(rec.holders.length, 'system')}, ${listText(rec.holders, 5)}, and none owns it; mark its system of record with "owns: true"`);
    }
    for (const fr of rec.fields) {
      if (fr.claims.length >= 2) {
        add('conflicting-owner', at(fr.claims[1]).ownsLines.get(fr.field), `${rec.entity}.${fr.field} is claimed as owned by ${plural(fr.claims.length, 'system')}, ${listText(fr.claims, 5)}; name one system of record`);
      } else if (rec.claims.length === 1 && fr.owners.length === 0 && fr.holders.length >= 2) {
        add('missing-owner', at(fr.holders[0]).fieldLines.get(fr.field), `${rec.entity}.${fr.field} is held by ${plural(fr.holders.length, 'system')}, ${listText(fr.holders, 5)}, and none owns it; ${rec.claims[0]}, the owner of ${rec.entity}, does not hold it`);
      }
    }
  }

  // The flows: unknown-reference, write-back, and the edges every flow makes, for unfed-copy and circular-sync.
  const edges = new Map();
  const modes = new Map();
  let twoWay = 0;
  let approved = 0;
  for (const fl of model.flows) {
    modes.set(fl.mode, (modes.get(fl.mode) ?? 0) + 1);
    if (fl.direction === 'two-way') twoWay += 1;
    if (fl.approved) approved += 1;
    const name = `the flow ${fl.label}`;
    const unknown = [['source', fl.source], ['target', fl.target]].filter(([, id]) => !known(id));
    if (unknown.length) {
      add('unknown-reference', fl.line, `${name} names ${unknown.map(([w, id]) => `the ${w} "${id}"`).join(' and ')}, which ${unknown.length === 1 ? 'is not a system' : 'are not systems'} of the map`);
      continue;
    }
    const rec = own.byName.get(fl.entity);
    if (!rec) {
      add('unknown-reference', fl.line, `${name} carries the entity "${fl.entity}", which no system of the map holds`);
      continue;
    }
    let ends = true;
    for (const [w, id] of [['source', fl.source], ['target', fl.target]]) {
      const held = own.entityOf(id, fl.entity);
      if (!held) {
        add('unknown-reference', fl.line, `the ${w} of ${fl.label}, ${id}, does not hold the entity ${fl.entity}`);
        ends = false;
        continue;
      }
      const missing = fl.fields.filter((f) => !held.fieldSet.has(f));
      if (missing.length) add('unknown-reference', fl.line, `the ${w} of ${fl.label}, ${id}, does not hold ${fieldList(fl.entity, missing)}`);
    }
    if (!ends) continue;
    const carried = fl.fields.filter((f) => own.holds(fl.source, fl.entity, f) && own.holds(fl.target, fl.entity, f));
    const ways = fl.direction === 'two-way' ? [[fl.source, fl.target], [fl.target, fl.source]] : [[fl.source, fl.target]];
    const label = fl.direction === 'two-way' ? `${name} (two-way)` : name;
    for (const [from, to] of ways) {
      const byOwner = new Map();
      for (const f of carried) {
        const k = edgeKey(from, to, fl.entity, f);
        if (!edges.has(k)) edges.set(k, []);
        edges.get(k).push(fl);
        const owner = rec.fieldMap.get(f).owner;
        if (owner !== null && owner !== from) {
          if (!byOwner.has(owner)) byOwner.set(owner, []);
          byOwner.get(owner).push(f);
        }
      }
      if (fl.approved) continue;
      const unexplained = fl.exception !== null ? '; it is marked as an exception but gives no reason' : '';
      for (const [owner, fields] of byOwner) {
        const list = fieldList(fl.entity, fields);
        if (owner === to) add('write-back', fl.line, `${label} writes ${list} from ${from} into ${to}, which owns ${thatField(fields.length)}; the owner should be the source${unexplained}`);
        else add('write-back', fl.line, `${label} passes ${list} from ${from} to ${to}, but ${owner} owns ${thatField(fields.length)}; feed ${to} from ${owner}${unexplained}`);
      }
    }
  }

  // unfed-copy: every copy of a field with one owner needs a flow from the owner that carries it.
  for (const rec of own.entities) {
    const groups = new Map();
    for (const fr of rec.fields) {
      if (fr.owner === null) continue;
      for (const h of fr.holders) {
        if (h === fr.owner || edges.has(edgeKey(fr.owner, h, rec.entity, fr.field))) continue;
        const k = `${h}\n${fr.owner}`;
        if (!groups.has(k)) groups.set(k, { holder: h, owner: fr.owner, fields: [] });
        groups.get(k).fields.push(fr.field);
      }
    }
    const sorted = [...groups.values()].sort((a, b) => order.get(a.holder) - order.get(b.holder) || order.get(a.owner) - order.get(b.owner));
    for (const g of sorted) {
      const line = own.entityOf(g.holder, rec.entity).fieldLines.get(g.fields[0]);
      add('unfed-copy', line, `${g.holder} holds ${fieldList(rec.entity, g.fields)}, owned by ${g.owner}, and no flow from ${g.owner} feeds ${them(g.fields.length)}; the copy can drift from its owner`);
    }
  }

  // circular-sync: a field that goes from one system to another and back.
  const loops = new Map();
  for (const [k, flows] of edges) {
    const [from, to, entity, field] = k.split('\n');
    if (order.get(from) > order.get(to)) continue;
    const back = edges.get(edgeKey(to, from, entity, field));
    if (!back) continue;
    const lk = `${from}\n${to}\n${entity}`;
    if (!loops.has(lk)) loops.set(lk, { a: from, b: to, entity, fields: [], flows: new Set() });
    const loop = loops.get(lk);
    loop.fields.push(field);
    for (const fl of [...flows, ...back]) loop.flows.add(fl);
  }
  for (const loop of loops.values()) {
    const flows = [...loop.flows].sort((x, y) => x.index - y.index);
    if (flows.some((fl) => fl.approved)) continue;
    const through = flows.length === 1 ? `the two-way flow ${flows[0].label}` : `the flows ${listText(flows.map((fl) => fl.label), 4)}`;
    const n = loop.fields.length;
    add('circular-sync', flows.at(-1).line, `${fieldList(loop.entity, loop.fields)} ${n === 1 ? 'goes' : 'go'} both ways between ${loop.a} and ${loop.b} through ${through}; each side can overwrite the other`);
  }

  // What the map holds, for the report.
  let fields = 0;
  const shared = { all: 0, owned: 0, unowned: 0, conflicting: 0 };
  for (const rec of own.entities) {
    for (const fr of rec.fields) {
      fields += 1;
      if (fr.holders.length < 2) continue;
      shared.all += 1;
      if (fr.owners.length === 1) shared.owned += 1;
      else if (fr.owners.length === 0) shared.unowned += 1;
      else shared.conflicting += 1;
    }
  }
  const summary = {
    name: model.name,
    format: model.format,
    systems: model.systems.map((s) => ({ id: s.id, name: s.name, kind: s.kind, team: s.team, contact: s.contact, entities: s.entities.map((e) => e.entity) })),
    entities: own.entities.map((rec) => ({
      entity: rec.entity,
      owner: rec.owner,
      claims: rec.claims,
      holders: rec.holders,
      fields: rec.fields.map((fr) => ({ field: fr.field, owner: fr.owner, owners: fr.owners, holders: fr.holders }))
    })),
    flows: model.flows.map((fl) => ({ id: fl.id, source: fl.source, target: fl.target, entity: fl.entity, fields: fl.fields, direction: fl.direction, mode: fl.mode, exception: fl.exception, approved: fl.approved })),
    counts: { systems: model.systems.length, systemsWithoutOwner, entities: own.entities.length, fields, shared, flows: model.flows.length, modes: Object.fromEntries(modes), twoWay, approved }
  };
  return { summary, findings };
}
