# system-of-record-check

Checks an integration map, a JSON file or a YAML file of a plain subset that lists the systems of an enterprise (ERP, CRM, HR, finance, a web shop, a warehouse), the entities and fields each system holds, which system owns each of them as its system of record, and the flows of data between the systems. It reports what keeps the map from naming one owner for every piece of shared data: entities and fields held by several systems with no owner or with two, flows that write into the record of a system other than their source, copies that no flow from the owner feeds, flows that name a system, an entity or a field the map does not describe, fields synced both ways, and systems with no team or no contact. Each finding has the line of the map it points at, and the tool exits with a code a pipeline can act on.

A system of record is the one source that counts as the authority for a piece of data, and naming it settles which copy wins when systems disagree (https://en.wikipedia.org/wiki/System_of_record). The idea of a single source of truth goes one step further: each data element is edited in one place only, and the other places read it rather than change a copy of their own (https://en.wikipedia.org/wiki/Single_source_of_truth). Master data management exists because large organisations keep the same customers, products and employees in many systems at once. An integration map that leaves an owner out, names two, or lets a flow write into a record from the wrong side reads well in a diagram and still lets the copies drift apart, and this tool checks the map for those on every change.

- **One owner for shared data.** An entity held by several systems needs a system that claims it with `owns: true`; a field can have an owner of its own with `owns: [field]`, so the ERP can own the credit limit of a customer the CRM owns. No owner and two owners are errors.
- **No write-back into someone else's record.** A flow that carries a field whose owner is not its source is an error, both when it writes into the owner and when it passes on a copy, unless the flow is an approved exception with a reason.
- **Every copy fed from its owner.** A copy that no flow from the owner feeds is a warning: it is likely to drift.
- **A map that holds together.** Flows that name unknown systems, entities or fields are errors; a field synced both ways is a warning; a system with no team or contact is a warning.
- **An ownership matrix.** `--matrix` prints every entity and field against every system, with `O` for the owner and `C` for a copy.
- **Everything explained.** `--explain` shows the rule and the public sources behind each finding, and where a rule is the tool's own choice.
- Reports as text, JSON and GitHub workflow annotations, with an exit code for a pipeline: `0` no error, `1` an error, `2` usage or input error.
- Plain JavaScript, no dependencies.

```
npm test
```

```
tests 154
pass 151
fail 0
skipped 3
```

These are the summary lines that `npm test` prints at the end on Windows. The skipped tests are the ones that need a symbolic link, a device or file permissions (the map and the configuration named through a symbolic link, `/dev/zero` named as an input, and a file with no read access); they are guarded with `process.platform`, run on Linux and macOS, and none of them asserts a line. `npm run test:coverage` runs the same tests with coverage; their time limits are four times wider when coverage is on.

## Quick start

Requires Node 22 or newer. There is nothing to install.

```
git clone https://github.com/INNERLUXES/system-of-record-check.git
cd system-of-record-check
node bin/system-of-record-check.js examples/messy/integration-map.yaml
```

Or without a clone, on your own map:

```
npx --yes github:INNERLUXES/system-of-record-check docs/integration-map.yaml
```

`examples/` holds two made-up maps. `examples/clean/integration-map.json` is the map of a retailer with a sales CRM, a finance ERP, a web shop and a people system: every shared entity has one owner, the ERP owns the credit fields of a customer the CRM owns, every copy is fed from its owner, and the one flow that writes back is an approved exception with a reason. `examples/messy/integration-map.yaml` is the map of a wholesaler after a few years of projects, with one problem of most kinds. `examples/config.json` adds a mode and makes a copy with no feed and a loop errors.

## Usage

```
system-of-record-check <map-file> [options]
```

```
--config <file>           a configuration file (strict JSON) that changes the modes, the empty values, what a system
                          must name, or the level of the rules (default: the built-in configuration;
                          --print-defaults shows it)
--format <name>           text, json or github (default: text); github writes workflow commands that GitHub shows
                          as annotations on the map file
--json                    the same as --format json
--min-severity <level>    the lowest level of a finding that is shown: notice, warning, error (default: minSeverity of
                          the configuration, else notice)
--matrix                  print the ownership matrix in place of the report: entity.field by system, O for the
                          owner, C for a copy
--explain                 show the rule and the public sources behind each finding
--print-defaults          print the built-in configuration as a configuration file and exit
--help                    show the usage
--version                 show the version
```

The path in the report is relative to the folder you run the command in, with forward slashes on every system, followed by the line of the finding.

The report of the messy example starts with what was read and the counts, then the findings, errors first, then what the map holds:

```
system-of-record-check: examples/messy/integration-map.yaml
input: examples/messy/integration-map.yaml (YAML; 5 systems, 4 entities, 17 fields, 9 flows)
config: built-in defaults: modes api, batch, event, file, manual, cdc, etl; systems name a team and a contact; minimum severity notice
rules: missing-owner (error); conflicting-owner (error); write-back (error); unfed-copy (warning); unknown-reference (error); circular-sync (warning); system-without-owner (warning)
findings: 15 (9 error, 6 warning)

Findings (15)

  ERROR    conflicting-owner     examples/messy/integration-map.yaml:22
           the entity customer is claimed as owned by 2 systems, crm and legacy-crm; name one system of record

  ERROR    missing-owner         examples/messy/integration-map.yaml:33
           the entity product is held by 3 systems, erp, shop and wms, and none owns it; mark its system of record with "owns: true"

  ERROR    missing-owner         examples/messy/integration-map.yaml:36
           order.shippingAddress is held by 2 systems, erp and wms, and none owns it; shop, the owner of order, does not hold it

  ERROR    conflicting-owner     examples/messy/integration-map.yaml:50
           product.listPrice is claimed as owned by 2 systems, erp and shop; name one system of record

  ERROR    write-back            examples/messy/integration-map.yaml:71
           the flow credit-sync (two-way) writes customer.creditLimit from crm into erp, which owns that field; the owner should be the source

  ERROR    write-back            examples/messy/integration-map.yaml:86
           the flow email-shop-to-crm writes customer.email from shop into crm, which owns that field; the owner should be the source; it is marked as an exception but gives no reason

  ERROR    write-back            examples/messy/integration-map.yaml:109
           the flow order-erp-to-wms passes order.number from erp to wms, but shop owns that field; feed wms from shop

  ERROR    unknown-reference     examples/messy/integration-map.yaml:116
           the target of stock-wms-to-shop, shop, does not hold product.stockLevel

  ERROR    unknown-reference     examples/messy/integration-map.yaml:123
           the flow invoice-erp-to-billing names the target "billing", which is not a system of the map

  WARNING  system-without-owner  examples/messy/integration-map.yaml:15
           the system legacy-crm has no team and no contact ("TBD" names no one), so no one answers for the data it holds

  WARNING  system-without-owner  examples/messy/integration-map.yaml:55
           the system wms has no contact, so no one answers for the data it holds

  WARNING  unfed-copy            examples/messy/integration-map.yaml:60
           wms holds product.sku and product.name, owned by erp, and no flow from erp feeds them; the copy can drift from its owner

  WARNING  unfed-copy            examples/messy/integration-map.yaml:61
           wms holds order.number, owned by shop, and no flow from shop feeds it; the copy can drift from its owner

  WARNING  circular-sync         examples/messy/integration-map.yaml:71
           customer.creditLimit goes both ways between crm and erp through the two-way flow credit-sync; each side can overwrite the other

  WARNING  circular-sync         examples/messy/integration-map.yaml:86
           customer.email goes both ways between crm and shop through the flows email-crm-to-shop and email-shop-to-crm; each side can overwrite the other

Map: examples/messy/integration-map.yaml ("Fernbrook Supply integration map")

  systems   5: crm, legacy-crm, erp, shop and wms; 2 without a team or a contact
  entities  4: customer (2 owners), product (no owner), order (owner shop) and invoice (owner erp)
  fields    17 held, 11 held by two or more systems: 6 with one owner, 1 with no owner, 4 with two owners or more
  flows     9: 3 api, 3 event, 2 batch and 1 file; 1 two-way; 0 approved exceptions

This report checks the integration map only: which system it names as the owner of each entity and field, and the flows it lists. It does not connect to the systems or compare the data they hold.

RESULT: FAIL - 9 errors (and 6 warnings)
```

With `--explain`, each finding also shows the rule, the points of the public pages it rests on and, where there is one, the tool's own choice:

```
  WARNING  unfed-copy            examples/messy/integration-map.yaml:60
           wms holds product.sku and product.name, owned by erp, and no flow from erp feeds them; the copy can drift from its owner
           rule: a field with one owner, held by another system that is not the target of any flow from the owner that carries the field
           basis: when the same data is kept in more than one place, the copies can come to hold different values for the same thing (Data redundancy (Wikipedia), https://en.wikipedia.org/wiki/Data_redundancy)
           basis: organisations keep many copies of the same data in separate systems, and master data management exists to keep that data consistent and accurate across all of them (Master data management (Wikipedia), https://en.wikipedia.org/wiki/Master_data_management)
           the tool's own choice: only a flow straight from the owner counts as a feed; a copy fed through another copy is still reported
```

The clean example passes:

```
system-of-record-check: examples/clean/integration-map.json
input: examples/clean/integration-map.json (JSON; 4 systems, 5 entities, 21 fields, 7 flows)
config: examples/config.json (Kestrel Valley integration rules): modes api, batch, event, file, manual, cdc, etl, sftp; systems name a team and a contact; minimum severity notice
rules: missing-owner (error); conflicting-owner (error); write-back (error); unfed-copy (error); unknown-reference (error); circular-sync (error); system-without-owner (warning)
findings: 0

Findings (0)

  none

Map: examples/clean/integration-map.json ("Kestrel Valley Outdoor integration map")

  systems   4: crm, erp, shop and hr; 0 without a team or a contact
  entities  5: customer (owner crm), product (owner erp), order (owner shop), invoice (owner erp) and employee (owner hr)
  fields    21 held, 13 held by two or more systems: 13 with one owner, 0 with no owner, 0 with two owners or more
  flows     7: 3 batch, 2 api and 2 event; 0 two-way; 1 approved exception

This report checks the integration map only: which system it names as the owner of each entity and field, and the flows it lists. It does not connect to the systems or compare the data they hold.

RESULT: PASS - no error
```

## What it checks

| Rule | Key | Default level | Finds |
| --- | --- | --- | --- |
| `missing-owner` | `rules.missingOwner` | error | an entity held by two or more systems that no system owns, or a field held by two or more systems that no system owns and the owner of its entity does not hold |
| `conflicting-owner` | `rules.conflictingOwner` | error | an entity or a field claimed as owned by two or more systems |
| `write-back` | `rules.writeBack` | error | a flow that carries a field whose one owner is not its source, into the owner or on to a third system, with no approved exception |
| `unfed-copy` | `rules.unfedCopy` | warning | a copy of a field that no flow from its owner feeds |
| `unknown-reference` | `rules.unknownReference` | error | a flow that names a system, an entity or a field the map does not describe, or that one of its ends does not hold |
| `circular-sync` | `rules.circularSync` | warning | a field that flows from one system to another and back, through a two-way flow or two one-way flows |
| `system-without-owner` | `rules.systemWithoutOwner` | warning | a system with no team or no contact, or one such as TBD that names no one |

[docs/method.md](docs/method.md) says exactly what each rule looks at and what it cannot see, and [docs/rules-and-sources.md](docs/rules-and-sources.md) gives the points of the public pages each rule rests on.

## The map

```yaml
systems:
  crm:
    team: Sales operations
    contact: sales-ops channel
    entities:
      customer:
        fields: [accountNumber, legalName, creditLimit]
        owns: true
  erp:
    team: Finance systems
    contact: finance-systems channel
    entities:
      customer:
        fields: [accountNumber, legalName, creditLimit]
        owns: [creditLimit]
flows:
  - id: customer-crm-to-erp
    source: crm
    target: erp
    entity: customer
    fields: [accountNumber, legalName]
    mode: event
  - id: credit-erp-to-crm
    source: erp
    target: crm
    entity: customer
    fields: [creditLimit]
    mode: batch
```

`systems` is an object of systems by id, each with `name`, `kind`, `team`, `contact` and `entities`. An entity is a list of the fields the system holds, or an object with `fields` and `owns`. `flows` is a list of flows, each with `source`, `target`, `entity`, `fields` and `mode`, and optionally `id`, `direction` (`one-way` or `two-way`), `exception` (with `reason` and `approvedBy`) and `note`. The same map can be written in JSON with the same keys. A key the tool does not know is an error with its line and a suggestion, so `own: true` never passes as a claim. [docs/inputs.md](docs/inputs.md) describes every key.

The YAML reader reads mappings, lists, short lists in brackets, quoted and plain values and comments, with spaces for indentation. Anchors, aliases, tags, block scalars, mappings in braces, values over several lines and several documents are refused with their line rather than read in a way YAML does not mean.

## Owners

A system claims an entity with `owns: true`, which makes it the owner of the entity and of every field of it that it holds, or claims fields one by one with `owns: [field, ...]`. A claim on a field comes before a claim on its entity: in the map above the CRM owns the customer and the ERP owns `customer.creditLimit`, and that is not a conflict. A field has one owner when exactly one system claims it, or, with no claim on the field, when exactly one of the systems that claim its entity holds it. Every other holder keeps a copy, and every copy needs a flow from the owner that carries it.

## Flows and exceptions

A flow runs from its source to its target, and a two-way flow also runs back; each way is checked on its own. A flow carries the fields of its list that both its ends hold. When a field it carries has an owner that is not the system the flow comes from, the flow either writes into the owner (`writes ... into erp, which owns that field`) or passes on a copy (`passes ... but shop owns that field`), and both are `write-back`. A flow that has to do this, such as a web shop that sends a changed email address back to the CRM, is marked with `exception` and a `reason`; a reason that is empty or says nothing, such as TBD, does not approve it. A field that goes both ways between two systems is `circular-sync`, unless one of the flows is an approved exception.

The modes a flow may name are api, batch, event, file, manual, cdc and etl; a mode of your own is added in the configuration.

## The ownership matrix

`--matrix` prints a row for every entity and every field of it and a column for every system, with `O` for the owner, `C` for a copy and `.` for a system that does not hold it, and a note where shared data has no owner or more than one. The exit code is the same as without `--matrix`. The matrix of the messy example:

```
system-of-record-check: examples/messy/integration-map.yaml
ownership matrix: 5 systems, 4 entities, 17 fields; O owner (system of record), C copy, . not held

                        crm  legacy-crm  erp  shop  wms
customer                O    O           C    C     .    2 owners
customer.accountNumber  O    O           C    .     .    2 owners
customer.legalName      O    O           C    .     .    2 owners
customer.email          O    .           .    C     .
customer.phone          O    O           .    .     .    2 owners
customer.creditLimit    C    .           O    .     .
product                 .    .           C    C     C    no owner
product.sku             .    .           O    C     C
product.name            .    .           O    C     C
product.listPrice       .    .           O    O     .    2 owners
product.description     .    .           .    O     .
product.weight          .    .           .    .     C
product.stockLevel      .    .           .    .     C
order                   .    .           C    O     C
order.number            .    .           C    O     C
order.total             .    .           C    O     .
order.shippingAddress   .    .           C    .     C    no owner
invoice                 .    .           O    .     .
invoice.number          .    .           O    .     .
invoice.total           .    .           O    .     .
invoice.dueDate         .    .           O    .     .

findings: 15 (9 error, 6 warning); run without --matrix for the report
RESULT: FAIL - 9 errors (and 6 warnings)
```

## The configuration file

```json
{
  "name": "Kestrel Valley integration rules",
  "modes": { "add": ["sftp"] },
  "rules": { "unfedCopy": "error", "circularSync": "error" }
}
```

A configuration changes the defaults key by key: the modes a flow may name, the values that say nothing (TBD, none, n/a and the like), whether a system must name a team, a contact or both, the level of every rule, and the minimum severity. A list is a JSON array that replaces the built-in list, or an object with `replace`, `add` and `remove`. A key the tool does not know is an error with its line and a suggestion, and a key named twice is refused. [docs/inputs.md](docs/inputs.md) describes every key, and `--print-defaults` writes the whole default configuration out.

## Formats

- `text`: for a terminal: what was read, the counts, the findings with the file and line, what the map holds, the notes, the notice and the result. With `--explain` also the rule, the points of the public pages and the tool's own choice behind each finding.
- `json` (or `--json`): the whole report: the input, the configuration, the systems, the owner and the holders of every entity and field, the flows, every finding with its line, the totals, the result, the notes and the notice.
- `github`: one workflow command per finding, `::error`, `::warning` or `::notice` with the file and line, which GitHub shows as an annotation on the map in the pull request, then a summary line. The characters a command gives a meaning to are escaped. The first two errors of the messy example:

```
::error file=examples/messy/integration-map.yaml,line=22,title=system-of-record-check conflicting-owner::the entity customer is claimed as owned by 2 systems, crm and legacy-crm; name one system of record
::error file=examples/messy/integration-map.yaml,line=33,title=system-of-record-check missing-owner::the entity product is held by 3 systems, erp, shop and wms, and none owns it; mark its system of record with "owns: true"
```

## Exit codes

`0`: no finding at the level error. `1`: at least one finding at the level error; a rule can be raised to error or lowered to warning or notice in the configuration. `2`: a usage or input error: no map or two, an unknown option, an option given twice, a URL in place of a path, a file that cannot be read, a folder, a symbolic link, a name that does not end in `.json`, `.yaml` or `.yml`, a file over its limit, a binary, UTF-16 or invalid UTF-8 file, JSON that is not valid, YAML outside the subset, a map with an unknown key, a value of the wrong kind or a mode the configuration does not list, or a configuration with an unknown key or a key named twice. With exit code `2` the tool gives no result and prints the problems on standard error.

## Limits

The tool reads the map, not the systems: a map with no finding can still miss a system or a flow. Two names for one field are two fields, a flow that carries a field into a system counts as a write of it, a copy kept up to date by hand has no feed, a loop through three systems is not seen as a loop, and the YAML reader reads a subset. [docs/limits.md](docs/limits.md) lists these, with the size limits: 2 MB for the map, 500 systems, 5,000 flows, 5,000 fields of an entity, 500 findings listed per rule. [docs/threat-model.md](docs/threat-model.md) lists the risks of reading maps written by many hands and their controls, and [docs/secure-defaults.md](docs/secure-defaults.md) the defaults and how to run the tool in a pipeline.

## Architecture

Plain ES modules in `src/`, with no dependencies.

| File | Job |
| --- | --- |
| `src/cli.js` | the command line, the usage and the exit codes |
| `src/check.js` | reads the configuration and the map, runs the checks and builds the report of the run |
| `src/files.js` | the bounded reading of the two files, with no link followed |
| `src/json.js`, `src/yaml.js` | the strict JSON reader and the reader of the YAML subset, both with the line of every value |
| `src/map.js` | the form of the map: every key, value and name, and the model the checks use |
| `src/ownership.js` | who owns each entity and field, and who holds copies |
| `src/analyse.js` | the checks of the map |
| `src/config.js`, `src/defaults.js` | the configuration file over the defaults, and the default modes, words and levels |
| `src/rules.js` | the seven rules and the result |
| `src/report.js`, `src/text.js`, `src/size.js`, `src/words.js` | the text, JSON, GitHub and matrix output, the cleaning of text from the input, number formats, and words compared as words |
| `src/data.js` | the public pages and the points the checks rest on, in this project's own words |
| `tools/check.mjs`, `tools/example.mjs` | the repository checks, and the examples with their real output |

## Where the facts come from

| Fact | Source |
| --- | --- |
| One source counts as the authority for each piece of data | System of record, Wikipedia, https://en.wikipedia.org/wiki/System_of_record |
| Shared core data kept consistent across many systems, with data owners and stewards | Master data management, Wikipedia, https://en.wikipedia.org/wiki/Master_data_management |
| Each data element edited in one place only | Single source of truth, Wikipedia, https://en.wikipedia.org/wiki/Single_source_of_truth |
| Copies of the same data come to hold different values | Data redundancy, Wikipedia, https://en.wikipedia.org/wiki/Data_redundancy |
| Changes to more than one copy have to be reconciled | Data synchronization, Wikipedia, https://en.wikipedia.org/wiki/Data_synchronization |
| Someone documents the data and answers questions about it | Data steward, Wikipedia, https://en.wikipedia.org/wiki/Data_steward |
| Indentation, list entries, comments and unique keys in YAML | YAML 1.2.2, https://yaml.org/spec/1.2.2/ |
| Annotations from workflow commands | GitHub Docs, https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands |
| Repeated names in a JSON object | RFC 8259, https://www.rfc-editor.org/rfc/rfc8259 |

[research/sources.md](research/sources.md) has a note on each page, in this project's own words.

## Background

An integration map is where an enterprise writes down which system is the truth for each piece of its data, so that every new interface between its ERP, CRM, HR and finance systems can be checked against it before it is built. How such systems are planned and joined up is described on the page [Enterprise Software Solutions](https://innerluxes.dev/software-development/enterprise/solutions).

## License

MIT
