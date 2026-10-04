# Inputs

## The map

```
system-of-record-check <map-file> [options]
```

The map is one file, in JSON (`.json`) or in the YAML subset of docs/method.md (`.yaml`, `.yml`). A map the tool
reads well looks like this:

```yaml
name: Integration map

systems:
  crm:
    name: Sales CRM
    kind: crm
    team: Sales operations
    contact: sales-ops channel
    entities:
      customer:
        fields: [accountNumber, legalName, email, creditLimit]
        owns: true

  erp:
    name: Finance ERP
    kind: erp
    team: Finance systems
    contact: finance-systems channel
    entities:
      customer:
        fields: [accountNumber, legalName, creditLimit]
        owns: [creditLimit]
      invoice:
        fields: [number, total]
        owns: true

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

### The keys of the map

| Key | Value |
| --- | --- |
| `name` | a text: the name of the map, shown in the report |
| `systems` | an object of systems by id; required, with at least one system |
| `flows` | a list of flows; may be left out |

### The keys of a system

| Key | Value |
| --- | --- |
| `name` | a text: the name of the system |
| `kind` | a text: what the system is, such as erp, crm, hr or finance; shown in the JSON output only |
| `team` | a text: the team that owns the system |
| `contact` | a text: where to ask about the system, such as a channel or a queue |
| `entities` | an object of entities by name; may be left out for a system that holds nothing |

### The keys of an entity

An entity is a list of the fields the system holds, or an object:

| Key | Value |
| --- | --- |
| `fields` | a list of field names; required, with at least one field |
| `owns` | `true` when the system is the system of record of the entity, `false` (the default), or a list of the fields it owns, each one of its fields |

### The keys of a flow

| Key | Value |
| --- | --- |
| `id` | a name for the flow, used in the findings; without it the flow is named `flows[n]` |
| `source` | the system the data comes from; required |
| `target` | the system the data goes to; required, not the source |
| `entity` | the entity the flow carries; required |
| `fields` | the fields the flow carries; required, with at least one field |
| `direction` | `one-way` (the default) or `two-way` |
| `mode` | how the data moves, one of the modes of the configuration; required |
| `exception` | `true`, or an object with `reason` and `approvedBy`: the flow may write into the record of another system; it is approved only with a reason |
| `note` | a text, for people; not checked |

### The keys of an exception

| Key | Value |
| --- | --- |
| `reason` | a text: why the flow may write into the record of another system; the exception is approved only when the reason is not empty and is not a value that says nothing, such as TBD |
| `approvedBy` | a text: who approved the exception; shown in the JSON output, not checked |

## Options

| Option | What it does |
| --- | --- |
| `--config <file>` | a configuration file (strict JSON) over the built-in configuration |
| `--format <name>` | `text` (default), `json`, or `github` for workflow commands |
| `--json` | the same as `--format json` |
| `--min-severity <level>` | hide the findings below `notice`, `warning` or `error`; wins over `minSeverity` of the configuration |
| `--matrix` | print the ownership matrix in place of the report; text only |
| `--explain` | show the rule, the points of the public pages and the tool's own choice behind each finding |
| `--print-defaults` | print the built-in configuration as a configuration file and exit |
| `--help`, `--version` | show the usage or the version and exit |

An option given twice, an unknown option, two maps, a URL in place of a path, `-` for standard input, `--json`
with another format, and `--matrix` with `--json`, `--format json`, `--format github` or `--explain` are usage errors
(exit code `2`).

## The configuration file

The configuration is a strict JSON object. Every key is optional, and a key the tool does not know is an error with
its line and a suggestion. A list is a JSON array, which replaces the built-in list, or an object with `replace`, `add`
and `remove`, applied in that order; removing an entry that is not on the list, or adding one that is, is an error.
`--print-defaults` writes the whole default configuration out.

```json
{
  "name": "Integration review rules",
  "modes": { "add": ["sftp"] },
  "emptyValues": { "add": ["ask the service desk"] },
  "systemOwner": ["team", "contact"],
  "rules": { "unfedCopy": "error", "circularSync": "error" },
  "minSeverity": "notice"
}
```

| Key | Value | Default |
| --- | --- | --- |
| `name` | a text of 1 to 120 characters, shown on the config line of the report | none |
| `modes` | the modes a flow may name: lowercase words of letters, digits and dashes | api, batch, event, file, manual, cdc, etl |
| `emptyValues` | values that name no one and give no reason, compared as whole lowercase words | tbd, tba, todo, none, n a, na, unknown, unassigned, nobody, no one, not assigned |
| `systemOwner` | what a system must name for `system-without-owner`: `team`, `contact`, both, or neither | team, contact |
| `rules` | the level of each rule: `error`, `warning`, `notice` or `off` | see below |
| `minSeverity` | the lowest level of a finding that is shown | notice |

The keys of `rules`, with their defaults:

| Key | Rule | Default |
| --- | --- | --- |
| `rules.missingOwner` | `missing-owner` | error |
| `rules.conflictingOwner` | `conflicting-owner` | error |
| `rules.writeBack` | `write-back` | error |
| `rules.unfedCopy` | `unfed-copy` | warning |
| `rules.unknownReference` | `unknown-reference` | error |
| `rules.circularSync` | `circular-sync` | warning |
| `rules.systemWithoutOwner` | `system-without-owner` | warning |

Lists hold at most 500 entries of at most 120 characters. A configuration whose `modes` list ends up empty is refused,
because no flow could name a mode.
