# Rules and sources

Every rule rests on points of public pages, written in this project's own words; this document lists them, with the
choices that are the tool's own. The same points are in src/data.js and are shown by `--explain`; research/sources.md
has a longer note on each page.

## Rules

### `missing-owner`

- A system of record is the one source that counts as authoritative for a given piece of data, and naming it settles which copy wins when systems disagree. ([System of record (Wikipedia)](https://en.wikipedia.org/wiki/System_of_record))
- Organisations keep many copies of the same data in separate systems, and master data management exists to keep that data consistent and accurate across all of them. ([Master data management (Wikipedia)](https://en.wikipedia.org/wiki/Master_data_management))
- The tool's own choice: an entity held by two or more systems needs an owner of its own even when each of its fields has one, because someone must decide which record is the customer; a field is reported on its own only when its entity has one owner who does not hold it.

### `conflicting-owner`

- A system of record is the one source that counts as authoritative for a given piece of data, and naming it settles which copy wins when systems disagree. ([System of record (Wikipedia)](https://en.wikipedia.org/wiki/System_of_record))
- Each data element is mastered, or edited, in one place only, and the other places read or refer to that one instead of changing a copy of their own. ([Single source of truth (Wikipedia)](https://en.wikipedia.org/wiki/Single_source_of_truth))
- The tool's own choice: a claim on a field comes before a claim on its entity, so a field owner inside an entity owned by another system is not a conflict.

### `write-back`

- Each data element is mastered, or edited, in one place only, and the other places read or refer to that one instead of changing a copy of their own. ([Single source of truth (Wikipedia)](https://en.wikipedia.org/wiki/Single_source_of_truth))
- A system of record is the one source that counts as authoritative for a given piece of data, and naming it settles which copy wins when systems disagree. ([System of record (Wikipedia)](https://en.wikipedia.org/wiki/System_of_record))
- The tool's own choice: a flow that passes on a copy from a system that does not own it is reported too, because the target is then fed from a copy and not from the owner; a flow marked as an exception counts as approved only with a reason that is not empty or TBD.

### `unfed-copy`

- When the same data is kept in more than one place, the copies can come to hold different values for the same thing. ([Data redundancy (Wikipedia)](https://en.wikipedia.org/wiki/Data_redundancy))
- Organisations keep many copies of the same data in separate systems, and master data management exists to keep that data consistent and accurate across all of them. ([Master data management (Wikipedia)](https://en.wikipedia.org/wiki/Master_data_management))
- The tool's own choice: only a flow straight from the owner counts as a feed; a copy fed through another copy is still reported.

### `unknown-reference`

- Data can be trusted when it can be traced back to a known good source, which a link to a system that is not described cannot give. ([System of record (Wikipedia)](https://en.wikipedia.org/wiki/System_of_record))

### `circular-sync`

- Synchronisation keeps a source and a target consistent over time, and when more than one copy is changed the changes have to be reconciled. ([Data synchronization (Wikipedia)](https://en.wikipedia.org/wiki/Data_synchronization))
- Each data element is mastered, or edited, in one place only, and the other places read or refer to that one instead of changing a copy of their own. ([Single source of truth (Wikipedia)](https://en.wikipedia.org/wiki/Single_source_of_truth))
- The tool's own choice: a loop in which one of the flows is an approved exception is not reported, because the reason of the exception says why the field goes both ways.

### `system-without-owner`

- Master data management names roles such as data owners and data stewards, so that someone is accountable for each set of data. ([Master data management (Wikipedia)](https://en.wikipedia.org/wiki/Master_data_management))
- A data steward keeps the definitions and the sources of authority of the data documented and is the contact for questions about it. ([Data steward (Wikipedia)](https://en.wikipedia.org/wiki/Data_steward))

## The readers and the output

- Block structure is set by indentation with spaces, never tabs, a dash and a space start an entry of a list, a # starts a comment, and the keys of a mapping must be unique. ([YAML Ain't Markup Language, version 1.2.2](https://yaml.org/spec/1.2.2/))
- A line of output such as ::error file=...,line=...::message becomes an annotation on that file and line in the run. ([Workflow commands for GitHub Actions (GitHub Docs)](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands))
- When an object repeats a name the behaviour of the software that reads it cannot be predicted, so the map and configuration readers refuse a repeated name. ([RFC 8259, The JSON Data Interchange Format](https://www.rfc-editor.org/rfc/rfc8259))

## Pages

| Page | Address |
| --- | --- |
| System of record (Wikipedia) | https://en.wikipedia.org/wiki/System_of_record |
| Master data management (Wikipedia) | https://en.wikipedia.org/wiki/Master_data_management |
| Single source of truth (Wikipedia) | https://en.wikipedia.org/wiki/Single_source_of_truth |
| Data redundancy (Wikipedia) | https://en.wikipedia.org/wiki/Data_redundancy |
| Data synchronization (Wikipedia) | https://en.wikipedia.org/wiki/Data_synchronization |
| Data steward (Wikipedia) | https://en.wikipedia.org/wiki/Data_steward |
| YAML Ain't Markup Language, version 1.2.2 | https://yaml.org/spec/1.2.2/ |
| Workflow commands for GitHub Actions (GitHub Docs) | https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands |
| RFC 8259, The JSON Data Interchange Format | https://www.rfc-editor.org/rfc/rfc8259 |

## What is the tool's own

The pages say why shared data needs one owner, why copies drift and why someone must answer for the data; they do not give a form for an integration map. The form of the map (systems by id, entities with their fields, `owns` as `true` or a list of fields, flows with a source, a target, an entity, fields, a direction and a mode), the rule that a claim on a field comes before a claim on its entity, the treatment of a flow that passes on a copy as a write-back, the approved exception with a reason, the words that name no one, and the level of every rule are the tool's own choices. The words and the levels can be changed in the configuration (docs/inputs.md), and docs/method.md says exactly how each is used.
