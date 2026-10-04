// Who owns what, worked out from the map. A system claims an entity with "owns: true", which makes it the system of
// record of the entity and of every field of it that it holds, or claims fields one by one with "owns: [field, ...]".
// A claim on a field comes before a claim on its entity: when the CRM owns the customer and the ERP claims
// customer.creditLimit, the ERP owns that field. A field has one owner when exactly one system claims it, or, with no
// claim on the field, when exactly one of the systems that claim its entity holds it. docs/method.md says the same.

const key = (system, entity) => `${system}\n${entity}`;

// The ownership of a model: { entities, byName, entityOf, holds }. entities lists every entity in the order the map
// first names it, with { entity, holders, claims, owner, fields, fieldMap }; each field has { field, holders, claims,
// owners, owner, via }.
export function ownershipOf(model) {
  const held = new Map();
  const byName = new Map();
  const entities = [];
  for (const s of model.systems) {
    for (const e of s.entities) {
      held.set(key(s.id, e.entity), e);
      let rec = byName.get(e.entity);
      if (!rec) {
        rec = { entity: e.entity, holders: [], claims: [], owner: null, fields: [], fieldMap: new Map() };
        byName.set(e.entity, rec);
        entities.push(rec);
      }
      rec.holders.push(s.id);
      if (e.owns === true) rec.claims.push(s.id);
      const owned = new Set(Array.isArray(e.owns) ? e.owns : []);
      for (const f of e.fields) {
        let fr = rec.fieldMap.get(f);
        if (!fr) {
          fr = { field: f, holders: [], claims: [], owners: [], owner: null, via: null };
          rec.fieldMap.set(f, fr);
          rec.fields.push(fr);
        }
        fr.holders.push(s.id);
        if (owned.has(f)) fr.claims.push(s.id);
      }
    }
  }
  for (const rec of entities) {
    rec.owner = rec.claims.length === 1 ? rec.claims[0] : null;
    for (const fr of rec.fields) {
      if (fr.claims.length) {
        fr.owners = fr.claims;
        fr.via = 'field';
      } else {
        fr.owners = rec.claims.filter((id) => fr.holders.includes(id));
        fr.via = fr.owners.length ? 'entity' : null;
      }
      fr.owner = fr.owners.length === 1 ? fr.owners[0] : null;
    }
  }
  return {
    entities,
    byName,
    // The entity as a system holds it, or undefined.
    entityOf: (system, entity) => held.get(key(system, entity)),
    holds: (system, entity, field) => Boolean(held.get(key(system, entity))?.fieldSet.has(field))
  };
}
