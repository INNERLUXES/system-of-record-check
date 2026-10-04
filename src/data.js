// The public pages the checks rest on, and what each says, written in this project's own words. research/sources.md
// lists the same pages with a longer note on each, and test/data.test.js checks that every page here is listed there and
// that every rule names points that exist. The code in src/ uses these constants and never writes a reason of its own
// in a report.

export const SOURCES = [
  { id: 'systemOfRecord', title: 'System of record (Wikipedia)', url: 'https://en.wikipedia.org/wiki/System_of_record' },
  { id: 'masterData', title: 'Master data management (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Master_data_management' },
  { id: 'singleSource', title: 'Single source of truth (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Single_source_of_truth' },
  { id: 'redundancy', title: 'Data redundancy (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Data_redundancy' },
  { id: 'synchronization', title: 'Data synchronization (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Data_synchronization' },
  { id: 'steward', title: 'Data steward (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Data_steward' },
  { id: 'yaml', title: 'YAML Ain\'t Markup Language, version 1.2.2', url: 'https://yaml.org/spec/1.2.2/' },
  { id: 'githubCommands', title: 'Workflow commands for GitHub Actions (GitHub Docs)', url: 'https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands' },
  { id: 'rfc8259', title: 'RFC 8259, The JSON Data Interchange Format', url: 'https://www.rfc-editor.org/rfc/rfc8259' }
];

export const source = (id) => SOURCES.find((s) => s.id === id);

// What a page says, in this project's own words. Each point names its page.
export const POINTS = {
  sorAuthority: { source: 'systemOfRecord', text: 'a system of record is the one source that counts as authoritative for a given piece of data, and naming it settles which copy wins when systems disagree' },
  sorTraceable: { source: 'systemOfRecord', text: 'data can be trusted when it can be traced back to a known good source, which a link to a system that is not described cannot give' },
  mdmCopies: { source: 'masterData', text: 'organisations keep many copies of the same data in separate systems, and master data management exists to keep that data consistent and accurate across all of them' },
  mdmRoles: { source: 'masterData', text: 'master data management names roles such as data owners and data stewards, so that someone is accountable for each set of data' },
  ssotEditOnce: { source: 'singleSource', text: 'each data element is mastered, or edited, in one place only, and the other places read or refer to that one instead of changing a copy of their own' },
  redundancyDrift: { source: 'redundancy', text: 'when the same data is kept in more than one place, the copies can come to hold different values for the same thing' },
  syncConsistency: { source: 'synchronization', text: 'synchronisation keeps a source and a target consistent over time, and when more than one copy is changed the changes have to be reconciled' },
  stewardContact: { source: 'steward', text: 'a data steward keeps the definitions and the sources of authority of the data documented and is the contact for questions about it' },
  yamlBlocks: { source: 'yaml', text: 'block structure is set by indentation with spaces, never tabs, a dash and a space start an entry of a list, a # starts a comment, and the keys of a mapping must be unique' },
  githubAnnotations: { source: 'githubCommands', text: 'a line of output such as ::error file=...,line=...::message becomes an annotation on that file and line in the run' },
  jsonRepeatedNames: { source: 'rfc8259', text: 'when an object repeats a name the behaviour of the software that reads it cannot be predicted, so the map and configuration readers refuse a repeated name' }
};

// The page of a point.
export const pointPage = (key) => source(POINTS[key].source);

// The levels of a finding, from the lowest. A finding at the level error makes the run fail.
export const LEVELS = ['notice', 'warning', 'error'];

// The sentence every report ends with, before the result.
export const NOTICE = 'This report checks the integration map only: which system it names as the owner of each entity and field, and the flows it lists. It does not connect to the systems or compare the data they hold.';
