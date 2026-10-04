// The built-in configuration: the modes a flow may name, the values that say nothing, what a system must name to have
// an owner, and the level of every rule. docs/inputs.md describes every key, and --print-defaults writes all of this out
// as a configuration file.

// The ways a flow can move data. A flow names one of them; a team adds its own in the configuration.
export const DEFAULT_MODES = ['api', 'batch', 'event', 'file', 'manual', 'cdc', 'etl'];

// The directions of a flow: from the source to the target, or both ways.
export const DIRECTIONS = ['one-way', 'two-way'];

// Values that name no one and give no reason, compared as whole lowercase words (src/words.js).
export const DEFAULT_EMPTY_VALUES = ['tbd', 'tba', 'todo', 'none', 'n a', 'na', 'unknown', 'unassigned', 'nobody', 'no one', 'not assigned'];

// What a system must name for the rule system-without-owner: its team, its contact, or both.
export const SYSTEM_OWNER_KEYS = ['team', 'contact'];
export const DEFAULT_SYSTEM_OWNER = ['team', 'contact'];

export const DEFAULT_RULES = {
  missingOwner: 'error',
  conflictingOwner: 'error',
  writeBack: 'error',
  unfedCopy: 'warning',
  unknownReference: 'error',
  circularSync: 'warning',
  systemWithoutOwner: 'warning'
};

// The lowest level of a finding that is shown.
export const DEFAULT_MIN_SEVERITY = 'notice';
