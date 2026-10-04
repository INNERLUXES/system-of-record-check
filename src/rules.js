// The seven rules and the result. Each rule names the points of the public pages it rests on (src/data.js), and says
// where it is the tool's own choice; docs/method.md says exactly what each rule looks at and what it cannot see. A rule
// whose level is "off" is not run. The checks themselves are in src/analyse.js.

import { LEVELS } from './data.js';
import { plural } from './size.js';

export const RULES = [
  {
    id: 'missing-owner',
    key: 'missingOwner',
    title: 'shared data with no system of record',
    basis: ['sorAuthority', 'mdmCopies'],
    own: 'an entity held by two or more systems needs an owner of its own even when each of its fields has one, because someone must decide which record is the customer; a field is reported on its own only when its entity has one owner who does not hold it',
    rule: () => 'an entity held by two or more systems that no system claims with "owns: true", or a field held by two or more systems that no system claims and the owner of its entity does not hold'
  },
  {
    id: 'conflicting-owner',
    key: 'conflictingOwner',
    title: 'data claimed by two or more owners',
    basis: ['sorAuthority', 'ssotEditOnce'],
    own: 'a claim on a field comes before a claim on its entity, so a field owner inside an entity owned by another system is not a conflict',
    rule: () => 'an entity that two or more systems claim with "owns: true", or a field that two or more systems name in "owns"'
  },
  {
    id: 'write-back',
    key: 'writeBack',
    title: 'a flow that writes a field whose owner is not its source',
    basis: ['ssotEditOnce', 'sorAuthority'],
    own: 'a flow that passes on a copy from a system that does not own it is reported too, because the target is then fed from a copy and not from the owner; a flow marked as an exception counts as approved only with a reason that is not empty or TBD',
    rule: (c) => `a flow, or the return way of a two-way flow, that carries a field held by both its ends whose one owner is not the system it comes from, unless the flow has an exception with a reason that is not empty or one of ${c.emptyValues.slice(0, 3).map((v) => `"${v}"`).join(', ')}`
  },
  {
    id: 'unfed-copy',
    key: 'unfedCopy',
    title: 'a copy that no flow from the owner feeds',
    basis: ['redundancyDrift', 'mdmCopies'],
    own: 'only a flow straight from the owner counts as a feed; a copy fed through another copy is still reported',
    rule: () => 'a field with one owner, held by another system that is not the target of any flow from the owner that carries the field'
  },
  {
    id: 'unknown-reference',
    key: 'unknownReference',
    title: 'a flow that names something the map does not describe',
    basis: ['sorTraceable'],
    own: null,
    rule: () => 'a flow whose source or target is not a system of the map, whose entity no system holds or one of its ends does not hold, or whose fields one of its ends does not hold'
  },
  {
    id: 'circular-sync',
    key: 'circularSync',
    title: 'a field synced both ways between two systems',
    basis: ['syncConsistency', 'ssotEditOnce'],
    own: 'a loop in which one of the flows is an approved exception is not reported, because the reason of the exception says why the field goes both ways',
    rule: () => 'a field that flows from one system to another and back, through a two-way flow or two one-way flows, with no approved exception among them'
  },
  {
    id: 'system-without-owner',
    key: 'systemWithoutOwner',
    title: 'a system with no team or no contact',
    basis: ['mdmRoles', 'stewardContact'],
    own: null,
    rule: (c) => `a system whose ${c.systemOwner.join(' or ') || 'nothing'} is missing, empty or a value that names no one`
  }
];

export const ruleById = (id) => RULES.find((r) => r.id === id);

// True when a level is at or above another.
export const atOrAbove = (level, min) => LEVELS.indexOf(level) >= LEVELS.indexOf(min);

// The result: the run fails when a finding is at the level error. { pass, errors, byLevel, text }.
export function decide(findings) {
  const byLevel = { error: 0, warning: 0, notice: 0 };
  for (const f of findings) byLevel[f.level] += 1;
  const below = ['warning', 'notice'].filter((l) => byLevel[l]).map((l) => plural(byLevel[l], l));
  const text = byLevel.error ? `FAIL - ${plural(byLevel.error, 'error')}${below.length ? ` (and ${below.join(', ')})` : ''}` : `PASS - no error${below.length ? ` (${below.join(', ')})` : ''}`;
  return { pass: byLevel.error === 0, errors: byLevel.error, byLevel, text };
}
